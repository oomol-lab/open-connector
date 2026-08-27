import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  normalizeProviderProxyEndpoint,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "browser_use";
const browserUseV3ApiBaseUrl = "https://api.browser-use.com/api/v3";
const browserUseV4ApiBaseUrl = "https://api.browser-use.com/api/v4";
const browserUseDefaultRequestTimeoutMs = 60_000;
const browserUseMaxResponseBytes = 10 * 1024 * 1024;

type BrowserUseRequestPhase = "validate" | "execute";
type BrowserUseApiVersion = "v3" | "v4";

interface BrowserUseProxyTarget {
  apiVersion: BrowserUseApiVersion;
  endpoint: string;
}

interface BrowserUseRequestInput {
  method: "GET" | "POST";
  path: string;
  apiKey: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: BrowserUseRequestPhase;
}

type BrowserUseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const browserUseActionHandlers: ProviderActionHandlers<"browser_use", BrowserUseActionHandler> = {
  async run_task(input, context) {
    const session = await requestBrowserUseJson({
      method: "POST",
      path: "/sessions",
      apiKey: context.apiKey,
      body: {
        ...input,
        task: requireTrimmedString(input.task, "task"),
      },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return {
      session,
      sessionId: readBrowserUseSessionId(session),
    };
  },
  async get_session(input, context) {
    return {
      session: await requestBrowserUseJson({
        method: "GET",
        path: `/sessions/${encodeURIComponent(requireTrimmedString(input.sessionId, "sessionId"))}`,
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  list_sessions(input, context) {
    return requestBrowserUseJson({
      method: "GET",
      path: "/sessions",
      apiKey: context.apiKey,
      query: compactObject({
        page: typeof input.page === "number" ? input.page : undefined,
        page_size: typeof input.pageSize === "number" ? input.pageSize : undefined,
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_session_messages(input, context) {
    return requestBrowserUseJson({
      method: "GET",
      path: `/sessions/${encodeURIComponent(requireTrimmedString(input.sessionId, "sessionId"))}/messages`,
      apiKey: context.apiKey,
      query: compactObject({
        after: optionalString(input.after),
        before: optionalString(input.before),
        limit: typeof input.limit === "number" ? input.limit : undefined,
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  async stop_session(input, context) {
    return {
      session: await requestBrowserUseJson({
        method: "POST",
        path: `/sessions/${encodeURIComponent(requireTrimmedString(input.sessionId, "sessionId"))}/stop`,
        apiKey: context.apiKey,
        body: compactObject({
          strategy: optionalString(input.strategy),
        }),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
  async get_billing_account(_input, context) {
    return {
      account: await requestBrowserUseJson({
        method: "GET",
        path: "/billing/account",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, browserUseActionHandlers, {
  skipDnsValidation: true,
});

const browserUseV3Proxy = defineProviderProxy({
  service,
  baseUrl: browserUseV3ApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Browser-Use-API-Key" },
  skipDnsValidation: true,
});

const browserUseV4Proxy = defineProviderProxy({
  service,
  baseUrl: browserUseV4ApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Browser-Use-API-Key" },
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = (input, context) => {
  const target = resolveBrowserUseProxyTarget(input.method, input.endpoint);
  const request = target.endpoint === input.endpoint ? input : { ...input, endpoint: target.endpoint };
  return target.apiVersion === "v4" ? browserUseV4Proxy(request, context) : browserUseV3Proxy(request, context);
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = await requestBrowserUseJson({
      method: "GET",
      path: "/billing/account",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const accountRecord = requireRecord(account);
    const accountName = optionalString(accountRecord.name)?.trim();
    const projectId = optionalString(accountRecord.projectId);
    return {
      profile: {
        accountId: projectId ?? "api_key",
        displayName: accountName || projectId || "Browser Use API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: browserUseV3ApiBaseUrl,
        projectId,
        planName: optionalString(optionalRecord(accountRecord.planInfo)?.planName),
      },
    };
  },
};

async function requestBrowserUseJson(input: BrowserUseRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, browserUseDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildBrowserUseUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "X-Browser-Use-API-Key": input.apiKey,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readBrowserUsePayload(response);
    if (!response.ok) {
      throw createBrowserUseError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Browser Use request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Browser Use request failed: ${error.message}` : "Browser Use request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBrowserUseUrl(path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(`${browserUseV3ApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/**
 * Route Browser Use's shared browser, profile, and workspace resources through V4 while preserving
 * the existing V3 agent-session and billing surface. Callers can include an explicit `/api/v3` or
 * `/api/v4` prefix to select an upstream version without changing the stored connection.
 */
export function resolveBrowserUseProxyTarget(methodInput: string, endpointInput: string): BrowserUseProxyTarget {
  const endpoint = normalizeProviderProxyEndpoint(endpointInput);
  const explicitVersion = endpoint.match(/^\/api\/(v3|v4)(?=\/|[?#]|$)/u)?.[1] as BrowserUseApiVersion | undefined;
  if (explicitVersion) {
    const versionPrefix = `/api/${explicitVersion}`;
    const versionlessEndpoint = endpoint.slice(versionPrefix.length);
    return {
      apiVersion: explicitVersion,
      endpoint:
        versionlessEndpoint === "" || versionlessEndpoint.startsWith("?") || versionlessEndpoint.startsWith("#")
          ? `/${versionlessEndpoint}`
          : versionlessEndpoint,
    };
  }

  return {
    apiVersion: isBrowserUseV4ResourceRoute(methodInput, endpoint) ? "v4" : "v3",
    endpoint,
  };
}

function isBrowserUseV4ResourceRoute(methodInput: string, endpoint: string): boolean {
  const method = methodInput.toUpperCase();
  const path = endpoint.split(/[?#]/u, 1)[0]!;

  if (path === "/browsers") {
    return method === "GET" || method === "POST";
  }
  if (/^\/browsers\/[^/]+$/u.test(path)) {
    return method === "GET" || method === "PATCH";
  }
  if (/^\/browsers\/[^/]+\/downloads$/u.test(path)) {
    return method === "GET";
  }
  if (path === "/profiles") {
    return method === "GET" || method === "POST";
  }
  if (/^\/profiles\/[^/]+$/u.test(path)) {
    return method === "GET" || method === "PATCH" || method === "DELETE";
  }
  if (path === "/workspaces") {
    return method === "POST";
  }
  if (/^\/workspaces\/[^/]+$/u.test(path)) {
    return method === "GET" || method === "PATCH" || method === "DELETE";
  }
  if (/^\/workspaces\/[^/]+\/size$/u.test(path)) {
    return method === "GET";
  }
  if (/^\/workspaces\/[^/]+\/files$/u.test(path)) {
    return method === "GET" || method === "DELETE";
  }
  if (/^\/workspaces\/[^/]+\/files\/upload$/u.test(path)) {
    return method === "POST";
  }
  return false;
}

async function readBrowserUsePayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Browser Use response", browserUseMaxResponseBytes);
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "Browser Use returned invalid JSON");
  }
}

function createBrowserUseError(status: number, payload: unknown, phase: BrowserUseRequestPhase): ProviderRequestError {
  const message = extractBrowserUseErrorMessage(payload) ?? `Browser Use request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || (phase === "validate" && status >= 400 && status < 500)) {
    return new ProviderRequestError(401, message);
  }
  return new ProviderRequestError(status >= 500 || status < 400 ? 502 : status, message);
}

function extractBrowserUseErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const detail = record.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return optionalString(optionalRecord(detail[0])?.msg);
  }
  if (detail && typeof detail === "object") {
    return optionalString(optionalRecord(detail)?.message);
  }
  return optionalString(record.message) ?? optionalString(record.error);
}

function readBrowserUseSessionId(value: unknown): string {
  const id = optionalString(requireRecord(value).id);
  if (!id) {
    throw new ProviderRequestError(502, "Browser Use session response is missing id");
  }
  return id;
}

function requireRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Browser Use returned an invalid JSON object");
  }
  return record;
}

function requireTrimmedString(value: unknown, fieldName: string): string {
  const result = optionalString(value)?.trim();
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}
