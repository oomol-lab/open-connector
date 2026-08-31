import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "brave_search";
const braveSearchApiBaseUrl = "https://api.search.brave.com";

type BraveSearchPhase = "validate" | "execute";
type BraveSearchQueryValue = boolean | number | string | string[] | undefined;
type BraveSearchActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const braveSearchActionHandlers: ProviderActionHandlers<"brave_search", BraveSearchActionHandler> = {
  async web_search(input, context) {
    const payload = await requestBraveSearchJson("/res/v1/web/search", buildWebSearchQuery(input), context, "execute");
    return normalizeWebSearchResponse(payload);
  },
  async news_search(input, context) {
    const payload = await requestBraveSearchJson(
      "/res/v1/news/search",
      buildNewsSearchQuery(input),
      context,
      "execute",
    );
    return normalizeCollectionResponse(payload);
  },
  async video_search(input, context) {
    const payload = await requestBraveSearchJson(
      "/res/v1/videos/search",
      buildVideoSearchQuery(input),
      context,
      "execute",
    );
    return normalizeCollectionResponse(payload);
  },
  async image_search(input, context) {
    const payload = await requestBraveSearchJson(
      "/res/v1/images/search",
      buildImageSearchQuery(input),
      context,
      "execute",
    );
    return normalizeCollectionResponse(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, braveSearchActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestBraveSearchJson(
      "/res/v1/web/search",
      {
        q: "brave search",
        count: 1,
        result_filter: "web",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "brave_search",
        displayName: "Brave Search API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/res/v1/web/search",
        validationQuery: "brave search",
        validationResultFilter: "web",
        apiBaseUrl: braveSearchApiBaseUrl,
      },
    };
  },
};

async function requestBraveSearchJson(
  path: string,
  query: Record<string, BraveSearchQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: BraveSearchPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildBraveSearchUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-subscription-token": context.apiKey,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Brave Search request failed: ${error.message}` : "Brave Search request failed",
    );
  }

  if (!response.ok) {
    throw createBraveSearchError(response.status, payload, phase);
  }
  return payload;
}

