import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { UnsplashActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const unsplashApiBaseUrl: string = "https://api.unsplash.com";
const unsplashValidationPath = "/photos";
const unsplashTimeoutMs = 30_000;

type UnsplashActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const unsplashActionHandlers: Record<UnsplashActionName, UnsplashActionHandler> = {
  async list_photos(input, context) {
    const payload = await requestUnsplashJson({
      context,
      path: "/photos",
      query: {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        order_by: optionalString(input.orderBy),
      },
      phase: "execute",
    });

    return {
      photos: normalizeObjectArray(payload),
    };
  },
  async search_photos(input, context) {
    const payload = await requestUnsplashJson({
      context,
      path: "/search/photos",
      query: compactObject({
        query: requireInputString(input.query, "query"),
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        order_by: optionalString(input.orderBy),
        color: optionalString(input.color),
        orientation: optionalString(input.orientation),
        content_filter: optionalString(input.contentFilter),
        collections: optionalStringArrayCsv(input.collections),
      }),
      phase: "execute",
    });

    const record = requireRecord(payload, "Unsplash search response");
    return {
      total: optionalNumber(record.total) ?? 0,
      totalPages: optionalNumber(record.total_pages) ?? 0,
      results: normalizeObjectArray(record.results),
    };
  },
  async get_photo(input, context) {
    const id = requireInputString(input.id, "id");
    const payload = await requestUnsplashJson({
      context,
      path: `/photos/${encodeURIComponent(id)}`,
      phase: "execute",
    });

    return {
      photo: requireRecord(payload, "Unsplash photo response"),
    };
  },
  async get_random_photo(input, context) {
    const query = optionalString(input.query);
    const collections = optionalStringArrayCsv(input.collections);
    const topics = optionalStringArrayCsv(input.topics);

    if (query && (collections || topics)) {
      throw new ProviderRequestError(400, "query cannot be combined with collections or topics for get_random_photo");
    }

    const payload = await requestUnsplashJson({
      context,
      path: "/photos/random",
      query: compactObject({
        query,
        collections,
        topics,
        username: optionalString(input.username),
        orientation: optionalString(input.orientation),
        content_filter: optionalString(input.contentFilter),
        count: optionalInteger(input.count),
      }),
      phase: "execute",
    });

    return {
      photos: Array.isArray(payload)
        ? normalizeObjectArray(payload)
        : [requireRecord(payload, "Unsplash random photo response")],
    };
  },
  async list_topics(input, context) {
    const payload = await requestUnsplashJson({
      context,
      path: "/topics",
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        order_by: optionalString(input.orderBy),
      }),
      phase: "execute",
    });

    return {
      topics: normalizeObjectArray(payload),
    };
  },
  async get_topic_photos(input, context) {
    const topicIdOrSlug = requireInputString(input.topicIdOrSlug, "topicIdOrSlug");
    const payload = await requestUnsplashJson({
      context,
      path: `/topics/${encodeURIComponent(topicIdOrSlug)}/photos`,
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        orientation: optionalString(input.orientation),
        order_by: optionalString(input.orderBy),
      }),
      phase: "execute",
    });

    return {
      photos: normalizeObjectArray(payload),
    };
  },
};

export async function validateUnsplashCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestUnsplashJson({
    context: { apiKey, fetcher, signal },
    path: unsplashValidationPath,
    query: {
      page: 1,
      per_page: 1,
    },
    phase: "validate",
  });

  const photos = normalizeObjectArray(payload);
  const samplePhoto = photos[0];
  const sampleLinks = optionalRecord(samplePhoto?.links);

  return {
    profile: {
      accountId: "unsplash",
      displayName: "Unsplash Access Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: unsplashValidationPath,
      samplePhotoId: optionalString(samplePhoto?.id),
      samplePhotoSlug: optionalString(samplePhoto?.slug),
      samplePhotoLink: optionalString(sampleLinks?.html) ?? optionalString(sampleLinks?.self),
    }),
  };
}

async function requestUnsplashJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, string | number | undefined>;
  phase: "validate" | "execute";
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, unsplashTimeoutMs);
  try {
    const response = await input.context.fetcher(buildUnsplashUrl(input.path, input.query), {
      method: "GET",
      headers: {
        authorization: `Client-ID ${input.context.apiKey}`,
        "accept-version": "v1",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readUnsplashPayload(response);
    if (!response.ok) {
      throw createUnsplashError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Unsplash request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Unsplash request failed: ${error.message}` : "Unsplash request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildUnsplashUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, `${unsplashApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readUnsplashPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { errors: [text] };
  }
}

function createUnsplashError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message =
    extractUnsplashErrorMessage(payload) ??
    (phase === "validate" ? "Unsplash credential validation failed." : "Unsplash request failed.");

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractUnsplashErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      const parsed = optionalString(item);
      if (parsed) {
        return parsed;
      }
    }
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function requireInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function optionalStringArrayCsv(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return items.length === 0 ? undefined : items.join(",");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return record;
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Unsplash response must be an array", value);
  }

  return value.map((item) => requireRecord(item, "Unsplash array item"));
}
