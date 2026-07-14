import type {
  CredentialValidationResult,
  ProviderProxyExecutor,
  ProxyExecutionResult,
  ProxyRequestInput,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "prerender";
const prerenderApiBaseUrl = "https://api.prerender.io";
const prerenderFetch = createProviderFetch({ skipDnsValidation: true });
const validationEndpoint = "/cache-clear-status/{prerenderToken}";

type PrerenderPhase = "validate" | "execute";

type PrerenderActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const prerenderActionHandlers: Record<string, PrerenderActionHandler> = {
  async recache_urls(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    const response = await requestPrerender({
      path: "/recache",
      method: "POST",
      body: compactObject({
        prerenderToken: context.apiKey,
        urls: readRequiredUrlList(input.urls),
        adaptiveType: readOptionalAdaptiveType(input.adaptiveType),
      }),
      context,
      phase: "execute",
    });
    return { accepted: true, raw: response.payload };
  },
  async add_sitemap(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    const response = await requestPrerender({
      path: "/sitemap",
      method: "POST",
      body: { prerenderToken: context.apiKey, url: readRequiredUrl(input.url, "url") },
      context,
      phase: "execute",
    });
    return { accepted: true, raw: response.payload };
  },
  async clear_cache(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    const response = await requestPrerender({
      path: "/cache-clear",
      method: "POST",
      body: { prerenderToken: context.apiKey, query: requiredInputString(input.query, "query") },
      context,
      phase: "execute",
      expectedStatuses: [403],
    });
    return { status: response.status === 403 ? "in_progress" : "queued", raw: response.payload };
  },
  async get_cache_clear_status(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
    const response = await requestPrerender({
      path: buildCacheClearStatusPath(context.apiKey),
      method: "GET",
      context,
      phase: "execute",
      expectedStatuses: [403],
    });
    return { status: response.status === 403 ? "in_progress" : "idle", raw: response.payload };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, prerenderActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (
  input: ProxyRequestInput,
  context,
): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const method = input.method.toUpperCase();
    const proxyRequest = buildPrerenderProxyRequest(input, endpoint, credential.apiKey, method);
    const url = createProviderProxyUrl(prerenderApiBaseUrl, proxyRequest.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method,
      headers,
      signal: context.signal,
    };
    if (proxyRequest.body !== undefined) {
      init.body = typeof proxyRequest.body === "string" ? proxyRequest.body : JSON.stringify(proxyRequest.body);
      if (!headers.has("content-type") && typeof proxyRequest.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await prerenderFetch(url, init);
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        await readProviderProxyErrorMessage(response, `Prerender request failed with HTTP ${response.status}`),
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Prerender request failed");
  }
};

export async function validatePrerenderCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const response = await requestPrerender({
    path: buildCacheClearStatusPath(apiKey),
    method: "GET",
    context: { apiKey, fetcher },
    phase: "validate",
    expectedStatuses: [403],
  });

  return {
    profile: { accountId: "prerender-api-token", displayName: "Prerender API Token", grantedScopes: [] },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: prerenderApiBaseUrl,
      validationEndpoint,
      cacheClearStatus: response.status === 403 ? "in_progress" : "idle",
    },
  };
}

async function requestPrerender(input: {
  path: string;
  method: "GET" | "POST";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: PrerenderPhase;
  body?: Record<string, unknown>;
  expectedStatuses?: number[];
}): Promise<{ status: number; payload: unknown }> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildPrerenderUrl(input.path), {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.method === "POST" ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Prerender request failed: ${error.message}` : "Prerender request failed",
    );
  }
  const payload = await readPrerenderPayload(response);
  if (!response.ok && !(input.expectedStatuses ?? []).includes(response.status)) {
    throw createPrerenderError(response.status, payload, input.phase);
  }
  return { status: response.status, payload };
}

function buildPrerenderUrl(path: string): URL {
  return new URL(path.startsWith("/") ? path.slice(1) : path, `${prerenderApiBaseUrl}/`);
}

function buildCacheClearStatusPath(apiKey: string): string {
  return `/cache-clear-status/${encodeURIComponent(apiKey)}`;
}

function buildPrerenderProxyRequest(
  input: ProxyRequestInput,
  endpoint: string,
  apiKey: string,
  method: string,
): { endpoint: string; body?: unknown } {
  if (method === "GET" && (endpoint === "/cache-clear-status" || endpoint.startsWith("/cache-clear-status/"))) {
    return { endpoint: buildCacheClearStatusPath(apiKey) };
  }
  if (method === "POST") {
    return { endpoint, body: buildPrerenderProxyBody(input.body, apiKey) };
  }
  return { endpoint, body: input.body };
}

function buildPrerenderProxyBody(bodyInput: unknown, apiKey: string): Record<string, unknown> {
  if (bodyInput === undefined) {
    return { prerenderToken: apiKey };
  }
  const body = optionalRecord(bodyInput);
  if (!body) {
    throw new ProviderRequestError(400, "Prerender proxy body must be a JSON object");
  }
  return { ...body, prerenderToken: apiKey };
}

async function readPrerenderPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPrerenderError(status: number, payload: unknown, phase: PrerenderPhase): ProviderRequestError {
  const message = extractPrerenderErrorMessage(payload) ?? `Prerender request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (status === 401 || status === 403))
    return new ProviderRequestError(401, message, payload);
  if (status === 400) return new ProviderRequestError(400, message, payload);
  if (status === 401 || status === 403) return new ProviderRequestError(401, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractPrerenderErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.status);
}

function readRequiredUrlList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "urls must be a non-empty array");
  }
  return value.map((item, index) => readRequiredUrl(item, `urls[${index}]`));
}

function readRequiredUrl(value: unknown, fieldName: string): string {
  const text = requiredInputString(value, fieldName);
  try {
    new URL(text);
    return text;
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be a valid URL`);
  }
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalAdaptiveType(value: unknown): "mobile" | "desktop" | undefined {
  const adaptiveType = optionalString(value);
  if (!adaptiveType) return undefined;
  if (adaptiveType === "mobile" || adaptiveType === "desktop") return adaptiveType;
  throw new ProviderRequestError(400, "adaptiveType must be mobile or desktop");
}
