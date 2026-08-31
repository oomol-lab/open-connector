import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "openstatus";
export const openstatusApiBaseUrl = "https://api.openstatus.dev";

const monitorService = "openstatus.monitor.v1.MonitorService";

type OpenstatusRequestPhase = "validate" | "execute";
type OpenstatusActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const openstatusActionHandlers: ProviderActionHandlers<"openstatus", OpenstatusActionHandler> = {
  list_monitors(input, context) {
    return listMonitors(input, context);
  },
  get_monitor(input, context) {
    return getMonitor(input, context);
  },
  get_monitor_status(input, context) {
    return getMonitorStatus(input, context);
  },
  get_monitor_summary(input, context) {
    return getMonitorSummary(input, context);
  },
  list_http_response_logs(input, context) {
    return listHttpResponseLogs(input, context);
  },
  trigger_monitor(input, context) {
    return triggerMonitor(input, context);
  },
  create_http_monitor(input, context) {
    return createHttpMonitor(input, context);
  },
  update_http_monitor(input, context) {
    return updateHttpMonitor(input, context);
  },
  delete_monitor(input, context) {
    return deleteMonitor(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openstatusActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: openstatusApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "x-openstatus-key",
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOpenstatusCredential({ apiKey: input.apiKey }, fetcher, signal);
  },
};

export async function validateOpenstatusCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestOpenstatusJson({
    apiKey,
    path: "/v1/whoami",
    method: "GET",
    fetcher,
    signal,
    phase: "validate",
  });
  const body = requireObjectPayload(payload, "OpenStatus whoami response");
  const actor = optionalRecord(body.actor);
  const scopes = readStringArray(actor?.scopes);
  const name = optionalString(body.name),
    slug = optionalString(body.slug);

  return {
    profile: {
      accountId: slug ?? name ?? "openstatus-api-key",
      displayName: name ?? slug ?? "OpenStatus API Key",
      grantedScopes: scopes,
    },
    grantedScopes: scopes,
    metadata: {
      apiBaseUrl: openstatusApiBaseUrl,
      validationEndpoint: "/v1/whoami",
      accountName: name,
      accountSlug: slug,
      plan: optionalString(body.plan),
      actorType: optionalString(actor?.type),
      keyId: optionalString(actor?.keyId),
    },
  };
}

async function listMonitors(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method: "ListMonitors",
    body: compactObject({
      limit: input.limit,
      offset: input.offset,
    }),
    context,
  });
  const body = requireObjectPayload(payload, "OpenStatus list monitors response");

  return {
    httpMonitors: looseArray(body.httpMonitors),
    tcpMonitors: looseArray(body.tcpMonitors),
    dnsMonitors: looseArray(body.dnsMonitors),
    totalSize: optionalIntegerLike(body.totalSize, "totalSize") ?? 0,
  };
}

async function getMonitor(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method: "GetMonitor",
    body: {
      id: requiredInputString(input.id, "id"),
    },
    context,
  });
  const body = requireObjectPayload(payload, "OpenStatus monitor response");

  return {
    monitor: requireObjectPayload(body.monitor, "OpenStatus monitor"),
  };
}

async function getMonitorStatus(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method: "GetMonitorStatus",
    body: {
      id: requiredInputString(input.id, "id"),
    },
    context,
  });
  const body = requireObjectPayload(payload, "OpenStatus monitor status response");

  return {
    id: optionalString(body.id) ?? requiredInputString(input.id, "id"),
    regions: looseArray(body.regions),
  };
}

async function getMonitorSummary(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method: "GetMonitorSummary",
    body: compactObject({
      id: requiredInputString(input.id, "id"),
      timeRange: optionalString(input.timeRange),
      regions: readOptionalArray(input.regions),
    }),
    context,
  });
  const body = requireObjectPayload(payload, "OpenStatus monitor summary response");

  return {
    summary: body,
  };
}

async function listHttpResponseLogs(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method: "ListMonitorHTTPResponseLogs",
    body: compactObject({
      id: requiredInputString(input.id, "id"),
      fromTimestamp: input.fromTimestamp,
      toTimestamp: input.toTimestamp,
      limit: input.limit,
      offset: input.offset,
    }),
    context,
  });
  const body = requireObjectPayload(payload, "OpenStatus HTTP response logs response");

  return {
    logs: looseArray(body.logs),
    pagination: optionalRecord(body.pagination) ?? null,
  };
}

