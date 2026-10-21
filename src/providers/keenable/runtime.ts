import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalObjectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
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
  phase?: "execute" | "validate";
}

type KeenableActionHandler = (input: Record<string, unknown>, context: KeenableContext) => Promise<unknown>;

export const keenableActionHandlers: ProviderActionHandlers<"keenable", KeenableActionHandler> = {
  async search(input, context) {
    const payload = await requestKeenable({
      context,
      method: "POST",
      path: context.apiKey ? "/v1/search" : "/v1/search/public",
      body: compactObject({
        query: requiredInputString(input.query, "query"),
        max_results: optionalInteger(input.maxResults),
        site: optionalString(input.site),
        published_after: optionalString(input.publishedAfter),
        published_before: optionalString(input.publishedBefore),
      }),
    });
    return {
      results: optionalObjectArray(payload.results, "results", providerResponseError).map(normalizeSearchResult),
    };
  },
  async fetch_page(input, context) {
    // Keenable fetches the page on its side; the runtime only sends the URL as a query parameter.
    const pageUrl = assertPublicHttpUrl(requiredInputString(input.url, "url"), {
      fieldName: "url",
      createError: providerInputError,
    }).href;
    const payload = await requestKeenable({
      context,
      method: "GET",
      path: context.apiKey ? "/v1/fetch" : "/v1/fetch/public",
      query: { url: pageUrl },
    });
    return {
      url: optionalString(payload.url) ?? pageUrl,
      title: optionalString(payload.title) ?? null,
      content: optionalRawString(payload.content) ?? "",
    };
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
 * Validate a key with a one-result search on the keyed endpoint, which rejects an unknown key with 401.
 */
export async function validateKeenableCredential(
  input: { apiKey: string },
  options: { fetcher: ProviderFetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await requestKeenable({
    context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    method: "POST",
    path: "/v1/search",
    body: { query: "Keenable", max_results: 1 },
    phase: "validate",
  });
  return {
    profile: { displayName: "Keenable API Key" },
    grantedScopes: [],
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
      throw await readKeenableError(response, request);
    }
    const payload = parseProviderJsonBodyText(await readProviderTextBody(response, "Keenable response"), {
      emptyBody: {},
      invalidJsonMessage: "Keenable returned malformed JSON",
    });
    return requiredResponseRecord(payload, "Keenable response");
  });
}

/**
 * Read a Keenable `{ error, message }` response. A 401 or 403 is a credential to reconnect only
 * when an action sent a key; without a key, or while validating one, it is reported as invalid input.
 */
async function readKeenableError(response: Response, request: KeenableRequest): Promise<ProviderRequestError> {
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
  if ((status === 401 || status === 403) && (!request.context.apiKey || request.phase === "validate")) {
    return new ProviderRequestError(400, message, details);
  }
  return new ProviderRequestError(status, message, details);
}

function normalizeSearchResult(result: Record<string, unknown>): Record<string, unknown> {
  return {
    title: optionalRawString(result.title) ?? "",
    url: optionalRawString(result.url) ?? "",
    snippet: optionalRawString(result.snippet) ?? "",
    acquiredAt: optionalString(result.acquired_at) ?? null,
  };
}
