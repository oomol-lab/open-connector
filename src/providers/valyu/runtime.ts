import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const valyuApiBaseUrl = "https://api.valyu.ai";

type ValyuActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const valyuActionHandlers: ProviderActionHandlers<"valyu", ValyuActionHandler> = {
  async search(input, context) {
    const payload = await valyuRequest({
      path: "/v1/search",
      method: "POST",
      body: compactObject({
        query: input.query,
        max_num_results: input.max_num_results,
        search_type: input.search_type,
        max_price: input.max_price,
        relevance_threshold: input.relevance_threshold,
        included_sources: input.included_sources,
        excluded_sources: input.excluded_sources,
        source_biases: input.source_biases,
        instructions: input.instructions,
        is_tool_call: input.is_tool_call,
        response_length: input.response_length,
        start_date: input.start_date,
        end_date: input.end_date,
        country_code: input.country_code,
        fast_mode: input.fast_mode,
        url_only: input.url_only,
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const response = asObject(payload);
    return {
      ...response,
      results: readArray(response.results).map(normalizeSearchResult),
      results_by_source: optionalRecord(response.results_by_source) ?? {},
      raw: response,
    };
  },
};

export async function validateValyuCredential(
  apiKey: string,
  fetcher: ProviderFetch,
): Promise<CredentialValidationResult> {
  const payload = await valyuRequest({
    path: "/v1/datasources/categories",
    method: "GET",
    apiKey,
    fetcher,
    phase: "validate",
  });
  const response = asObject(payload);
  return {
    profile: {
      accountId: "valyu-api-key",
      displayName: "Valyu API Key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: valyuApiBaseUrl,
      validationEndpoint: "/v1/datasources/categories",
      datasourceCategoryCount: Array.isArray(response.categories) ? response.categories.length : undefined,
    },
  };
}

async function valyuRequest(input: {
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(new URL(input.path, valyuApiBaseUrl), {
      method: input.method,
      headers: valyuHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readValyuPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `valyu request failed: ${error.message}` : "valyu request failed",
    );
  }

  if (!response.ok) {
    throw createValyuError(response, payload, input.phase);
  }
  return payload;
}

function valyuHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-api-key": apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function readValyuPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createValyuError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? (response.statusText.trim() || "valyu request failed");
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && (response.status === 401 || response.status === 403))
    return new ProviderRequestError(400, message);
  if (phase === "execute" && response.status === 401) return new ProviderRequestError(401, message);
  if (response.status === 400 || response.status === 422) return new ProviderRequestError(400, message);
  if (response.status === 402 || response.status === 403) return new ProviderRequestError(response.status, message);
  return new ProviderRequestError(response.status || 502, message);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const object = optionalRecord(payload);
  const error = optionalString(object?.error);
  if (error) return error;
  return optionalString(object?.message);
}

function normalizeSearchResult(value: unknown): Record<string, unknown> {
  const input = asObject(value);
  return compactObject({
    id: optionalString(input.id),
    title: optionalString(input.title),
    url: optionalString(input.url),
    content: input.content,
    description: input.description === null ? null : optionalString(input.description),
    source: optionalString(input.source),
    price: input.price,
    length: input.length,
    image_url: input.image_url,
    relevance_score: input.relevance_score,
    data_type: optionalString(input.data_type),
    source_type: optionalString(input.source_type),
    publication_date: optionalString(input.publication_date),
    doi: optionalString(input.doi),
    citation: optionalString(input.citation),
    citation_count: input.citation_count,
    authors: Array.isArray(input.authors) ? input.authors.map((item) => String(item)) : undefined,
    references: optionalString(input.references),
    metadata: optionalRecord(input.metadata),
    raw: input,
  });
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "valyu returned an invalid JSON object");
  }
  return record;
}