function buildBraveSearchUrl(path: string, query: Record<string, BraveSearchQueryValue>): string {
  const url = new URL(path, braveSearchApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(key, child);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function buildWebSearchQuery(input: Record<string, unknown>): Record<string, BraveSearchQueryValue> {
  return compactObject({
    q: requiredInputString(input.q, "q"),
    search_lang: optionalString(input.search_lang),
    ui_lang: optionalString(input.ui_lang),
    country: optionalString(input.country),
    safesearch: optionalString(input.safesearch),
    count: optionalInteger(input.count),
    offset: optionalInteger(input.offset),
    spellcheck: optionalBoolean(input.spellcheck),
    freshness: optionalString(input.freshness),
    result_filter: optionalString(input.result_filter),
    extra_snippets: optionalBoolean(input.extra_snippets),
    goggles: readOptionalStringArray(input.goggles) ?? optionalString(input.goggles),
    text_decorations: optionalBoolean(input.text_decorations),
    units: optionalString(input.units),
    operators: optionalBoolean(input.operators),
    include_fetch_metadata: optionalBoolean(input.include_fetch_metadata),
  }) as Record<string, BraveSearchQueryValue>;
}

function buildNewsSearchQuery(input: Record<string, unknown>): Record<string, BraveSearchQueryValue> {
  return compactObject({
    q: requiredInputString(input.q, "q"),
    search_lang: optionalString(input.search_lang),
    ui_lang: optionalString(input.ui_lang),
    country: optionalString(input.country),
    safesearch: optionalString(input.safesearch),
    count: optionalInteger(input.count),
    offset: optionalInteger(input.offset),
    spellcheck: optionalBoolean(input.spellcheck),
    freshness: optionalString(input.freshness),
    extra_snippets: optionalBoolean(input.extra_snippets),
    goggles: readOptionalStringArray(input.goggles) ?? optionalString(input.goggles),
    operators: optionalBoolean(input.operators),
    include_fetch_metadata: optionalBoolean(input.include_fetch_metadata),
  }) as Record<string, BraveSearchQueryValue>;
}

function buildVideoSearchQuery(input: Record<string, unknown>): Record<string, BraveSearchQueryValue> {
  return compactObject({
    q: requiredInputString(input.q, "q"),
    search_lang: optionalString(input.search_lang),
    ui_lang: optionalString(input.ui_lang),
    country: optionalString(input.country),
    safesearch: optionalString(input.safesearch),
    count: optionalInteger(input.count),
    offset: optionalInteger(input.offset),
    spellcheck: optionalBoolean(input.spellcheck),
    freshness: optionalString(input.freshness),
    operators: optionalBoolean(input.operators),
    include_fetch_metadata: optionalBoolean(input.include_fetch_metadata),
  }) as Record<string, BraveSearchQueryValue>;
}

function buildImageSearchQuery(input: Record<string, unknown>): Record<string, BraveSearchQueryValue> {
  return compactObject({
    q: requiredInputString(input.q, "q"),
    search_lang: optionalString(input.search_lang),
    country: optionalString(input.country),
    safesearch: optionalString(input.safesearch),
    count: optionalInteger(input.count),
    spellcheck: optionalBoolean(input.spellcheck),
  }) as Record<string, BraveSearchQueryValue>;
}

function normalizeWebSearchResponse(payload: unknown): Record<string, unknown> {
  const record = requireOutputRecord(payload, "Brave Search response");

  return compactObject({
    type: optionalString(record.type) ?? "search",
    query: optionalNullableRecord(record.query),
    web: optionalNullableRecord(record.web),
    news: optionalNullableRecord(record.news),
    videos: optionalNullableRecord(record.videos),
    locations: optionalNullableRecord(record.locations),
    discussions: optionalNullableRecord(record.discussions),
    faq: optionalNullableRecord(record.faq),
    infobox: optionalNullableRecord(record.infobox),
    mixed: optionalNullableRecord(record.mixed),
    summarizer: optionalNullableRecord(record.summarizer),
    rich: optionalNullableRecord(record.rich),
  });
}

function normalizeCollectionResponse(payload: unknown): Record<string, unknown> {
  const record = requireOutputRecord(payload, "Brave Search response");

  return compactObject({
    type: optionalString(record.type) ?? "search",
    query: optionalNullableRecord(record.query),
    results: optionalObjectArray(record.results),
    extra: optionalNullableRecord(record.extra),
  });
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Brave Search returned invalid JSON");
  }
}

function createBraveSearchError(status: number, payload: unknown, phase: BraveSearchPhase): ProviderRequestError {
  const message = extractBraveSearchErrorMessage(payload) ?? `Brave Search request failed with ${status || 500}`;
  const code = extractBraveSearchErrorCode(payload);

  if (status === 429 || code === "QUOTA_LIMITED" || code === "RATE_LIMITED" || code === "USAGE_LIMIT_EXCEEDED") {
    return new ProviderRequestError(429, message, payload);
  }

  if (
    phase === "validate" &&
    (status === 400 || status === 401 || status === 403 || status === 404 || status === 422)
  ) {
    return new ProviderRequestError(400, message, payload);
  }

  if (
    phase === "execute" &&
    (status === 401 || code === "SUBSCRIPTION_TOKEN_INVALID" || code === "SUBSCRIPTION_NOT_FOUND")
  ) {
    return new ProviderRequestError(401, message, payload);
  }

  if (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 422 ||
    code === "RESOURCE_NOT_ALLOWED" ||
    code === "OPTION_NOT_IN_PLAN" ||
    code === "INVALID_URL"
  ) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractBraveSearchErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.detail) ?? optionalString(error?.code);
}

function extractBraveSearchErrorCode(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.code);
}

function optionalNullableRecord(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalRecord(value);
}

function optionalObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => requireOutputRecord(item, "Brave Search result item"));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result: string[] = [];
  for (const item of value) {
    const text = optionalString(item);
    if (text) {
      result.push(text);
    }
  }

  return result.length > 0 ? result : undefined;
}

function requireOutputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, message));
}
