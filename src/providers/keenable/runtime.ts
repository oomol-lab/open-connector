import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  parseProviderJsonBodyText,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
export const keenableApiBaseUrl = "https://api.keenable.ai";
/** Keenable requires keyless callers to name their app in the X-Keenable-Title header. */
export const keenableAppTitle = "OpenConnector";
interface KeenableContext {
  apiKey?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
interface KeenableRequest {
  context: KeenableContext;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}
type KeenableActionHandler = (input: Record<string, unknown>, context: KeenableContext) => Promise<unknown>;
export const keenableActionHandlers: Record<string, KeenableActionHandler> = {
  search(input, context) {
    return requestKeenable({
      context,
      method: "POST",
      path: context.apiKey ? "/v1/search" : "/v1/search/public",
      body: input,
    });
  },
  fetch(input, context) {
    const query = Object.fromEntries(
      Object.entries(input)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    return requestKeenable({ context, method: "GET", path: context.apiKey ? "/v1/fetch" : "/v1/fetch/public", query });
  },
};
/**
 * Build the action context. A no_auth connection has no key and uses the keyless endpoints.
 */
export async function createKeenableContext(
  context: ExecutionContext,
  fetcher: ProviderFetch,
): Promise<KeenableContext> {
  const credential = await context.getCredential("keenable");
  return {
    apiKey: credential?.authType === "api_key" ? credential.apiKey : undefined,
    fetcher,
    signal: context.signal,
  };
}
/**
 * Validate a key through a one-result search on the keyed endpoint.
 */
export async function validateKeenableCredential(
  input: {
    apiKey: string;
  },
  options: {
    fetcher: ProviderFetch;
    signal?: AbortSignal;
  },
): Promise<CredentialValidationResult> {
  await requestKeenable({
    context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    method: "POST",
    path: "/v1/search",
    body: { query: "Keenable", max_results: 1 },
  });
  return {
    profile: { displayName: "Keenable API Key" },
    metadata: { apiBaseUrl: keenableApiBaseUrl, validationEndpoint: "/v1/search" },
  };
}
async function requestKeenable(request: KeenableRequest): Promise<Record<string, unknown>> {
  const { context } = request;
  const url = new URL(request.path, keenableApiBaseUrl);
  setSearchParams(url, request.query ?? {});
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-keenable-title": keenableAppTitle,
  });
  if (context.apiKey) headers.set("x-api-key", context.apiKey);
  if (request.body) headers.set("content-type", "application/json");
  return runProviderRequest({ signal: context.signal, label: "Keenable" }, async (signal) => {
    const response = await context.fetcher(url, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal,
    });
    if (!response.ok) {
      throw await readKeenableError(response);
    }
    const payload = parseProviderJsonBodyText(await readProviderTextBody(response, "Keenable response"), {
      emptyBody: {},
      invalidJsonMessage: "Keenable returned malformed JSON",
    });
    return requiredResponseRecord(payload, "Keenable response");
  });
}
async function readKeenableError(response: Response): Promise<ProviderRequestError> {
  const status = response.status;
  const body = optionalRecord(
    parseProviderJsonBodyText(await readProviderErrorTextBody(response, "Keenable error response"), {
      emptyBody: {},
      invalidJsonMessage: "Keenable returned malformed JSON",
      invalidJsonFallback: () => ({}),
    }),
  );
  const message =
    optionalString(body?.message) ?? optionalString(body?.error) ?? `Keenable request failed with HTTP ${status}`;
  const details = withRetryAfterSeconds(response, body ?? {});
  return new ProviderRequestError(status, message, details, status === 429 ? "rate_limited" : "provider_error");
}
