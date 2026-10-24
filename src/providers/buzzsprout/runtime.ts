import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  requiredBoolean,
  requiredNumber,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import { providerResponseError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const buzzsproutApiBaseUrl = "https://www.buzzsprout.com/api";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const buzzsproutActionHandlers: ProviderActionHandlers<"buzzsprout", Handler> = {
  async list_podcasts(_input, context) {
    return { podcasts: objects(await request("/podcasts", context), "Buzzsprout podcasts").map(normalizePodcast) };
  },
  async get_podcast(input, context) {
    return { podcast: normalizePodcast(await request(`/podcasts/${id(input.podcastId, "podcastId")}`, context)) };
  },
  async update_podcast(input, context) {
    return {
      podcast: normalizePodcast(
        await request(`/podcasts/${id(input.podcastId, "podcastId")}`, context, "PATCH", podcastBody(input)),
      ),
    };
  },
  async list_episodes(input, context) {
    return {
      episodes: objects(
        await request(`/${id(input.podcastId, "podcastId")}/episodes`, context),
        "Buzzsprout episodes",
      ).map(normalizeEpisode),
    };
  },
  async get_episode(input, context) {
    return {
      episode: normalizeEpisode(
        await request(`/${id(input.podcastId, "podcastId")}/episodes/${id(input.episodeId, "episodeId")}`, context),
      ),
    };
  },
  async create_episode(input, context) {
    return {
      episode: normalizeEpisode(
        await request(`/${id(input.podcastId, "podcastId")}/episodes`, context, "POST", episodeBody(input)),
      ),
    };
  },
  async update_episode(input, context) {
    return {
      episode: normalizeEpisode(
        await request(
          `/${id(input.podcastId, "podcastId")}/episodes/${id(input.episodeId, "episodeId")}`,
          context,
          "PATCH",
          episodeBody(input),
        ),
      ),
    };
  },
  async list_podcast_downloads(input, context) {
    const payload = objects(
      await request(`/${id(input.podcastId, "podcastId")}/downloads`, context, "GET", undefined, {
        date: optionalString(input.date),
      }),
      "Buzzsprout podcast downloads",
    );
    return {
      downloads: payload.map((value) => {
        const record = requiredRecord(value, "Buzzsprout podcast download", providerResponseError);
        return {
          episodeId: positive(record.episode_id, "Buzzsprout download episode_id"),
          total: nonNegative(record.total, "Buzzsprout download total"),
        };
      }),
    };
  },
  async list_episode_downloads(input, context) {
    const payload = requiredRecord(
      await request(
        `/${id(input.podcastId, "podcastId")}/${id(input.episodeId, "episodeId")}/downloads`,
        context,
        "GET",
        undefined,
        { date: optionalString(input.date), page: stringInteger(input.page), per_page: stringInteger(input.perPage) },
      ),
      "Buzzsprout episode downloads",
      providerResponseError,
    );
    const episode = objects(payload.episodes, "Buzzsprout episode downloads episodes")[0];
    if (!episode) throw providerResponseError("Buzzsprout episode downloads response is empty");
    const pagination = requiredRecord(payload.pagination, "Buzzsprout pagination", providerResponseError);
    return {
      episodeId: positive(episode.id, "Buzzsprout episode id"),
      downloads: objects(episode.downloads, "Buzzsprout downloads").map(normalizeDownload),
      page: positive(pagination.page, "Buzzsprout pagination page"),
      perPage: positive(pagination.per_page, "Buzzsprout pagination per_page"),
      hasMore: requiredBoolean(pagination.has_more, "Buzzsprout pagination has_more", providerResponseError),
      nextPage: pagination.next_page == null ? null : positive(pagination.next_page, "Buzzsprout pagination next_page"),
    };
  },
};

export async function validateBuzzsproutCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{ profile: { displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> }> {
  const context = { apiKey, fetcher, signal };
  const podcasts = objects(await request("/podcasts", context), "Buzzsprout podcasts");
  return {
    profile: { displayName: optionalString(optionalRecord(podcasts[0])?.title) ?? "Buzzsprout API Token" },
    grantedScopes: [],
    metadata: { apiBaseUrl: buzzsproutApiBaseUrl, validationEndpoint: "/podcasts", podcastCount: podcasts.length },
  };
}

function podcastBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    author: input.author,
    explicit: input.explicit,
    language: input.language,
    timezone: input.timezone,
    website_address: input.websiteAddress,
    contact_email: input.contactEmail,
    category: input.category,
    category2: input.category2,
    category3: input.category3,
    artwork_url: input.artworkUrl,
  });
}
function episodeBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: input.title,
    description: input.description,
    artist: input.artist,
    tags: input.tags,
    published_at: input.publishedAt,
    season_number: input.seasonNumber,
    episode_number: input.episodeNumber,
    episode_type: input.episodeType,
    explicit: input.explicit,
    private: input.private,
    custom_url: input.customUrl,
    artwork_url: input.artworkUrl,
  });
}
async function request(
  path: string,
  context: ApiKeyProviderContext,
  method = "GET",
  body?: Record<string, unknown>,
  query?: Record<string, string | undefined>,
): Promise<unknown> {
  const url = new URL(`${buzzsproutApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) url.searchParams.set(key, value);
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Token token=${context.apiKey}`,
      "content-type": "application/json; charset=utf-8",
      "user-agent": providerUserAgent,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  const text = await readProviderTextBody(response, "Buzzsprout response");
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw providerResponseError("Buzzsprout returned invalid JSON");
    payload = text;
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      errorMessage(payload) ?? `Buzzsprout request failed with status ${response.status}`,
      payload,
    );
  return payload;
}
function errorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record = optionalRecord(payload),
    nested = optionalRecord(record?.error);
  return optionalString(nested?.message) ?? optionalString(record?.message) ?? optionalString(record?.error);
}
function normalizePodcast(value: unknown): unknown {
  const r = requiredRecord(value, "Buzzsprout podcast", providerResponseError);
  return {
    id: positive(r.id, "podcast id"),
    title: requiredString(r.title, "podcast title", providerResponseError),
    author: rawStringOrNull(r.author),
    description: rawStringOrNull(r.description),
    websiteAddress: rawStringOrNull(r.website_address),
    websiteUrl: rawStringOrNull(r.website_url),
    contactEmail: rawStringOrNull(r.contact_email),
    keywords: rawStringOrNull(r.keywords),
    explicit: requiredBoolean(r.explicit, "podcast explicit", providerResponseError),
    mainCategory: rawStringOrNull(r.main_category),
    subCategory: rawStringOrNull(r.sub_category),
    mainCategory2: rawStringOrNull(r.main_category2),
    subCategory2: rawStringOrNull(r.sub_category2),
    mainCategory3: rawStringOrNull(r.main_category3),
    subCategory3: rawStringOrNull(r.sub_category3),
    language: rawStringOrNull(r.language),
    timezone: rawStringOrNull(r.timezone),
    artworkUrl: rawStringOrNull(r.artwork_url),
    backgroundUrl: rawStringOrNull(r.background_url),
    rssUrl: rawStringOrNull(r.rss_url),
    raw: r,
  };
}
function normalizeEpisode(value: unknown): unknown {
  const r = requiredRecord(value, "Buzzsprout episode", providerResponseError);
  return {
    id: positive(r.id, "episode id"),
    title: requiredString(r.title, "episode title", providerResponseError),
    audioUrl: rawStringOrNull(r.audio_url),
    artworkUrl: rawStringOrNull(r.artwork_url),
    description: rawStringOrNull(r.description),
    artist: rawStringOrNull(r.artist),
    tags: rawStringOrNull(r.tags),
    publishedAt: rawStringOrNull(r.published_at),
    duration: optionalIntegerAtLeast(r.duration, "episode duration", -1),
    guid: rawStringOrNull(r.guid),
    customUrl: rawStringOrNull(r.custom_url),
    episodeNumber: optionalIntegerAtLeast(r.episode_number, "episode number", 0),
    seasonNumber: optionalIntegerAtLeast(r.season_number, "season number", 0),
    episodeType: rawStringOrNull(r.episode_type),
    explicit: requiredBoolean(r.explicit, "episode explicit", providerResponseError),
    private: requiredBoolean(r.private, "episode private", providerResponseError),
    totalPlays: optionalIntegerAtLeast(r.total_plays, "episode total plays", 0),
    raw: r,
  };
}
function normalizeDownload(value: unknown): unknown {
  const r = requiredRecord(value, "Buzzsprout download", providerResponseError);
  return {
    app: requiredString(r.app, "download app", providerResponseError),
    device: requiredString(r.device, "download device", providerResponseError),
    deviceType: requiredString(r.device_type, "download device_type", providerResponseError),
    countryCode: rawStringOrNull(r.country_code),
    region: rawStringOrNull(r.region),
    city: rawStringOrNull(r.city),
    continent: rawStringOrNull(r.continent),
    mediaType: requiredString(r.media_type, "download media_type", providerResponseError),
  };
}
function objects(value: unknown, label: string): Array<Record<string, unknown>> {
  return objectArray(value, label, providerResponseError);
}
function id(value: unknown, label: string): number {
  return positive(value, label);
}
function positive(value: unknown, label: string): number {
  const number = requiredNumber(value, label, providerResponseError);
  if (!Number.isInteger(number) || number <= 0) throw providerResponseError(`${label} must be a positive integer`);
  return number;
}
function nonNegative(value: unknown, label: string): number {
  const number = requiredNumber(value, label, providerResponseError);
  if (!Number.isInteger(number) || number < 0) throw providerResponseError(`${label} must be a non-negative integer`);
  return number;
}
function stringInteger(value: unknown): string | undefined {
  const number = optionalInteger(value);
  return number === undefined ? undefined : String(number);
}
function optionalIntegerAtLeast(value: unknown, label: string, minimum: number): number | null {
  if (value == null) return null;
  const number = requiredNumber(value, label, providerResponseError);
  if (!Number.isInteger(number) || number < minimum) {
    throw providerResponseError(`${label} must be an integer of at least ${minimum}`);
  }
  return number;
}
