import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { AgentqlActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const agentqlApiBaseUrl = "https://api.agentql.com";
const usagePath = "/v1/usage";
const queryDataPath = "/v1/query-data";
const tetraSessionsPath = "/v1/tetra/sessions";
const tetraUsagePath = "/v1/tetra/usage";

type AgentqlPhase = "validate" | "execute";

interface AgentqlActionContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type AgentqlActionHandler = (input: Record<string, unknown>, context: AgentqlActionContext) => Promise<unknown>;

export const agentqlActionHandlers: Record<AgentqlActionName, AgentqlActionHandler> = {
  query_data(input, context) {
    return executeQueryData(input, context);
  },
  get_usage(_input, context) {
    return agentqlGetJson(usagePath, context, "execute");
  },
  create_browser_session(input, context) {
    return executeCreateBrowserSession(input, context);
  },
  list_session_usage(input, context) {
    return executeListSessionUsage(input, context);
  },
};

export async function validateAgentqlCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "agentql api_key is required");
  }

  const payload = await agentqlGetJson(
    usagePath,
    {
      apiKey: trimmedApiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "AgentQL API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: agentqlApiBaseUrl,
      validationEndpoint: usagePath,
      currentSubscription: readNullableRecord(payload, "data", "current_subscription"),
      apiKeyUsage: readNullableRecord(payload, "data", "api_key_usage"),
      totalAccountUsage: readNullableRecord(payload, "data", "total_account_usage"),
      requestId: readOptionalString(payload, "metadata", "request_id"),
    }),
  };
}

async function executeQueryData(input: Record<string, unknown>, context: AgentqlActionContext): Promise<unknown> {
  const url = readOptionalTrimmedString(input.url);
  const html = readOptionalTrimmedString(input.html);
  const query = readOptionalTrimmedString(input.query);
  const prompt = readOptionalTrimmedString(input.prompt);

  if (!url && !html) {
    throw new ProviderRequestError(400, "url or html is required");
  }
  if (!query && !prompt) {
    throw new ProviderRequestError(400, "query or prompt is required");
  }

  return agentqlPostJson(
    queryDataPath,
    compactObject({
      query,
      prompt,
      url,
      html,
      params: normalizeQueryParams(input.params),
    }),
    context,
  );
}

async function executeCreateBrowserSession(
  input: Record<string, unknown>,
  context: AgentqlActionContext,
): Promise<unknown> {
  return agentqlPostJson(
    tetraSessionsPath,
    compactObject({
      browser_ua_preset: readOptionalTrimmedString(input.browser_ua_preset),
      browser_profile: readOptionalTrimmedString(input.browser_profile),
      shutdown_mode: readOptionalTrimmedString(input.shutdown_mode),
      inactivity_timeout_seconds: optionalInteger(input.inactivity_timeout_seconds),
      proxy: normalizeProxy(input.proxy),
      sub_user_id: readOptionalTrimmedString(input.sub_user_id),
      branding: optionalBoolean(input.branding),
    }),
    context,
    201,
  );
}

