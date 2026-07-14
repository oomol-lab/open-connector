import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, readProviderJsonBody } from "../provider-runtime.ts";

export const duneApiBaseUrl = "https://api.dune.com/api/v1";

type DuneActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const duneActionHandlers: Record<string, DuneActionHandler> = {
  list_queries(input, context) {
    return duneGet("/queries", { limit: optionalInteger(input.limit), offset: optionalInteger(input.offset) }, context);
  },
  get_query(input, context) {
    return duneGet(`/query/${encodePathSegment(input.queryId)}`, {}, context);
  },
  get_latest_query_result(input, context) {
    return duneGet(`/query/${encodePathSegment(input.queryId)}/results`, resultQuery(input), context);
  },
  get_execution_status(input, context) {
    return duneGet(`/execution/${encodePathSegment(input.executionId)}/status`, {}, context);
  },
  get_execution_result(input, context) {
    return duneGet(`/execution/${encodePathSegment(input.executionId)}/results`, resultQuery(input), context);
  },
};

function resultQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return {
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    columns: optionalString(input.columns),
    filters: optionalString(input.filters),
    sample_count: optionalInteger(input.sampleCount),
    allow_partial_results: optionalBoolean(input.allowPartialResults),
    ignore_max_credits_per_request: optionalBoolean(input.ignoreMaxCreditsPerRequest),
  };
}

async function duneGet(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const url = new URL(`${duneApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        "x-dune-api-key": context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Dune request failed: ${error.message}` : "Dune request failed",
    );
  }

  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Dune returned invalid JSON",
    invalidJsonFallback: (text) => text,
  });
  if (!response.ok) throw duneError(response, payload);
  return payload;
}

function duneError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    response.statusText ??
    `Dune request failed with status ${response.status}`;
  return new ProviderRequestError(response.status || 502, message, payload);
}
