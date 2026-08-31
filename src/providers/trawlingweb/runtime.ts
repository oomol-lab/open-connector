import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const trawlingwebApiBaseUrl = "https://api.trawlingweb.com";

export const trawlingwebActionHandlers: ProviderActionHandlers<
  "trawlingweb",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  search_news(input, context) {
    return requestNews(context, searchQuery(input), "execute");
  },
};

export async function validateTrawlingwebCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestNews(
    { apiKey, fetcher, signal },
    { q: "TrawlingWeb", country_pref: "es", size: "1", format: "json" },
    "validate",
  );
  return {
    profile: { displayName: "TrawlingWeb API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: trawlingwebApiBaseUrl, validationEndpoint: "/" },
  };
}

function searchQuery(input: Record<string, unknown>): Record<string, string> {
  return queryParams({
    q: requiredString(input.query, "query"),
    country_pref: requiredString(input.countryPreference, "countryPreference").toLowerCase(),
    ts: optionalInteger(input.fromTimestamp),
    tsi: optionalInteger(input.toTimestamp),
    size: optionalInteger(input.size),
    sort: optionalString(input.sortBy),
    order: optionalString(input.order),
    format: "json",
  });
}

async function requestNews(
  context: ApiKeyProviderContext,
  query: Record<string, string>,
  phase: "validate" | "execute",
): Promise<Record<string, unknown>> {
  const url = new URL("/", trawlingwebApiBaseUrl);
  url.searchParams.set("token", context.apiKey);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "TrawlingWeb returned invalid JSON",
    });
    if (!response.ok) throw trawlingwebError(response.status, payload, phase);
    return normalizeSearch(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "TrawlingWeb request timed out");
    throw new ProviderRequestError(502, "TrawlingWeb request failed");
  } finally {
    timeout.cleanup();
  }
}

function normalizeSearch(payload: unknown): Record<string, unknown> {
  const response = optionalRecord(optionalRecord(payload)?.response);
  if (!response || !Array.isArray(response.data)) {
    throw new ProviderRequestError(502, "TrawlingWeb response did not include response.data");
  }
  return compactObject({
    data: response.data,
    requestLeft: parseNonNegativeInteger(response.requestLeft),
    totalResults: parseNonNegativeInteger(response.totalResults),
    restResults: parseNonNegativeInteger(response.restResults),
    nextCursor: nextCursor(optionalString(response.next)),
  });
}

function nextCursor(next: string | undefined): Record<string, number> | undefined {
  if (!next) return undefined;
  try {
    const url = new URL(next);
    const cursor = compactObject({
      fromTimestamp: parseNonNegativeInteger(url.searchParams.get("ts")),
      toTimestamp: parseNonNegativeInteger(url.searchParams.get("tsi")),
    });
    return Object.keys(cursor).length > 0 ? (cursor as Record<string, number>) : undefined;
  } catch {
    return undefined;
  }
}

function parseNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function trawlingwebError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const body = optionalRecord(payload);
  const nested = optionalRecord(body?.response);
  const message =
    optionalString(body?.message) ??
    optionalString(body?.error) ??
    optionalString(nested?.message) ??
    optionalString(nested?.error) ??
    `TrawlingWeb request failed with HTTP ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
