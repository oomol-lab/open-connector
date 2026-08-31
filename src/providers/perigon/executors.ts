import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "perigon";
const perigonBaseUrl = "https://api.perigon.io";

type PerigonPhase = "validate" | "execute";
type PerigonQueryValue = string | number | boolean | readonly (string | number | boolean)[] | undefined;
type PerigonActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const articleQueryKeys = [
  "q",
  "title",
  "desc",
  "content",
  "summary",
  "from",
  "to",
  "addDateFrom",
  "addDateTo",
  "category",
  "topic",
  "source",
  "sourceGroup",
  "language",
  "country",
  "label",
  "medium",
  "personName",
  "personWikidataId",
  "companyName",
  "companyDomain",
  "companyId",
  "companySymbol",
  "journalistId",
  "author",
  "clusterId",
  "showReprints",
  "sortBy",
  "page",
  "size",
  "showNumResults",
];

const storyQueryKeys = [
  ...articleQueryKeys,
  "name",
  "initializedFrom",
  "initializedTo",
  "updatedFrom",
  "updatedTo",
  "minUniqueSources",
  "minSourceDiversity",
];

const sourceQueryKeys = [
  "q",
  "name",
  "sourceGroup",
  "domain",
  "paywall",
  "minMonthlyPosts",
  "maxMonthlyPosts",
  "minMonthlyVisits",
  "maxMonthlyVisits",
  "showSubdomains",
  "sourceLat",
  "sourceLon",
  "sourceMaxDistance",
  "sortBy",
  "page",
  "size",
  "showNumResults",
];

const topicQueryKeys = ["name", "category", "subcategory", "page", "size"];

const journalistQueryKeys = [
  "q",
  "name",
  "twitter",
  "minMonthlyPosts",
  "maxMonthlyPosts",
  "updatedAtFrom",
  "updatedAtTo",
  "page",
  "size",
  "showNumResults",
];

const peopleQueryKeys = ["q", "name", "wikidataId", "page", "size", "showNumResults"];

const companyQueryKeys = [
  "q",
  "name",
  "domain",
  "symbol",
  "id",
  "industry",
  "sector",
  "country",
  "exchange",
  "page",
  "size",
  "showNumResults",
];

const wikipediaQueryKeys = [
  "q",
  "title",
  "summary",
  "text",
  "reference",
  "scrapedAtFrom",
  "scrapedAtTo",
  "wikiRevisionFrom",
  "wikiRevisionTo",
  "pageviewsFrom",
  "pageviewsTo",
  "withPageviews",
  "id",
  "sectionId",
  "category",
  "wikiCode",
  "wikidataId",
  "wikidataInstanceOfId",
  "wikidataInstanceOfLabel",
  "wikiNamespace",
  "wikiPageId",
  "wikiRevisionId",
  "sortBy",
  "page",
  "size",
  "showNumResults",
];

const summarizeBodyKeys = [
  "prompt",
  "maxArticleCount",
  "returnedArticleCount",
  "maxTokens",
  "temperature",
  "topP",
  "model",
  "method",
  "summarizeFields",
];

const vectorNewsBodyKeys = ["prompt", "page", "size", "pubDateFrom", "pubDateTo", "showReprints", "filter"];
const vectorWikipediaBodyKeys = [
  "prompt",
  "page",
  "size",
  "pageviewsFrom",
  "pageviewsTo",
  "wikiRevisionFrom",
  "wikiRevisionTo",
  "filter",
];
const summarizeTrimmedBodyKeys = new Set(["model"]);
const vectorNewsTrimmedBodyKeys = new Set(["prompt", "pubDateFrom", "pubDateTo"]);
const vectorWikipediaTrimmedBodyKeys = new Set(["prompt", "wikiRevisionFrom", "wikiRevisionTo"]);

