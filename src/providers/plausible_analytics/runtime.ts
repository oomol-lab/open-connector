import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const plausibleDefaultBaseUrl = "https://plausible.io";

const statsPath = "/api/v2/query";
const eventsPath = "/api/event";

interface PlausibleContext {
  apiKey: string;
  siteId?: string;
  baseUrl?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type PlausibleHandler = (input: Record<string, unknown>, context: PlausibleContext) => Promise<unknown>;

export const plausibleAnalyticsActionHandlers: Record<string, PlausibleHandler> = {
  query_stats(input, context) {
    return requestPlausibleStats(context, buildStatsQueryPayload(input, context));
  },
  get_timeseries_stats(input, context) {
    const interval = requiredString(input.interval, "interval");
    return requestPlausibleStats(context, buildStatsQueryPayload(input, context, { dimensions: [interval] }));
  },
  get_breakdown_stats(input, context) {
    const dimension = requiredString(input.dimension, "dimension");
    return requestPlausibleStats(context, buildStatsQueryPayload(input, context, { dimensions: [dimension] }));
  },
  record_event(input, context) {
    return recordEvent(input, context);
  },
};

export async function validatePlausibleAnalyticsCredential(
  apiKey: string,
  siteIdValue: string | undefined,
  baseUrlValue: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const siteId = normalizeRequiredSiteId(siteIdValue);
  const baseUrl = normalizePlausibleBaseUrl(baseUrlValue);
  await requestPlausibleJson({
    context: { apiKey, siteId, baseUrl, fetcher, signal },
    path: statsPath,
    auth: "bearer",
    phase: "validate",
    body: {
      site_id: siteId,
      date_range: "7d",
      metrics: ["visitors"],
    },
    notFoundAsInvalidInput: true,
  });
  return {
    profile: { accountId: buildProviderAccountId(baseUrl, siteId), displayName: `Plausible ${siteId}` },
    grantedScopes: [],
    metadata: { baseUrl, siteId, validationEndpoint: statsPath },
  };
}

async function requestPlausibleStats(context: PlausibleContext, payload: Record<string, unknown>): Promise<unknown> {
  const response = await requestPlausibleJson({
    context,
    path: statsPath,
    auth: "bearer",
    phase: "execute",
    body: payload,
    notFoundAsInvalidInput: true,
  });
  const record = optionalRecord(response);
  if (!record || !Array.isArray(record.results)) {
    throw new ProviderRequestError(502, "plausible stats response is missing results");
  }
  return record;
}

async function recordEvent(input: Record<string, unknown>, context: PlausibleContext): Promise<unknown> {
  return requestPlausibleJson({
    context,
    path: eventsPath,
    auth: "none",
    phase: "execute",
    body: compactObject({
      domain: resolveActionSiteId(input, context, "domain"),
      name: requiredString(input.name, "name"),
      url: requiredString(input.url, "url"),
      referrer: optionalString(input.referrer),
      props: optionalRecord(input.props),
      revenue: optionalRecord(input.revenue),
      interactive: typeof input.interactive === "boolean" ? input.interactive : undefined,
    }),
    headers: compactObject({
      "User-Agent": optionalString(input.userAgent) ?? providerUserAgent,
      "X-Forwarded-For": optionalString(input.forwardedFor),
      "X-Debug-Request": input.debugRequest === true ? "true" : undefined,
    }) as Record<string, string>,
  });
}

async function requestPlausibleJson(input: {
  context: PlausibleContext;
  path: string;
  auth: "bearer" | "none";
  phase: "validate" | "execute";
  body?: unknown;
  headers?: Record<string, string>;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const headers = new Headers(input.headers);
  if (input.auth === "bearer") {
    headers.set("Authorization", `Bearer ${input.context.apiKey}`);
  }
  headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await input.context.fetcher(
      buildPlausibleUrl(normalizePlausibleBaseUrl(input.context.baseUrl), input.path),
      {
        method: "POST",
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: input.context.signal,
      },
    );
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `plausible request failed: ${error.message}` : "plausible request failed",
    );
  }
  const payload = await readPlausiblePayload(response);
  if (!response.ok) {
    throw createPlausibleError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

async function readPlausiblePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createPlausibleError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.detail) ??
    `plausible request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if ((status === 404 && notFoundAsInvalidInput) || status === 400 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function buildStatsQueryPayload(
  input: Record<string, unknown>,
  context: PlausibleContext,
  overrides?: { dimensions?: string[] },
): Record<string, unknown> {
  return compactObject({
    site_id: resolveActionSiteId(input, context, "site_id"),
    date_range: input.date_range,
    metrics: input.metrics,
    dimensions: overrides?.dimensions ?? asOptionalStringArray(input.dimensions),
    filters: Array.isArray(input.filters) ? input.filters : undefined,
    order_by: Array.isArray(input.order_by) ? input.order_by : undefined,
    include: optionalRecord(input.include),
    pagination: optionalRecord(input.pagination),
  });
}

function resolveActionSiteId(
  input: Record<string, unknown>,
  context: PlausibleContext,
  fieldKey: "site_id" | "domain",
): string {
  const directValue = optionalString(input[fieldKey]);
  if (directValue) {
    return directValue;
  }
  if (context.siteId) {
    return context.siteId;
  }
  throw new ProviderRequestError(400, `${fieldKey} is required when the connection has no default siteId`);
}

export function normalizePlausibleBaseUrl(value?: string): string {
  if (!value) {
    return plausibleDefaultBaseUrl;
  }
  const url = assertPublicHttpUrl(value, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Base URL must use https");
  }
  let pathname = url.pathname;
  while (pathname.endsWith("/") && pathname.length > 1) {
    pathname = pathname.slice(0, -1);
  }
  return `${url.origin}${pathname}`;
}

function normalizeRequiredSiteId(value: unknown): string {
  const siteId = optionalString(value);
  if (!siteId) {
    throw new ProviderRequestError(400, "Site ID is required");
  }
  return siteId;
}

function buildPlausibleUrl(baseUrl: string, path: string): URL {
  return new URL(path.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function buildProviderAccountId(baseUrl: string, siteId: string): string {
  return `plausible:${new URL(baseUrl).host}:${siteId}`;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}
