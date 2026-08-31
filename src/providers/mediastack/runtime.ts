import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const mediastackApiBaseUrl = "https://api.mediastack.com/v1";

type MediastackPhase = "validate" | "execute";
type MediastackQueryValue = string | number | undefined;
type MediastackActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MediastackActionHandler = (input: Record<string, unknown>, context: MediastackActionContext) => Promise<unknown>;

interface MediastackRequestInput extends MediastackActionContext {
  path: string;
  query: Record<string, MediastackQueryValue>;
  phase: MediastackPhase;
}

export const mediastackActionHandlers: ProviderActionHandlers<"mediastack", MediastackActionHandler> = {
  search_news_sources(input, context) {
    return searchNewsSources(input, context);
  },
  search_live_news(input, context) {
    return searchLiveNews(input, context);
  },
};

export async function validateMediastackCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestMediastackJson({
    path: "/news",
    query: {
      limit: 1,
    },
    apiKey: input.apiKey,
    fetcher,
    signal,
    phase: "validate",
  });

  const pagination = normalizePagination(requireProviderRecord(payload.pagination, "pagination"));
  const firstArticle = readFirstDataObject(payload);

  return {
    profile: {
      accountId: "mediastack",
      displayName: "Mediastack API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/news",
      apiBaseUrl: mediastackApiBaseUrl,
      articleCount: pagination.total,
      validationLimit: pagination.limit,
      firstArticleSource: firstArticle?.source ?? undefined,
    }),
  };
}

async function searchNewsSources(input: Record<string, unknown>, context: MediastackActionContext): Promise<unknown> {
  const payload = await requestMediastackJson({
    ...context,
    path: "/sources",
    query: {
      search: requiredInputString(input.search, "search"),
      countries: optionalString(input.countries),
      languages: optionalString(input.languages),
      categories: optionalString(input.categories),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
    phase: "execute",
  });

  return {
    sources: requireArray(payload.data, "data").map((item, index) =>
      normalizeSource(requireProviderRecord(item, `data[${index}]`)),
    ),
    pagination: normalizePagination(requireProviderRecord(payload.pagination, "pagination")),
  };
}

async function searchLiveNews(input: Record<string, unknown>, context: MediastackActionContext): Promise<unknown> {
  const payload = await requestMediastackJson({
    ...context,
    path: "/news",
    query: {
      keywords: optionalString(input.keywords),
      sources: optionalString(input.sources),
      countries: optionalString(input.countries),
      languages: optionalString(input.languages),
      categories: optionalString(input.categories),
      sort: optionalString(input.sort),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
    phase: "execute",
  });

  return {
    articles: requireArray(payload.data, "data").map((item, index) =>
      normalizeArticle(requireProviderRecord(item, `data[${index}]`)),
    ),
    pagination: normalizePagination(requireProviderRecord(payload.pagination, "pagination")),
  };
}

async function requestMediastackJson(input: MediastackRequestInput): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.signal);

  try {
    const response = await input.fetcher(buildMediastackUrl(input.path, input.query, input.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readMediastackPayload(response);
    const errorObject = optionalRecord(payload.error);

    if (!response.ok || errorObject) {
      throw createMediastackError(response.status, payload, input.phase);
    }

    return requireProviderRecord(payload, "payload");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Mediastack request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mediastack request failed: ${error.message}` : "Mediastack request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildMediastackUrl(path: string, query: Record<string, MediastackQueryValue>, apiKey: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${mediastackApiBaseUrl}/`);
  for (const [key, value] of Object.entries(compactObject({ ...query, access_key: apiKey }))) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readMediastackPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Mediastack returned an empty response");
  }

  try {
    return requiredRecord(JSON.parse(text) as unknown, "payload", (message) => new ProviderRequestError(502, message));
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Mediastack returned invalid JSON");
  }
}

function createMediastackError(
  status: number,
  payload: Record<string, unknown>,
  phase: MediastackPhase,
): ProviderRequestError {
  const message = readMediastackErrorMessage(payload) ?? `Mediastack request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status || 401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function readMediastackErrorMessage(payload: Record<string, unknown>): string | undefined {
  const errorObject = optionalRecord(payload.error);
  const errorMessage = optionalStringOrNull(errorObject?.message);
  if (typeof errorMessage === "string" && errorMessage.trim() !== "") {
    return errorMessage;
  }

  const topLevelMessage = optionalStringOrNull(payload.message);
  if (typeof topLevelMessage === "string" && topLevelMessage.trim() !== "") {
    return topLevelMessage;
  }

  return undefined;
}

function readFirstDataObject(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  const data = requireArray(payload.data, "data");
  if (data.length < 1) {
    return undefined;
  }
  return normalizeArticle(requireProviderRecord(data[0], "data[0]"));
}

function normalizePagination(input: Record<string, unknown>): Record<string, number> {
  return {
    limit: requiredInteger(input.limit, "pagination.limit"),
    offset: requiredInteger(input.offset, "pagination.offset"),
    count: requiredInteger(input.count, "pagination.count"),
    total: requiredInteger(input.total, "pagination.total"),
  };
}

function normalizeSource(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalStringOrNull(input.id),
    name: optionalStringOrNull(input.name),
    description: optionalStringOrNull(input.description),
    category: optionalStringOrNull(input.category),
    country: optionalStringOrNull(input.country),
    language: optionalStringOrNull(input.language),
    url: optionalStringOrNull(input.url),
  };
}

function normalizeArticle(input: Record<string, unknown>): Record<string, unknown> {
  return {
    author: optionalStringOrNull(input.author),
    title: optionalStringOrNull(input.title),
    description: optionalStringOrNull(input.description),
    url: optionalStringOrNull(input.url),
    source: optionalStringOrNull(input.source),
    image: optionalStringOrNull(input.image),
    category: optionalStringOrNull(input.category),
    language: optionalStringOrNull(input.language),
    country: optionalStringOrNull(input.country),
    publishedAt: optionalStringOrNull(input.published_at),
  };
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Mediastack response is missing ${fieldName}`, value);
  }
  return value;
}

function requireProviderRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Mediastack response is missing ${fieldName}`, value),
  );
}

function requiredInteger(value: unknown, fieldName: string): number {
  const numeric = optionalNumber(value);
  if (numeric === undefined || !Number.isInteger(numeric)) {
    throw new ProviderRequestError(502, `Mediastack response is missing ${fieldName}`);
  }
  return numeric;
}