export const perigonActionHandlers: ProviderActionHandlers<"perigon", PerigonActionHandler> = {
  async search_articles(input, context) {
    return normalizeListResponse(
      await requestPerigonJson(
        "GET",
        "/v1/articles/all",
        pickQuery(input, articleQueryKeys),
        undefined,
        context,
        "execute",
      ),
      "articles",
    );
  },
  async search_stories(input, context) {
    return normalizeListResponse(
      await requestPerigonJson(
        "GET",
        "/v1/stories/all",
        pickQuery(input, storyQueryKeys),
        undefined,
        context,
        "execute",
      ),
      "stories",
    );
  },
  async search_sources(input, context) {
    return normalizeResultsResponse(
      await requestPerigonJson(
        "GET",
        "/v1/sources/all",
        pickQuery(input, sourceQueryKeys),
        undefined,
        context,
        "execute",
      ),
    );
  },
  async search_topics(input, context) {
    return normalizeTopicsResponse(
      await requestPerigonJson(
        "GET",
        "/v1/topics/all",
        pickQuery(input, topicQueryKeys),
        undefined,
        context,
        "execute",
      ),
    );
  },
  async search_journalists(input, context) {
    return normalizeResultsResponse(
      await requestPerigonJson(
        "GET",
        "/v1/journalists/all",
        pickQuery(input, journalistQueryKeys),
        undefined,
        context,
        "execute",
      ),
    );
  },
  async get_journalist(input, context) {
    const id = requiredString(input.id, "id", providerInputError);
    const payload = await requestPerigonJson(
      "GET",
      `/v1/journalists/${encodeURIComponent(id)}`,
      {},
      undefined,
      context,
      "execute",
    );
    const record = readObject(payload, "Perigon journalist response");

    return {
      journalist: record,
      raw: record,
    };
  },
  async search_people(input, context) {
    return normalizeResultsResponse(
      await requestPerigonJson(
        "GET",
        "/v1/people/all",
        pickQuery(input, peopleQueryKeys),
        undefined,
        context,
        "execute",
      ),
    );
  },
  async search_companies(input, context) {
    return normalizeResultsResponse(
      await requestPerigonJson(
        "GET",
        "/v1/companies/all",
        pickQuery(input, companyQueryKeys),
        undefined,
        context,
        "execute",
      ),
    );
  },
  async search_wikipedia(input, context) {
    return normalizeResultsResponse(
      await requestPerigonJson(
        "GET",
        "/v1/wikipedia/all",
        pickQuery(input, wikipediaQueryKeys),
        undefined,
        context,
        "execute",
      ),
    );
  },
  async summarize_news(input, context) {
    const payload = await requestPerigonJson(
      "POST",
      "/v1/summarize",
      pickQuery(input, articleQueryKeys),
      pickBody(input, summarizeBodyKeys, summarizeTrimmedBodyKeys),
      context,
      "execute",
    );
    const record = readObject(payload, "Perigon summary response");

    return {
      status: readNullableInteger(record.status),
      numResults: readNullableInteger(record.numResults),
      summary: optionalString(record.summary) ?? null,
      results: readArray(record.results),
      raw: record,
    };
  },
  async vector_search_news(input, context) {
    return normalizeVectorResponse(
      await requestPerigonJson(
        "POST",
        "/v1/vector/news/all",
        {},
        pickBody(input, vectorNewsBodyKeys, vectorNewsTrimmedBodyKeys),
        context,
        "execute",
      ),
    );
  },
  async vector_search_wikipedia(input, context) {
    return normalizeVectorResponse(
      await requestPerigonJson(
        "POST",
        "/v1/vector/wikipedia/all",
        {},
        pickBody(input, vectorWikipediaBodyKeys, vectorWikipediaTrimmedBodyKeys),
        context,
        "execute",
      ),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, perigonActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await requestPerigonJson("GET", "/v1/topics/all", { size: 1 }, undefined, context, "validate");
    const record = readObject(payload, "Perigon validation response");

    return {
      profile: {
        accountId: "api_key",
        displayName: "Perigon API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/topics/all",
        apiBaseUrl: perigonBaseUrl,
        topicCount: optionalInteger(record.total) ?? null,
      },
    };
  },
};

async function requestPerigonJson(
  method: "GET" | "POST",
  path: string,
  query: Record<string, PerigonQueryValue>,
  body: Record<string, unknown> | undefined,
  context: ApiKeyProviderContext,
  phase: PerigonPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildPerigonUrl(path, query), {
      method,
      headers: perigonHeaders(context.apiKey, method === "POST"),
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Perigon request failed: ${error.message}` : "Perigon request failed",
    );
  }

  if (!response.ok) {
    throw createPerigonError(response.status, payload, phase);
  }
  return payload;
}

function perigonHeaders(apiKey: string, includeJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (includeJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildPerigonUrl(path: string, query: Record<string, PerigonQueryValue>): string {
  const url = new URL(path, `${perigonBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    appendQueryValue(url, key, value);
  }
  return url.toString();
}

function appendQueryValue(url: URL, key: string, value: PerigonQueryValue): void {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      url.searchParams.append(key, String(item));
    }
    return;
  }
  url.searchParams.set(key, String(value));
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, PerigonQueryValue> {
  const query: Record<string, PerigonQueryValue> = {};
  for (const key of keys) {
    const value = readQueryValue(input[key]);
    if (value !== undefined) {
      query[key] = value;
    }
  }
  return query;
}

function pickBody(
  input: Record<string, unknown>,
  keys: string[],
  trimmedStringKeys: Set<string>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    const value = trimmedStringKeys.has(key) ? trimStringValue(input[key]) : input[key];
    if (value !== undefined) {
      body[key] = value;
    }
  }
  return body;
}

function readQueryValue(value: unknown): PerigonQueryValue {
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (typeof trimmed === "string" && trimmed.length > 0) {
    return trimmed;
  }
  if (typeof trimmed === "number" || typeof trimmed === "boolean") {
    return trimmed;
  }
  if (Array.isArray(trimmed)) {
    const items = trimmed
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter(
        (item): item is string | number | boolean =>
          typeof item === "number" || typeof item === "boolean" || (typeof item === "string" && item.length > 0),
      );
    return items.length > 0 ? items : undefined;
  }
  return undefined;
}

function trimStringValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim();
  }
  return value;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Perigon returned invalid JSON");
  }
}

function createPerigonError(status: number, payload: unknown, phase: PerigonPhase): ProviderRequestError {
  const message = readErrorMessage(payload, status);

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function readErrorMessage(payload: unknown, status: number): string {
  const record = optionalRecord(payload);
  if (!record) {
    return `Perigon request failed with ${status}`;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title) ??
    `Perigon request failed with ${status}`
  );
}

function normalizeListResponse(payload: unknown, key: "articles" | "stories"): Record<string, unknown> {
  const record = readObject(payload, `Perigon ${key} response`);
  return {
    status: readNullableInteger(record.status),
    numResults: readNullableInteger(record.numResults),
    [key]: readArray(record[key]),
    raw: record,
  };
}

function normalizeResultsResponse(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "Perigon results response");
  return {
    status: readNullableInteger(record.status),
    numResults: readNullableInteger(record.numResults),
    results: readArray(record.results),
    raw: record,
  };
}

function normalizeTopicsResponse(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "Perigon topics response");
  return {
    total: readNullableInteger(record.total),
    data: readArray(record.data),
    raw: record,
  };
}

function normalizeVectorResponse(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "Perigon vector response");
  return {
    status: readNullableInteger(record.status),
    results: readArray(record.results),
    raw: record,
  };
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return record;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.perigon.io",
  auth: { type: "api_key_header", name: "x-api-key" },
});
