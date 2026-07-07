import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { SimpleAnalyticsActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const simpleAnalyticsBaseUrl: string = "https://simpleanalytics.com";
const simpleAnalyticsEventsUrl = "https://queue.simpleanalyticscdn.com/events";
const simpleAnalyticsStatsFields = [
  "pageviews",
  "visitors",
  "pages",
  "countries",
  "referrers",
  "browser_names",
  "os_names",
  "device_types",
  "seconds_on_page",
];

interface SimpleAnalyticsContext extends ApiKeyProviderContext {
  userId?: string;
}

interface SimpleAnalyticsRequest {
  url: string;
  method: "GET" | "POST";
  apiKey?: string;
  userId?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}

type SimpleAnalyticsActionHandler = (
  input: Record<string, unknown>,
  context: SimpleAnalyticsContext,
) => Promise<unknown>;

export const simpleAnalyticsActionHandlers: Record<SimpleAnalyticsActionName, SimpleAnalyticsActionHandler> = {
  list_websites(_input, context) {
    return listSimpleAnalyticsWebsites(context);
  },
  get_aggregated_stats(input, context) {
    return getSimpleAnalyticsAggregatedStats(input, context);
  },
  export_data_points(input, context) {
    return exportSimpleAnalyticsDataPoints(input, context);
  },
  send_event(input, context) {
    return sendSimpleAnalyticsEvent(input, context);
  },
};

export async function validateSimpleAnalyticsCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const userId = requireSimpleAnalyticsUserId(values);
  const payload = await requestSimpleAnalyticsJson<Record<string, unknown>>(
    {
      url: `${simpleAnalyticsBaseUrl}/api/websites`,
      apiKey,
      userId,
      method: "GET",
      signal,
    },
    fetcher,
    "validate",
  );
  const websites = readWebsiteSummaries(payload);
  const hostnames = websites.flatMap((website) => (typeof website.hostname === "string" ? [website.hostname] : []));

  return {
    profile: {
      accountId: userId,
      displayName: hostnames[0] ?? userId,
    },
    grantedScopes: [],
    metadata: compactObject({
      userId,
      validationEndpoint: "/api/websites",
      websiteCount: hostnames.length,
      websites: hostnames,
    }),
  };
}

