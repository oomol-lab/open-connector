import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "world_news_api";
const worldNewsApiBaseUrl = "https://api.worldnewsapi.com";

type WorldNewsApiQueryValue = string | number | undefined;
type WorldNewsApiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const worldNewsApiActionHandlers: ProviderActionHandlers<"world_news_api", WorldNewsApiActionHandler> = {
  search_news(input, context) {
    validateSearchNewsInput(input);
    return requestWorldNewsApiJson(
      "/search-news",
      compactObject({
        text: optionalString(input.text),
        language: optionalString(input.language),
        "source-countries": optionalString(input.sourceCountries),
        categories: optionalString(input.categories),
        "earliest-publish-date": optionalString(input.earliestPublishDate),
        "latest-publish-date": optionalString(input.latestPublishDate),
        "news-sources": optionalString(input.newsSources),
        authors: optionalString(input.authors),
        "location-filter": optionalString(input.locationFilter),
        entities: optionalString(input.entities),
        sort: optionalString(input.sort),
        "sort-direction": optionalString(input.sortDirection),
        "min-sentiment": optionalNumber(input.minSentiment),
        "max-sentiment": optionalNumber(input.maxSentiment),
        offset: optionalNumber(input.offset),
        number: optionalNumber(input.number),
      }),
      context,
      "execute",
    );
  },
  get_top_news(input, context) {
    return requestWorldNewsApiJson(
      "/top-news",
      compactObject({
        "source-country": requiredString(input.sourceCountry, "sourceCountry", providerInputError),
        language: optionalString(input.language),
        date: optionalString(input.date),
      }),
      context,
      "execute",
    );
  },
  retrieve_news(input, context) {
    return requestWorldNewsApiJson(
      "/retrieve-news",
      {
        ids: readRequiredIds(input.ids),
      },
      context,
      "execute",
    );
  },
  search_news_sources(input, context) {
    validateSearchNewsSourcesInput(input);
    return requestWorldNewsApiJson(
      "/search-news-sources",
      compactObject({
        name: optionalString(input.name),
        language: optionalString(input.language),
        "source-country": optionalString(input.sourceCountry),
      }),
      context,
      "execute",
    );
  },
  get_geo_coordinates(input, context) {
    return requestWorldNewsApiJson(
      "/geo-coordinates",
      compactObject({
        location: requiredString(input.location, "location", providerInputError),
        language: optionalString(input.language),
      }),
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, worldNewsApiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestWorldNewsApiJson(
      "/geo-coordinates",
      {
        location: "London",
        language: "en",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const record = requireObject(payload, "World News API validation response");
    return {
      profile: {
        accountId: "world-news-api-key",
        displayName: "World News API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/geo-coordinates",
        apiBaseUrl: worldNewsApiBaseUrl,
        city: optionalString(record.city),
      },
    };
  },
};

async function requestWorldNewsApiJson(
  path: string,
  query: Record<string, WorldNewsApiQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildWorldNewsApiUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `World News API request failed: ${error.message}` : "World News API request failed",
    );
  }

  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw createWorldNewsApiError(response.status, payload, phase);
  }
  return payload;
}

function buildWorldNewsApiUrl(path: string, query: Record<string, WorldNewsApiQueryValue>): string {
  const url = new URL(path, `${worldNewsApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "World News API returned invalid JSON");
  }
}

function createWorldNewsApiError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readErrorMessage(payload, status);
  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status, message, payload);
}

function readErrorMessage(payload: unknown, status: number): string {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : undefined;
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.status) ??
    `world_news_api request failed with ${status}`
  );
}

function readRequiredIds(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "ids must contain at least one item");
  }
  return value
    .map((item) => {
      if (typeof item !== "number" || !Number.isInteger(item)) {
        throw new ProviderRequestError(400, "ids must contain integers");
      }
      return String(item);
    })
    .join(",");
}

function validateSearchNewsInput(input: Record<string, unknown>): void {
  if (
    optionalString(input.text) ||
    optionalString(input.language) ||
    optionalString(input.sourceCountries) ||
    optionalString(input.categories) ||
    optionalString(input.earliestPublishDate) ||
    optionalString(input.latestPublishDate) ||
    optionalString(input.newsSources) ||
    optionalString(input.authors) ||
    optionalString(input.locationFilter) ||
    optionalString(input.entities) ||
    input.minSentiment !== undefined ||
    input.maxSentiment !== undefined
  ) {
    return;
  }
  throw new ProviderRequestError(
    400,
    "At least one of text, language, sourceCountries, categories, earliestPublishDate, latestPublishDate, newsSources, authors, locationFilter, entities, minSentiment, or maxSentiment must be provided",
  );
}

function validateSearchNewsSourcesInput(input: Record<string, unknown>): void {
  if (optionalString(input.name) || optionalString(input.language) || optionalString(input.sourceCountry)) {
    return;
  }
  throw new ProviderRequestError(400, "At least one of name, language, or sourceCountry must be provided");
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
