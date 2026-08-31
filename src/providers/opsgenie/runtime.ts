import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export const opsgenieUsApiBaseUrl = "https://api.opsgenie.com";
export const opsgenieEuApiBaseUrl = "https://api.eu.opsgenie.com";

type OpsgenieEnvironment = "us" | "eu";
type OpsgenieRequestPhase = "validate" | "execute";
type OpsgenieActionHandler = (input: Record<string, unknown>, context: OpsgenieContext) => Promise<unknown>;

interface OpsgenieContext {
  apiKey: string;
  environment: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface OpsgenieRequestInput {
  context: OpsgenieContext;
  path: string;
  phase: OpsgenieRequestPhase;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

export const opsgenieActionHandlers: ProviderActionHandlers<"opsgenie", OpsgenieActionHandler> = {
  get_current_account(_input, context) {
    return getCurrentAccount(context);
  },
  list_alerts(input, context) {
    return listAlerts(input, context);
  },
  get_alert(input, context) {
    return getAlert(input, context);
  },
  create_alert(input, context) {
    return createAlert(input, context);
  },
  acknowledge_alert(input, context) {
    return mutateAlert(input, context, "acknowledge");
  },
  close_alert(input, context) {
    return mutateAlert(input, context, "close");
  },
  get_request_status(input, context) {
    return getRequestStatus(input, context);
  },
};

export async function validateOpsgenieCredential(
  input: Record<string, string | undefined>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const environment = resolveOpsgenieEnvironment(input.environment);
  const apiBaseUrl = getOpsgenieApiBaseUrl(environment);
  const context: OpsgenieContext = {
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
    environment,
    fetcher,
    signal,
  };
  const payload = await requestOpsgenieJson<Record<string, unknown>>({
    context,
    path: "/v2/account",
    phase: "validate",
  });
  const account = requireObjectPayload(payload.data, "opsgenie account response data");
  const accountName = optionalString(account.name);

  return {
    profile: {
      accountId: accountName || environment,
      displayName: accountName || `Opsgenie ${environment.toUpperCase()} Account`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      environment,
      accountName,
      accountPlan: optionalString(account.plan),
      validationEndpoint: "/v2/account",
    }),
  };
}

export function resolveOpsgenieEnvironment(value: unknown): OpsgenieEnvironment {
  return value === "eu" ? "eu" : "us";
}

export function getOpsgenieApiBaseUrl(environment: OpsgenieEnvironment): string {
  return environment === "eu" ? opsgenieEuApiBaseUrl : opsgenieUsApiBaseUrl;
}

async function getCurrentAccount(context: OpsgenieContext): Promise<Record<string, unknown>> {
  const payload = await requestOpsgenieJson<Record<string, unknown>>({
    context,
    path: "/v2/account",
    phase: "execute",
  });

  return {
    account: requireObjectPayload(payload.data, "opsgenie account response data"),
  };
}

async function listAlerts(input: Record<string, unknown>, context: OpsgenieContext): Promise<Record<string, unknown>> {
  const payload = await requestOpsgenieJson<Record<string, unknown>>({
    context,
    path: "/v2/alerts",
    query: compactObject({
      query: optionalString(input.query),
      searchIdentifier: optionalString(input.searchIdentifier),
      searchIdentifierType: optionalString(input.searchIdentifierType),
      offset: optionalIntegerLike(input.offset, "offset"),
      limit: optionalIntegerLike(input.limit, "limit"),
      sort: optionalString(input.sort),
      order: optionalString(input.order),
    }),
    phase: "execute",
  });

  return {
    alerts: requireArrayPayload(payload.data, "opsgenie alerts response data"),
    pagination: readPagination(payload.paging),
    requestId: requireStringPayload(payload.requestId, "opsgenie alerts response requestId"),
  };
}

async function getAlert(input: Record<string, unknown>, context: OpsgenieContext): Promise<Record<string, unknown>> {
  const identifier = requiredInputString(input.identifier, "identifier");
  const payload = await requestOpsgenieJson<Record<string, unknown>>({
    context,
    path: `/v2/alerts/${encodeURIComponent(identifier)}`,
    query: compactObject({
      identifierType: optionalString(input.identifierType),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    alert: requireObjectPayload(payload.data, "opsgenie alert response data"),
    requestId: requireStringPayload(payload.requestId, "opsgenie alert response requestId"),
  };
}

async function createAlert(input: Record<string, unknown>, context: OpsgenieContext): Promise<Record<string, unknown>> {
  const body = compactObject({
    message: requiredInputString(input.message, "message"),
    alias: optionalString(input.alias),
    description: optionalString(input.description),
    responders: input.responders,
    visibleTo: input.visibleTo,
    actions: input.actions,
    tags: input.tags,
    details: input.details,
    entity: optionalString(input.entity),
    source: optionalString(input.source),
    priority: optionalString(input.priority),
    user: optionalString(input.user),
    note: optionalString(input.note),
  });

  return requestOpsgenieJson<Record<string, unknown>>({
    context,
    path: "/v2/alerts",
    method: "POST",
    body,
    phase: "execute",
  });
}

async function mutateAlert(
  input: Record<string, unknown>,
  context: OpsgenieContext,
  action: "acknowledge" | "close",
): Promise<Record<string, unknown>> {
  const identifier = requiredInputString(input.identifier, "identifier");
  const body = compactObject({
    user: optionalString(input.user),
    source: optionalString(input.source),
    note: optionalString(input.note),
  });

  return requestOpsgenieJson<Record<string, unknown>>({
    context,
    path: `/v2/alerts/${encodeURIComponent(identifier)}/${action}`,
    method: "POST",
    query: compactObject({
      identifierType: optionalString(input.identifierType),
    }),
    body,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function getRequestStatus(
  input: Record<string, unknown>,
  context: OpsgenieContext,
): Promise<Record<string, unknown>> {
  const requestId = requiredInputString(input.requestId, "requestId");
  return requestOpsgenieJson<Record<string, unknown>>({
    context,
    path: `/v2/alerts/requests/${encodeURIComponent(requestId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function requestOpsgenieJson<T>(input: OpsgenieRequestInput): Promise<T> {
  const url = new URL(input.path, getOpsgenieApiBaseUrl(resolveOpsgenieEnvironment(input.context.environment)));
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryParam(url, key, value);
  }

  const timeout = createProviderTimeout(input.context.signal);
  try {
    const headers = compactObject({
      accept: "application/json",
      authorization: `GenieKey ${input.context.apiKey}`,
      "content-type": input.body === undefined ? undefined : "application/json",
      "user-agent": providerUserAgent,
    }) as Record<string, string>;
    const response = await input.context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw mapOpsgenieError(response, payload, input.phase, input.notFoundAsInvalidInput);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Opsgenie request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Opsgenie request failed: ${error.message}` : "Opsgenie request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Opsgenie returned invalid JSON");
  }
}

function mapOpsgenieError(
  response: Response,
  payload: unknown,
  phase: OpsgenieRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractOpsgenieErrorMessage(payload) ?? `Opsgenie request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(phase === "validate" ? 401 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractOpsgenieErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.result);
}

function requireStringPayload(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `${label} is missing`);
  }
  return value;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is missing`);
  }
  return record;
}

function requireArrayPayload(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is missing`);
  }
  return value;
}

function readPagination(value: unknown): Record<string, number> {
  const paging = optionalRecord(value) ?? {};
  return {
    offset: optionalIntegerLike(paging.offset, "offset") ?? 0,
    limit: optionalIntegerLike(paging.limit, "limit") ?? 0,
    count: optionalIntegerLike(paging.count, "count") ?? 0,
  };
}

function appendQueryParam(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryParam(url, key, item);
    }
    return;
  }
  if (typeof value === "boolean") {
    url.searchParams.append(key, optionalBoolean(value) ? "true" : "false");
    return;
  }
  url.searchParams.append(key, String(value));
}