async function listSimpleAnalyticsWebsites(context: SimpleAnalyticsContext): Promise<unknown> {
  const payload = await requestSimpleAnalyticsJson<Record<string, unknown>>(
    {
      url: `${simpleAnalyticsBaseUrl}/api/websites`,
      apiKey: context.apiKey,
      userId: requireSimpleAnalyticsUserId(context),
      method: "GET",
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );

  return {
    success: readOptionalBoolean(payload.success) ?? true,
    websites: readWebsiteSummaries(payload).map((website) => ({
      hostname: optionalString(website.hostname) ?? "",
      is_public: readOptionalBoolean(website.is_public) ?? false,
      timezone: optionalString(website.timezone) ?? "",
      has_ssl: readOptionalBoolean(website.has_ssl) ?? false,
      has_script: readOptionalBoolean(website.has_script) ?? false,
      pageviews: optionalInteger(website.pageviews) ?? 0,
      events: optionalInteger(website.events) ?? 0,
      own_hostname: optionalString(website.own_hostname),
    })),
  };
}

async function getSimpleAnalyticsAggregatedStats(
  input: Record<string, unknown>,
  context: SimpleAnalyticsContext,
): Promise<unknown> {
  const hostname = requireInputString(input, "hostname");
  const url = new URL(`${simpleAnalyticsBaseUrl}/${encodeURIComponent(hostname)}.json`);
  url.searchParams.set(
    "fields",
    [...simpleAnalyticsStatsFields, ...(readOptionalBoolean(input.includeHistogram) ? ["histogram"] : [])].join(","),
  );
  url.searchParams.set("info", "false");
  url.searchParams.set("version", "6");

  for (const [field, queryKey] of [
    ["start", "start"],
    ["end", "end"],
    ["timezone", "timezone"],
    ["page", "page"],
    ["referrer", "referrer"],
  ]) {
    const value = optionalString(input[field]);
    if (value) {
      url.searchParams.set(queryKey, value);
    }
  }
  if (Array.isArray(input.eventNames) && input.eventNames.length > 0) {
    url.searchParams.set("events", input.eventNames.map(String).join(","));
  }

  const payload = await requestSimpleAnalyticsJson<Record<string, unknown>>(
    {
      url: url.toString(),
      apiKey: context.apiKey,
      method: "GET",
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );

  return compactObject({
    ok: readOptionalBoolean(payload.ok),
    docs: optionalString(payload.docs),
    hostname: optionalString(payload.hostname),
    url: optionalString(payload.url),
    path: optionalString(payload.path),
    start: optionalString(payload.start),
    end: optionalString(payload.end),
    version: optionalInteger(payload.version),
    timezone: optionalString(payload.timezone),
    pageviews: optionalInteger(payload.pageviews),
    visitors: optionalInteger(payload.visitors),
    seconds_on_page: optionalInteger(payload.seconds_on_page),
    pages: readMetricBuckets(payload.pages),
    countries: readMetricBuckets(payload.countries),
    referrers: readMetricBuckets(payload.referrers),
    browser_names: readMetricBuckets(payload.browser_names),
    os_names: readMetricBuckets(payload.os_names),
    device_types: readMetricBuckets(payload.device_types),
    histogram: readHistogram(payload.histogram),
    events: readEventCounts(payload.events),
    generated_in_ms: optionalInteger(payload.generated_in_ms),
    raw: payload,
  });
}

async function exportSimpleAnalyticsDataPoints(
  input: Record<string, unknown>,
  context: SimpleAnalyticsContext,
): Promise<unknown> {
  const url = new URL(`${simpleAnalyticsBaseUrl}/api/export/datapoints`);
  url.searchParams.set("version", "6");
  url.searchParams.set("format", optionalString(input.format) ?? "csv");
  url.searchParams.set("hostname", requireInputString(input, "hostname"));
  url.searchParams.set("start", requireInputString(input, "start"));
  url.searchParams.set("end", requireInputString(input, "end"));

  for (const [field, queryKey] of [
    ["timezone", "timezone"],
    ["type", "type"],
  ]) {
    const value = optionalString(input[field]);
    if (value) {
      url.searchParams.set(queryKey, value);
    }
  }
  if (Array.isArray(input.fields) && input.fields.length > 0) {
    url.searchParams.set("fields", input.fields.map(String).join(","));
  }

  const format = url.searchParams.get("format") ?? "csv";
  const response = await requestSimpleAnalyticsResponse(
    {
      url: url.toString(),
      apiKey: context.apiKey,
      userId: requireSimpleAnalyticsUserId(context),
      method: "GET",
      signal: context.signal,
    },
    context.fetcher,
  );

  if (!response.ok) {
    throw mapSimpleAnalyticsError(await readSimpleAnalyticsError(response), response.status, "execute");
  }

  if (format === "csv") {
    return {
      format: "csv",
      csv: await response.text(),
    };
  }

  const payload = (await response.json()) as unknown;
  const datapoints = readExportDatapoints(payload);
  const meta = readExportMeta(payload);

  return compactObject({
    format: "json",
    datapoints,
    meta,
    raw: payload,
  });
}

async function sendSimpleAnalyticsEvent(
  input: Record<string, unknown>,
  context: SimpleAnalyticsContext,
): Promise<unknown> {
  const type = requireInputString(input, "type");
  const ua = requireInputString(input, "ua");
  const metadata = optionalRecord(input.metadata)
    ? normalizeMetadata(input.metadata as Record<string, unknown>)
    : undefined;
  const response = await requestSimpleAnalyticsResponse(
    {
      url: simpleAnalyticsEventsUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ua,
      },
      body: compactObject({
        type,
        hostname: requireInputString(input, "hostname"),
        event: type === "pageview" ? "pageview" : requireInputString(input, "event"),
        path: optionalString(input.path),
        referrer: optionalString(input.referrer),
        source: optionalString(input.source),
        campaign: optionalString(input.campaign),
        metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
        ua,
      }),
      signal: context.signal,
    },
    context.fetcher,
  );

  if (!response.ok) {
    throw mapSimpleAnalyticsError(await readSimpleAnalyticsError(response), response.status, "execute");
  }

  const text = await response.text();
  if (!text) {
    return { success: true };
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return {
      success: readOptionalBoolean(payload.success) ?? true,
      message: optionalString(payload.message),
    };
  } catch {
    return {
      success: true,
      message: text,
    };
  }
}

async function requestSimpleAnalyticsJson<T extends Record<string, unknown>>(
  request: SimpleAnalyticsRequest,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
): Promise<T> {
  const response = await requestSimpleAnalyticsResponse(request, fetcher);
  if (!response.ok) {
    throw mapSimpleAnalyticsError(await readSimpleAnalyticsError(response), response.status, phase);
  }
  return (await response.json()) as T;
}

async function requestSimpleAnalyticsResponse(
  request: SimpleAnalyticsRequest,
  fetcher: typeof fetch,
): Promise<Response> {
  try {
    return await fetcher(request.url, {
      method: request.method,
      headers: buildSimpleAnalyticsHeaders(request),
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: request.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `simple_analytics request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildSimpleAnalyticsHeaders(request: SimpleAnalyticsRequest): Record<string, string> {
  return compactObject({
    "Api-Key": request.apiKey,
    "User-Id": request.userId,
    "Content-Type": request.headers?.["Content-Type"] ?? "application/json",
    "User-Agent": request.headers?.["User-Agent"] ?? providerUserAgent,
  }) as Record<string, string>;
}

async function readSimpleAnalyticsError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return (
      optionalString(payload.error) ??
      optionalString(payload.message) ??
      `simple_analytics request failed with ${response.status}`
    );
  } catch {
    return text || `simple_analytics request failed with ${response.status}`;
  }
}

function mapSimpleAnalyticsError(message: string, status: number, phase: "validate" | "execute"): ProviderRequestError {
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status, message);
}

function readWebsiteSummaries(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const websites = payload.websites;
  if (!Array.isArray(websites)) {
    return [];
  }
  return websites.filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)));
}

function readMetricBuckets(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)))
    .map((item) =>
      compactObject({
        value: optionalString(item.value),
        pageviews: optionalInteger(item.pageviews),
        visitors: optionalInteger(item.visitors),
        seconds_on_page: optionalInteger(item.seconds_on_page),
      }),
    );
}

function readHistogram(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)))
    .map((item) =>
      compactObject({
        date: optionalString(item.date),
        pageviews: optionalInteger(item.pageviews),
        visitors: optionalInteger(item.visitors),
      }),
    );
}

function readEventCounts(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)))
    .map((item) =>
      compactObject({
        name: optionalString(item.name),
        total: optionalInteger(item.total),
      }),
    );
}

function readExportDatapoints(value: unknown): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)));
  }
  const record = optionalRecord(value);
  if (!record || !Array.isArray(record.datapoints)) {
    return undefined;
  }
  return record.datapoints.filter((item): item is Record<string, unknown> => Boolean(optionalRecord(item)));
}

function readExportMeta(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  const meta = optionalRecord(record?.meta);
  if (!meta) {
    return undefined;
  }

  return compactObject({
    amount: optionalInteger(meta.amount),
    finishedInMs: optionalInteger(meta.finishedInMs),
  });
}

function requireSimpleAnalyticsUserId(input: { userId?: unknown } | undefined): string {
  const userId = input ? optionalString(input.userId) : undefined;
  if (!userId) {
    throw new ProviderRequestError(400, "User ID is required");
  }
  return userId;
}

function requireInputString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeMetadata(input: Record<string, unknown>): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [[key, value]];
      }
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return [[key, value.toISOString()]];
      }
      return [];
    }),
  );
}
