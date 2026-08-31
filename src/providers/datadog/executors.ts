import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { datadogApiKeySites, datadogOAuthSites } from "./sites.ts";

const service = "datadog";
const datadogDefaultRequestTimeoutMs = 30_000;
const datadogCredentialHelpUrl = "https://docs.datadoghq.com/account_management/api-app-keys/";

type DatadogRequestPhase = "validate" | "execute";

interface DatadogActionContext {
  baseUrl: string;
  apiKey?: string;
  applicationKey?: string;
  authorization?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const datadogActionHandlers: ProviderActionHandlers<"datadog", ProviderRuntimeHandler<DatadogActionContext>> = {
  validate_api_key(_input, context) {
    if (context.authorization) {
      return datadogRequestJson(
        "/api/v2/current_user",
        { method: "GET" },
        { ...context, requireApplicationKey: false },
      ).then((payload) => ({
        valid: true,
        raw: optionalRecord(payload) ?? {},
      }));
    }
    return datadogRequestJson("/api/v1/validate", { method: "GET" }, { ...context, requireApplicationKey: false }).then(
      (payload) => ({
        valid: optionalRecord(payload)?.valid === true,
        raw: optionalRecord(payload) ?? {},
      }),
    );
  },
  list_monitors(input, context) {
    return datadogRequestJson(
      "/api/v1/monitor",
      {
        method: "GET",
        query: compactObject({
          group_states: joinStringArray(input.groupStates),
          name: optionalString(input.name),
          tags: joinStringArray(input.tags),
          monitor_tags: joinStringArray(input.monitorTags),
          with_downtimes: booleanQuery(input.withDowntimes),
        }),
      },
      { ...context, requireApplicationKey: true },
    ).then((payload) => {
      const raw = asObjectArrayOrEmpty(payload);
      return {
        monitors: raw.map(normalizeMonitor),
        raw,
      };
    });
  },
  get_monitor(input, context) {
    return datadogRequestJson(
      `/api/v1/monitor/${encodeURIComponent(String(input.monitorId))}`,
      {
        method: "GET",
        query: compactObject({
          group_states: joinStringArray(input.groupStates),
          with_downtimes: booleanQuery(input.withDowntimes),
        }),
      },
      { ...context, requireApplicationKey: true },
    ).then((payload) => ({ monitor: normalizeMonitor(payload) }));
  },
  search_monitors(input, context) {
    return datadogRequestJson(
      "/api/v1/monitor/search",
      {
        method: "GET",
        query: compactObject({
          query: optionalString(input.query),
          page: numberQuery(input.page),
          per_page: numberQuery(input.perPage),
          sort: optionalString(input.sort),
        }),
      },
      { ...context, requireApplicationKey: true },
    ).then((payload) => {
      const record = optionalRecord(payload) ?? {};
      const monitors = asObjectArrayOrEmpty(record.monitors);
      return {
        monitors: monitors.map(normalizeMonitorSearchResult),
        counts: optionalRecord(record.counts) ?? null,
        metadata: optionalRecord(record.metadata) ?? null,
        raw: record,
      };
    });
  },
  query_timeseries_points(input, context) {
    return datadogRequestJson(
      "/api/v1/query",
      {
        method: "GET",
        query: compactObject({
          from: String(input.from),
          to: String(input.to),
          query: optionalString(input.query),
        }),
      },
      { ...context, requireApplicationKey: true },
    ).then((payload) => {
      const record = optionalRecord(payload) ?? {};
      return {
        status: optionalString(record.status) ?? null,
        resType: optionalString(record.res_type) ?? null,
        series: asObjectArrayOrEmpty(record.series).map(normalizeTimeseries),
        raw: record,
      };
    });
  },
  list_metrics(input, context) {
    return datadogRequestJson(
      "/api/v1/metrics",
      {
        method: "GET",
        query: compactObject({
          from: String(input.from),
          host: optionalString(input.host),
          tag_filter: optionalString(input.tagFilter),
        }),
      },
      { ...context, requireApplicationKey: true },
    ).then((payload) => {
      const record = optionalRecord(payload) ?? {};
      return {
        metrics: asStringArrayOrEmpty(record.metrics),
        raw: record,
      };
    });
  },
  get_metric_metadata(input, context) {
    return datadogRequestJson(
      `/api/v1/metrics/${encodeURIComponent(String(input.metricName))}`,
      { method: "GET" },
      { ...context, requireApplicationKey: true },
    ).then((payload) => ({ metric: normalizeMetricMetadata(payload) }));
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DatadogActionContext>({
  service,
  handlers: datadogActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DatadogActionContext> {
    return resolveDatadogActionContext(context, fetcher);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const providerContext = await resolveDatadogActionContext(context, providerFetch);
    const url = createProviderProxyUrl(providerContext.baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    for (const [name, value] of Object.entries(datadogHeaders(providerContext))) {
      headers.set(name, value);
    }
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await providerFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDatadogCredential(input.apiKey, input.values, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateDatadogOAuthCredential(input, fetcher, signal);
  },
};

async function validateDatadogCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const site = normalizeDatadogSite(values.site);
  const payload = await datadogRequestJson(
    "/api/v1/validate",
    { method: "GET" },
    {
      baseUrl: datadogApiKeySites[site]!,
      apiKey,
      fetcher,
      signal,
      phase: "validate",
      requireApplicationKey: false,
    },
  );
  const record = optionalRecord(payload) ?? {};

  return {
    profile: {
      accountId: site,
      displayName: `Datadog ${site.toUpperCase()}`,
    },
    grantedScopes: [],
    metadata: {
      site,
      baseUrl: datadogApiKeySites[site]!,
      valid: record.valid === true,
      credentialHelpUrl: datadogCredentialHelpUrl,
    },
  };
}

async function validateDatadogOAuthCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["oauth2"]>>>> {
  const site = resolveDatadogOAuthSite(credential.metadata);
  const payload = await datadogRequestJson(
    "/api/v2/current_user",
    { method: "GET" },
    {
      baseUrl: site.baseUrl,
      authorization: `${credential.tokenType} ${credential.accessToken}`,
      fetcher,
      signal,
      phase: "validate",
      requireApplicationKey: false,
    },
  );
  const data = optionalRecord(optionalRecord(payload)?.data);
  const attributes = optionalRecord(data?.attributes);
  const userId = optionalString(data?.id);
  const email = optionalString(attributes?.email);
  const handle = optionalString(attributes?.handle);
  const name = optionalString(attributes?.name);

  return {
    profile: {
      accountId: `datadog:${site.site}:${userId ?? handle ?? "user"}`,
      displayName: name ?? email ?? handle ?? `Datadog ${site.site}`,
    },
    grantedScopes: parseDatadogScopes(credential.metadata.scope),
    metadata: compactObject({
      site: site.site,
      baseUrl: site.baseUrl,
      validationEndpoint: "/api/v2/current_user",
      userId,
      email,
      handle,
    }),
  };
}

async function resolveDatadogActionContext(
  context: ExecutionContext,
  fetcher: typeof fetch,
): Promise<DatadogActionContext> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key") {
    const site = normalizeDatadogSite(credential.values.site ?? credential.metadata.site);
    return {
      baseUrl: requireStoredBaseUrl(credential.metadata, site),
      apiKey: credential.apiKey,
      applicationKey: optionalString(credential.values.applicationKey),
      fetcher,
      signal: context.signal,
    };
  }
  if (credential?.authType === "oauth2") {
    const site = resolveDatadogOAuthSite(credential.metadata);
    return {
      baseUrl: site.baseUrl,
      authorization: `${credential.tokenType} ${credential.accessToken}`,
      fetcher,
      signal: context.signal,
    };
  }
  throw new ProviderRequestError(401, "Configure Datadog credentials first.");
}

interface DatadogOAuthSite {
  site: string;
  baseUrl: string;
}

function resolveDatadogOAuthSite(metadata: Record<string, unknown>): DatadogOAuthSite {
  const clientExtra = optionalRecord(metadata.oauthClientExtra);
  const site = normalizeDatadogOAuthSite(metadata.site ?? clientExtra?.site);
  return {
    site,
    baseUrl: datadogOAuthSites[site]!,
  };
}

function normalizeDatadogOAuthSite(value: unknown): string {
  const site = optionalString(value)?.toLowerCase();
  if (site && site in datadogOAuthSites) {
    return site;
  }
  throw new ProviderRequestError(
    400,
    "site must be a supported Datadog domain such as datadoghq.com, datadoghq.eu, or us3.datadoghq.com",
  );
}

function parseDatadogScopes(value: unknown): string[] {
  return (optionalString(value) ?? "")
    .split(/[ ,]+/u)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function datadogRequestJson(
  path: string,
  request: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
  context: DatadogActionContext & {
    phase?: DatadogRequestPhase;
    requireApplicationKey: boolean;
  },
): Promise<unknown> {
  if (context.requireApplicationKey && !context.authorization && !context.applicationKey) {
    throw new ProviderRequestError(400, "applicationKey is required");
  }

  const url = new URL(path, context.baseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const signal = context.signal
    ? AbortSignal.any([context.signal, AbortSignal.timeout(datadogDefaultRequestTimeoutMs)])
    : AbortSignal.timeout(datadogDefaultRequestTimeoutMs);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: request.method,
      headers: datadogHeaders(context),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal,
    });
    payload = await readDatadogJson(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Datadog request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Datadog request failed: ${error.message}` : "Datadog request failed",
    );
  }

  if (!response.ok) {
    throw mapDatadogError(response, payload, context.phase ?? "execute");
  }

  return payload;
}

function datadogHeaders(context: DatadogActionContext): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "DD-API-KEY": context.apiKey,
    "DD-APPLICATION-KEY": context.applicationKey,
    authorization: context.authorization,
  }) as Record<string, string>;
}

async function readDatadogJson(response: Response): Promise<unknown> {
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

function mapDatadogError(response: Response, payload: unknown, phase: DatadogRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors.map(String) : [];
  const message =
    errors[0] ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Datadog request failed with status ${response.status}`;
  const invalidValidateInput =
    phase === "validate" && response.status >= 400 && response.status < 500 && response.status !== 429;

  if (invalidValidateInput || response.status === 401 || response.status === 403) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function normalizeDatadogSite(value: unknown): string {
  const site = (optionalString(value) ?? "us1").trim().toLowerCase();
  if (site in datadogApiKeySites) {
    return site;
  }
  throw new ProviderRequestError(400, "site must be one of us1, us3, us5, eu, ap1, ap2, uk1, gov, or gov2");
}

function requireStoredBaseUrl(providerMetadata: Record<string, unknown>, site: string): string {
  const expectedBaseUrl = datadogApiKeySites[site]!;
  const storedBaseUrl = optionalString(providerMetadata.baseUrl);
  if (!storedBaseUrl) {
    throw new ProviderRequestError(401, "datadog baseUrl metadata is required");
  }
  if (storedBaseUrl !== expectedBaseUrl) {
    throw new ProviderRequestError(400, "invalid datadog baseUrl metadata");
  }
  return expectedBaseUrl;
}

function normalizeMonitor(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    ...record,
    id: optionalNumber(record.id) ?? null,
    name: optionalString(record.name) ?? null,
    type: optionalString(record.type) ?? null,
    query: optionalString(record.query) ?? null,
    message: optionalString(record.message) ?? null,
    tags: asStringArrayOrEmpty(record.tags),
    overallState: optionalString(record.overall_state) ?? null,
    creator: optionalRecord(record.creator) ?? null,
    options: optionalRecord(record.options) ?? null,
  };
}

function normalizeMonitorSearchResult(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    ...record,
    id: optionalNumber(record.id) ?? null,
    name: optionalString(record.name) ?? null,
    type: optionalString(record.type) ?? null,
    query: optionalString(record.query) ?? null,
    tags: asStringArrayOrEmpty(record.tags),
    overallState: optionalString(record.overall_state) ?? null,
  };
}

function normalizeTimeseries(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    ...record,
    metric: optionalString(record.metric) ?? null,
    scope: optionalString(record.scope) ?? null,
    expression: optionalString(record.expression) ?? null,
    displayName: optionalString(record.display_name) ?? null,
    unit: asObjectArrayOrEmpty(record.unit),
    pointlist: normalizePointlist(record.pointlist),
  };
}

function normalizeMetricMetadata(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    ...record,
    metric: optionalString(record.metric) ?? null,
    type: optionalString(record.type) ?? null,
    description: optionalString(record.description) ?? null,
    integration: optionalString(record.integration) ?? null,
    unit: optionalString(record.unit) ?? null,
  };
}

function normalizePointlist(value: unknown): Array<Array<number | null>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((point) => (Array.isArray(point) ? point.map((child) => optionalNumber(child) ?? null) : []));
}

function asObjectArrayOrEmpty(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalRecord(item) ?? {});
}

function asStringArrayOrEmpty(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function joinStringArray(value: unknown): string | undefined {
  const array = asStringArrayOrEmpty(value);
  return array.length > 0 ? array.join(",") : undefined;
}

function booleanQuery(value: unknown): string | undefined {
  const bool = optionalBoolean(value);
  return bool === undefined ? undefined : String(bool);
}

function numberQuery(value: unknown): string | undefined {
  const numberValue = optionalNumber(value);
  return numberValue === undefined ? undefined : String(numberValue);
}
