import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { queryFlag, queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "listennotes";
const listennotesApiBaseUrl = "https://listen-api.listennotes.com/api/v2";
const listennotesValidationPath = "/languages";

type ListennotesActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const listennotesActionHandlers: ProviderActionHandlers<"listennotes", ListennotesActionHandler> = {
  async search(input, context) {
    const resultType = readSearchType(input.type);
    const payload = await requestListennotesJson({
      path: "/search",
      query: queryParams({
        q: requiredString(input.q, "q", providerInputError),
        type: resultType,
        offset: optionalInteger(input.offset),
        region: optionalString(input.region),
        language: optionalString(input.language),
        genre_ids: joinNumberArray(input.genreIds),
        page_size: optionalInteger(input.pageSize),
        safe_mode: queryFlag(optionalBoolean(input.safeMode)),
        sort_by_date: queryFlag(optionalBoolean(input.sortByDate)),
        only_in: joinStringArray(input.onlyIn),
        unique_podcasts: queryFlag(optionalBoolean(input.uniquePodcasts)),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes search response");
    return {
      resultType,
      took: optionalNumber(record.took),
      count: requireInteger(record.count, "count"),
      total: requireInteger(record.total, "total"),
      nextOffset: optionalInteger(record.next_offset) ?? null,
      results: resultType === "podcast" ? normalizePodcastList(record.results) : normalizeEpisodeList(record.results),
    };
  },
  async typeahead(input, context) {
    const payload = await requestListennotesJson({
      path: "/typeahead",
      query: queryParams({
        q: requiredString(input.q, "q", providerInputError),
        safe_mode: queryFlag(optionalBoolean(input.safeMode)),
        show_genres: queryFlag(optionalBoolean(input.showGenres)),
        show_podcasts: queryFlag(optionalBoolean(input.showPodcasts)),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes typeahead response");
    return {
      terms: readStringArray(record.terms),
      genres: normalizeGenreList(record.genres),
      podcasts: normalizeTypeaheadPodcastList(record.podcasts),
    };
  },
  async get_podcast(input, context) {
    const podcastId = requiredString(input.id, "id", providerInputError);
    const payload = await requestListennotesJson({
      path: `/podcasts/${encodeURIComponent(podcastId)}`,
      query: queryParams({
        sort: optionalString(input.sort),
        next_episode_pub_date: optionalInteger(input.nextEpisodePubDate),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes podcast response");
    return {
      podcast: normalizePodcast(record),
      episodes: normalizeEpisodeList(record.episodes, null),
      nextEpisodePubDate: optionalInteger(record.next_episode_pub_date) ?? null,
    };
  },
  async get_episode(input, context) {
    const episodeId = requiredString(input.id, "id", providerInputError);
    const payload = await requestListennotesJson({
      path: `/episodes/${encodeURIComponent(episodeId)}`,
      query: {},
      context,
      phase: "execute",
    });

    return {
      episode: normalizeEpisode(payload),
    };
  },
  async get_best_podcasts(input, context) {
    const payload = await requestListennotesJson({
      path: "/best_podcasts",
      query: queryParams({
        page: optionalInteger(input.page),
        sort: optionalString(input.sort),
        region: optionalString(input.region),
        genre_id: optionalInteger(input.genreId),
        language: optionalString(input.language),
        safe_mode: queryFlag(optionalBoolean(input.safeMode)),
        publisher_region: optionalString(input.publisherRegion),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes best podcasts response");
    return {
      id: optionalInteger(record.id) ?? null,
      name: optionalString(record.name) ?? null,
      parentId: optionalInteger(record.parent_id) ?? null,
      total: requireInteger(record.total, "total"),
      pageNumber: requireInteger(record.page_number, "page_number"),
      hasNext: requireBoolean(record.has_next, "has_next"),
      hasPrevious: requireBoolean(record.has_previous, "has_previous"),
      nextPageNumber: optionalInteger(record.next_page_number) ?? null,
      previousPageNumber: optionalInteger(record.previous_page_number) ?? null,
      podcasts: normalizePodcastList(record.podcasts),
    };
  },
  async get_genres(input, context) {
    const payload = await requestListennotesJson({
      path: "/genres",
      query: queryParams({
        top_level_only: queryFlag(optionalBoolean(input.topLevelOnly)),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes genres response");
    return {
      genres: normalizeGenreList(record.genres),
    };
  },
  async get_regions(_input, context) {
    const payload = await requestListennotesJson({
      path: "/regions",
      query: {},
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes regions response");
    return {
      regions: normalizeRegionList(record.regions),
    };
  },
  async get_languages(_input, context) {
    const payload = await requestListennotesJson({
      path: "/languages",
      query: {},
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes languages response");
    return {
      languages: readStringArray(record.languages),
    };
  },
  async get_related_podcasts(input, context) {
    const podcastId = requiredString(input.id, "id", providerInputError);
    const payload = await requestListennotesJson({
      path: `/podcasts/${encodeURIComponent(podcastId)}/recommendations`,
      query: queryParams({
        safe_mode: queryFlag(optionalBoolean(input.safeMode)),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Listen Notes recommendations response");
    return {
      recommendations: normalizePodcastList(record.recommendations),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, listennotesActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestListennotesJson({
      path: listennotesValidationPath,
      query: {},
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });

    const record = requireObject(payload, "Listen Notes validation response");
    const languages = readStringArray(record.languages);
    return {
      profile: {
        accountId: "listennotes-api-key",
        displayName: "Listen Notes API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: listennotesApiBaseUrl,
        validationEndpoint: listennotesValidationPath,
        languageCount: languages.length,
      },
    };
  },
};

async function requestListennotesJson(input: {
  path: string;
  query: Record<string, string>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildListennotesUrl(input.path, input.query), {
      method: "GET",
      headers: listennotesHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Listen Notes request failed: ${error.message}` : "Listen Notes request failed",
    );
  }

  const payload = await readListennotesPayload(response);
  if (!response.ok) {
    throw createListennotesError(response.status, payload, input.phase);
  }

  return payload;
}

function buildListennotesUrl(path: string, query: Record<string, string>): string {
  const url = new URL(path.replace(/^\/+/, ""), `${listennotesApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function listennotesHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-ListenAPI-Key": apiKey,
  };
}

async function readListennotesPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createListennotesError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readListennotesMessage(payload) ?? `Listen Notes request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readListennotesMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const errorRecord = optionalRecord(record?.error);
  return (
    optionalString(record?.message) ??
    optionalString(record?.detail) ??
    optionalString(record?.error) ??
    optionalString(errorRecord?.message) ??
    optionalString(errorRecord?.detail)
  );
}

function readSearchType(value: unknown): "episode" | "podcast" {
  return value === "podcast" ? "podcast" : "episode";
}

function normalizePodcastList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => ({
    kind: "podcast",
    ...normalizePodcast(item),
  }));
}

function normalizeTypeaheadPodcastList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeTypeaheadPodcast(item));
}

function normalizeTypeaheadPodcast(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Listen Notes typeahead podcast");
  return compactObject({
    id: requireResponseString(record.id, "id"),
    title: requireResponseString(record.title_original, "title_original"),
    publisher: optionalString(record.publisher_original),
    image: optionalString(record.image),
    thumbnail: optionalString(record.thumbnail),
    explicitContent: optionalBoolean(record.explicit_content),
    raw: record,
  });
}

function normalizePodcast(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Listen Notes podcast");
  return compactObject({
    id: requireResponseString(record.id, "id"),
    title: requireResponseString(record.title ?? record.title_original, "title"),
    publisher: optionalString(record.publisher) ?? optionalString(record.publisher_original),
    description: optionalString(record.description) ?? optionalString(record.description_original),
    image: optionalString(record.image),
    thumbnail: optionalString(record.thumbnail),
    listennotesUrl: optionalString(record.listennotes_url),
    language: optionalString(record.language),
    country: optionalString(record.country),
    genreIds: readIntegerArray(record.genre_ids),
    totalEpisodes: optionalInteger(record.total_episodes),
    latestPubDateMs: optionalInteger(record.latest_pub_date_ms),
    explicitContent: optionalBoolean(record.explicit_content),
    rss: optionalString(record.rss),
    type: readPodcastType(record.type),
    website: optionalString(record.website),
    raw: record,
  });
}

function normalizeEpisodeList(
  value: unknown,
  podcastOverride: Record<string, unknown> | null | undefined = undefined,
): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeEpisode(item, podcastOverride));
}

function normalizeEpisode(
  value: unknown,
  podcastOverride: Record<string, unknown> | null | undefined = undefined,
): Record<string, unknown> {
  const record = requireObject(value, "Listen Notes episode");
  return compactObject({
    id: requireResponseString(record.id, "id"),
    title: requireResponseString(record.title ?? record.title_original, "title"),
    description: optionalString(record.description) ?? optionalString(record.description_original),
    audio: optionalString(record.audio),
    image: optionalString(record.image),
    thumbnail: optionalString(record.thumbnail),
    listennotesUrl: optionalString(record.listennotes_url),
    explicitContent: optionalBoolean(record.explicit_content),
    audioLengthSec: optionalInteger(record.audio_length_sec),
    pubDateMs: optionalInteger(record.pub_date_ms),
    podcast: podcastOverride ?? normalizePodcastReference(record.podcast),
    raw: record,
  });
}

function normalizePodcastReference(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return compactObject({
    id: requireResponseString(record.id, "podcast.id"),
    title: optionalString(record.title) ?? optionalString(record.title_original),
    publisher: optionalString(record.publisher) ?? optionalString(record.publisher_original),
    image: optionalString(record.image),
    thumbnail: optionalString(record.thumbnail),
    listennotesUrl: optionalString(record.listennotes_url),
  });
}

function normalizeGenreList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = requireObject(item, "Listen Notes genre");
    return {
      id: requireInteger(record.id, "genre.id"),
      name: requireResponseString(record.name, "genre.name"),
      parentId: optionalInteger(record.parent_id) ?? null,
    };
  });
}

function normalizeRegionList(value: unknown): Array<Record<string, string>> {
  const record = optionalRecord(value);
  if (!record) {
    return [];
  }
  return Object.entries(record).flatMap(([code, name]) => (typeof name === "string" ? [{ code, name }] : []));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function readIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const parsed = Number(item);
    return Number.isInteger(parsed) ? [parsed] : [];
  });
}

function readPodcastType(value: unknown): "episodic" | "serial" | undefined {
  return value === "serial" ? "serial" : value === "episodic" ? "episodic" : undefined;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, `${label} is invalid`);
}

function requireResponseString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Listen Notes ${fieldName} response is invalid`),
  );
}

function requireInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed !== undefined) {
    return parsed;
  }
  throw new ProviderRequestError(502, `Listen Notes ${fieldName} response is invalid`);
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed !== undefined) {
    return parsed;
  }
  throw new ProviderRequestError(502, `Listen Notes ${fieldName} response is invalid`);
}

function joinStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const strings = value.flatMap((item) => (typeof item === "string" ? [item] : []));
  return strings.length > 0 ? strings.join(",") : undefined;
}

function joinNumberArray(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const numbers = value.flatMap((item) => {
    const parsed = Number(item);
    return Number.isInteger(parsed) ? [parsed] : [];
  });
  return numbers.length > 0 ? numbers.join(",") : undefined;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://listen-api.listennotes.com/api/v2",
  auth: { type: "api_key_header", name: "x-listenapi-key" },
});