async function executeListSessionUsage(
  input: Record<string, unknown>,
  context: AgentqlActionContext,
): Promise<unknown> {
  const url = new URL(tetraUsagePath, agentqlApiBaseUrl);
  setOptionalQueryParameter(url, "sub_user_id", readOptionalTrimmedString(input.sub_user_id));
  setOptionalQueryParameter(url, "session_id", readOptionalTrimmedString(input.session_id));
  setOptionalQueryParameter(url, "start_after", readOptionalTrimmedString(input.start_after));
  setOptionalQueryParameter(url, "end_before", readOptionalTrimmedString(input.end_before));
  setOptionalQueryParameter(url, "updated_after", readOptionalTrimmedString(input.updated_after));
  setOptionalQueryParameter(url, "updated_before", readOptionalTrimmedString(input.updated_before));
  setOptionalQueryParameter(url, "status", readOptionalTrimmedString(input.status));
  setOptionalQueryParameter(url, "limit", optionalInteger(input.limit)?.toString());
  setOptionalQueryParameter(url, "page", optionalInteger(input.page)?.toString());

  return agentqlRequestJson(
    url,
    {
      method: "GET",
      headers: agentqlHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
  );
}

async function agentqlGetJson(path: string, context: AgentqlActionContext, phase: AgentqlPhase): Promise<unknown> {
  return agentqlRequestJson(
    new URL(path, agentqlApiBaseUrl),
    {
      method: "GET",
      headers: agentqlHeaders(context.apiKey, {
        accept: "application/json",
      }),
      signal: context.signal,
    },
    phase,
    context.fetcher,
  );
}

async function agentqlPostJson(
  path: string,
  body: Record<string, unknown>,
  context: AgentqlActionContext,
  expectedStatus = 200,
): Promise<unknown> {
  return agentqlRequestJson(
    new URL(path, agentqlApiBaseUrl),
    {
      method: "POST",
      headers: agentqlHeaders(context.apiKey, {
        accept: "application/json",
        "content-type": "application/json",
        "x-tf-request-origin": "rest-api-data",
      }),
      body: JSON.stringify(body),
      signal: context.signal,
    },
    "execute",
    context.fetcher,
    expectedStatus,
  );
}

async function agentqlRequestJson(
  url: URL,
  init: RequestInit,
  phase: AgentqlPhase,
  fetcher: ProviderFetch,
  expectedStatus?: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `agentql request failed: ${error.message}` : "agentql request failed",
    );
  }

  const payload = await readJsonPayload(response);
  if (expectedStatus != null ? response.status !== expectedStatus : !response.ok) {
    throw createAgentqlError(response, payload, phase);
  }

  return payload;
}

function agentqlHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
    ...extraHeaders,
  };
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAgentqlError(response: Response, payload: unknown, phase: AgentqlPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? response.statusText ?? "agentql request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message);
  }

  return new ProviderRequestError(response.status || 502, message);
}

function normalizeQueryParams(value: unknown): Record<string, unknown> | undefined {
  const params = optionalRecord(value);
  if (!params) {
    return undefined;
  }

  return compactObject({
    mode: readOptionalTrimmedString(params.mode),
    wait_for: optionalInteger(params.wait_for),
    is_scroll_to_bottom_enabled: optionalBoolean(params.is_scroll_to_bottom_enabled),
    is_screenshot_enabled: optionalBoolean(params.is_screenshot_enabled),
    browser_profile: readOptionalTrimmedString(params.browser_profile),
    proxy: normalizeProxy(params.proxy),
  });
}

function normalizeProxy(value: unknown): Record<string, unknown> | undefined {
  const proxy = optionalRecord(value);
  if (!proxy) {
    return undefined;
  }

  const type = readOptionalTrimmedString(proxy.type);
  const url = readOptionalTrimmedString(proxy.url);
  if (type === "custom" && !url) {
    throw new ProviderRequestError(400, "url is required when proxy type is custom");
  }

  return compactObject({
    type,
    country_code: readOptionalTrimmedString(proxy.country_code)?.toUpperCase(),
    url,
    username: readOptionalTrimmedString(proxy.username),
    password: readOptionalTrimmedString(proxy.password),
  });
}

function readErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return typeof payload === "string" ? payload : undefined;
  }

  const record = payload as Record<string, unknown>;
  const direct =
    readNonEmptyString(record.error_info) ?? readNonEmptyString(record.detail) ?? readNonEmptyString(record.message);
  if (direct) {
    return direct;
  }

  const detail = record.detail;
  if (Array.isArray(detail)) {
    for (const item of detail) {
      const message = readNonEmptyString(optionalRecord(item)?.msg);
      if (message) {
        return message;
      }
    }
  }

  return undefined;
}

function readNullableRecord(
  payload: unknown,
  parentKey: string,
  childKey: string,
): Record<string, unknown> | null | undefined {
  const parent = optionalRecord(payload)?.[parentKey];
  const value = optionalRecord(parent)?.[childKey];
  if (value === null) {
    return null;
  }

  return optionalRecord(value);
}

function readOptionalString(payload: unknown, parentKey: string, childKey: string): string | undefined {
  const parent = optionalRecord(payload)?.[parentKey];
  return readOptionalTrimmedString(optionalRecord(parent)?.[childKey]);
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function setOptionalQueryParameter(url: URL, key: string, value: string | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, value);
  }
}

function readNonEmptyString(value: unknown): string | undefined {
  return optionalString(value);
}
