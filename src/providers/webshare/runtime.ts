import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { WebshareActionName } from "./actions.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const webshareApiBaseUrl = "https://proxy.webshare.io";

type WebshareRequestPhase = "validate" | "execute";
type WebshareQueryValue = string | number | boolean | undefined;
type WebshareActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface WebshareRequestInput {
  path: string;
  query?: Record<string, WebshareQueryValue>;
}

export const webshareActionHandlers: Record<WebshareActionName, WebshareActionHandler> = {
  get_profile(_input, context) {
    return webshareGetProfile(context);
  },
  list_proxies(input, context) {
    return webshareListProxies(input, context);
  },
  get_proxy_config(input, context) {
    return webshareGetProxyConfig(input, context);
  },
  list_stats(input, context) {
    return webshareListStats(input, context);
  },
};

export async function validateWebshareCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const profile = await requestWebshareProfile({ apiKey, fetcher, signal }, "validate");
  const userId = optionalInteger(profile.id);
  const email = optionalString(profile.email);
  const firstName = optionalString(profile.first_name);
  return {
    profile: {
      accountId: userId == null ? (email ?? "webshare-api-key") : String(userId),
      displayName: email ?? firstName ?? (userId == null ? undefined : String(userId)) ?? "Webshare API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/api/v2/profile/",
      userId,
      email,
      timezone: optionalString(profile.timezone),
    },
  };
}

async function webshareGetProfile(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  return { profile: await requestWebshareProfile(context, "execute") };
}

async function requestWebshareProfile(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: WebshareRequestPhase,
): Promise<Record<string, unknown>> {
  const payload = await webshareRequest(context, { path: "/api/v2/profile/" }, phase);
  const profile = optionalRecord(payload);
  if (!profile) throw new ProviderRequestError(502, "webshare profile response was not an object", payload);
  return profile;
}

async function webshareListProxies(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await webshareRequest(
    context,
    {
      path: "/api/v2/proxy/list/",
      query: {
        mode: optionalString(input.mode),
        plan_id: optionalString(input.planId),
        page: typeof input.page === "number" ? input.page : undefined,
        page_size: typeof input.pageSize === "number" ? input.pageSize : undefined,
        country_code__in: optionalString(input.country_code__in),
        search: optionalString(input.search),
        ordering: optionalString(input.ordering),
        created_at: optionalString(input.created_at),
        proxy_address: optionalString(input.proxy_address),
        proxy_address__in: optionalString(input.proxy_address__in),
        valid: typeof input.valid === "boolean" ? input.valid : undefined,
        asn_number: optionalString(input.asn_number),
        asn_name: optionalString(input.asn_name),
      },
    },
    "execute",
  );
  const envelope = optionalRecord(payload);
  if (!envelope) throw new ProviderRequestError(502, "webshare list_proxies response was not an object", payload);
  if (!Array.isArray(envelope.results)) {
    throw new ProviderRequestError(502, "webshare list_proxies response did not include results", payload);
  }
  return {
    count: optionalInteger(envelope.count) ?? envelope.results.length,
    next: optionalString(envelope.next) ?? null,
    previous: optionalString(envelope.previous) ?? null,
    proxies: envelope.results.map((item, index) =>
      requireObject(item, `webshare list_proxies returned a non-object item at index ${index}`),
    ),
  };
}

async function webshareGetProxyConfig(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await webshareRequest(
    context,
    {
      path: "/api/v3/proxy/config",
      query: { plan_id: optionalString(input.planId) },
    },
    "execute",
  );
  return { proxyConfig: requireObject(payload, "webshare get_proxy_config response was not an object") };
}

async function webshareListStats(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await webshareRequest(
    context,
    {
      path: "/api/v2/stats/",
      query: {
        plan_id: optionalString(input.planId),
        timestamp__lte: optionalString(input.timestamp__lte),
        timestamp__gte: optionalString(input.timestamp__gte),
      },
    },
    "execute",
  );
  if (!Array.isArray(payload))
    throw new ProviderRequestError(502, "webshare list_stats response was not an array", payload);
  return {
    stats: payload.map((item, index) =>
      requireObject(item, `webshare list_stats returned a non-object item at index ${index}`),
    ),
  };
}

async function webshareRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: WebshareRequestInput,
  phase: WebshareRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildWebshareUrl(request.path, request.query), {
      method: "GET",
      headers: webshareHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error instanceof Error ? error.message : "webshare request failed",
    );
  }
  let payload: unknown;
  try {
    payload = await readWebsharePayload(response);
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "invalid webshare response payload");
  }
  if (!response.ok) throw createWebshareError(response, payload, phase);
  return payload;
}

function buildWebshareUrl(path: string, query?: Record<string, WebshareQueryValue>): URL {
  const url = new URL(path, webshareApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

function webshareHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Token ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readWebsharePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json() as Promise<unknown>;
  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message, value);
  return record;
}

function createWebshareError(response: Response, payload: unknown, phase: WebshareRequestPhase): ProviderRequestError {
  const errorBody = optionalRecord(payload);
  const detail =
    optionalString(errorBody?.detail) ??
    optionalString(errorBody?.error) ??
    optionalString(errorBody?.message) ??
    (typeof payload === "string" && payload.length > 0 ? payload : undefined);
  const message = detail ?? (response.statusText || `webshare request failed with status ${response.status}`);
  if (phase === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404)
    return new ProviderRequestError(response.status, message, payload);
  if (response.status === 401 || response.status === 403)
    return new ProviderRequestError(response.status, message, payload);
  return new ProviderRequestError(response.status || 502, message, payload);
}