async function triggerMonitor(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return executeSuccessMutation(input, context, "TriggerMonitor");
}

async function deleteMonitor(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return executeSuccessMutation(input, context, "DeleteMonitor");
}

async function createHttpMonitor(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method: "CreateHTTPMonitor",
    body: {
      monitor: buildHttpMonitorPayload(input, false),
    },
    context,
  });
  const body = requireObjectPayload(payload, "OpenStatus create HTTP monitor response");

  return {
    monitor: requireObjectPayload(body.monitor, "OpenStatus HTTP monitor"),
  };
}

async function updateHttpMonitor(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method: "UpdateHTTPMonitor",
    body: {
      id: requiredInputString(input.id, "id"),
      monitor: buildHttpMonitorPayload(input, true),
    },
    context,
  });
  const body = requireObjectPayload(payload, "OpenStatus update HTTP monitor response");

  return {
    monitor: requireObjectPayload(body.monitor, "OpenStatus HTTP monitor"),
  };
}

async function executeSuccessMutation(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  method: "TriggerMonitor" | "DeleteMonitor",
): Promise<unknown> {
  const payload = await requestOpenstatusRpc({
    service: monitorService,
    method,
    body: {
      id: requiredInputString(input.id, "id"),
    },
    context,
  });
  const body = requireObjectPayload(payload, `OpenStatus ${method} response`);

  return {
    success: optionalBoolean(body.success) ?? false,
  };
}

async function requestOpenstatusRpc(input: {
  service: string;
  method: string;
  body: Record<string, unknown>;
  context: ApiKeyProviderContext;
}): Promise<unknown> {
  return requestOpenstatusJson({
    apiKey: input.context.apiKey,
    path: `/rpc/${input.service}/${input.method}`,
    method: "POST",
    body: input.body,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });
}

async function requestOpenstatusJson(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  fetcher: typeof fetch;
  phase: OpenstatusRequestPhase;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const response = await openstatusFetch(input);
  const payload = await readOpenstatusPayload(response);
  if (!response.ok) {
    throw createOpenstatusError(response, payload, input.phase);
  }

  return payload;
}

async function openstatusFetch(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  fetcher: typeof fetch;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const url = new URL(input.path, openstatusApiBaseUrl);
  const timeout = createProviderTimeout(input.signal);

  try {
    return await input.fetcher(url, {
      method: input.method,
      headers: buildOpenstatusHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "OpenStatus request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OpenStatus request failed: ${error.message}` : "OpenStatus request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOpenstatusHeaders(apiKey: string, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-openstatus-key": apiKey,
  });
  if (hasJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readOpenstatusPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "OpenStatus returned invalid JSON");
  }
}

function createOpenstatusError(
  response: Response,
  payload: unknown,
  phase: OpenstatusRequestPhase,
): ProviderRequestError {
  const message = readOpenstatusErrorMessage(payload) ?? `OpenStatus request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(401, "Invalid OpenStatus API key.", payload);
    }
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function readOpenstatusErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  return optionalString(body.message) ?? optionalString(body.error) ?? optionalString(body.code);
}

function buildHttpMonitorPayload(input: Record<string, unknown>, partial: boolean): Record<string, unknown> {
  const monitor = compactObject({
    name: optionalString(input.name),
    url: optionalString(input.url),
    periodicity: optionalString(input.periodicity),
    method: optionalString(input.method),
    body: typeof input.body === "string" ? input.body : undefined,
    timeout: input.timeout,
    degradedAt: input.degradedAt,
    retry: input.retry,
    followRedirects: optionalNullableBoolean(input.followRedirects),
    headers: readOptionalArray(input.headers),
    statusCodeAssertions: readOptionalArray(input.statusCodeAssertions),
    bodyAssertions: readOptionalArray(input.bodyAssertions),
    headerAssertions: readOptionalArray(input.headerAssertions),
    description: typeof input.description === "string" ? input.description : undefined,
    active: optionalBoolean(input.active),
    public: optionalBoolean(input.public),
    regions: readOptionalArray(input.regions),
    openTelemetry: optionalRecord(input.openTelemetry),
  });

  if (!partial) {
    monitor.name = requiredInputString(input.name, "name");
    monitor.url = requiredInputString(input.url, "url");
    monitor.periodicity = requiredInputString(input.periodicity, "periodicity");
  }

  return monitor;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
  return parsed;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item == "string") : [];
}

function optionalNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value);
}
