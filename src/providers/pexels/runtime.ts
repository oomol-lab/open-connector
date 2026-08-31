import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const service = "pexels";
const pexelsApiBaseUrl = "https://api.pexels.com";

type PexelsQueryValue = string | number | undefined;
type PexelsPhase = "validate" | "execute";
type PexelsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pexelsActionHandlers: ProviderActionHandlers<"pexels", PexelsActionHandler> = {
  search_photos(input, context) {
    return getPhotoList("/v1/search", input, context, {
      query: requiredInputString(input.query, "query"),
      orientation: optionalString(input.orientation),
      size: optionalString(input.size),
      color: optionalString(input.color),
      locale: optionalString(input.locale),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    });
  },
  curated_photos(input, context) {
    return getPhotoList("/v1/curated", input, context, {
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    });
  },
  async get_photo(input, context) {
    const photoId = encodeURIComponent(String(requiredInputInteger(input.photoId, "photoId")));
    const payload = requiredResponseRecord(await requestPexelsJson(context, `/v1/photos/${photoId}`), "photo");
    return normalizePhoto(payload);
  },
  featured_collections(input, context) {
    return getCollectionList("/v1/collections/featured", input, context);
  },
  my_collections(input, context) {
    return getCollectionList("/v1/collections", input, context);
  },
  async collection_media(input, context) {
    const collectionId = encodeURIComponent(requiredInputString(input.collectionId, "collectionId"));
    const payload = requiredResponseRecord(
      await requestPexelsJson(context, `/v1/collections/${collectionId}`, {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        type: optionalString(input.type),
        sort: optionalString(input.sort),
      }),
      "collection media response",
    );
    return {
      id: requiredStringLike(payload.id, "id"),
      page: requiredInteger(payload.page, "page"),
      perPage: requiredInteger(payload.per_page, "per_page"),
      totalResults: requiredInteger(payload.total_results, "total_results"),
      media: responseArray(payload.media, "media").map((item, index) =>
        normalizeCollectionMediaItem(requiredResponseRecord(item, `media[${index}]`)),
      ),
      nextPage: optionalString(payload.next_page),
      prevPage: optionalString(payload.prev_page),
    };
  },
  search_videos(input, context) {
    return getVideoList("/v1/videos/search", input, context, {
      query: requiredInputString(input.query, "query"),
      orientation: optionalString(input.orientation),
      size: optionalString(input.size),
      locale: optionalString(input.locale),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    });
  },
  popular_videos(input, context) {
    return getVideoList("/v1/videos/popular", input, context, {
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
      min_width: optionalInteger(input.minWidth),
      min_height: optionalInteger(input.minHeight),
      min_duration: optionalInteger(input.minDuration),
      max_duration: optionalInteger(input.maxDuration),
    });
  },
  async get_video(input, context) {
    const videoId = encodeURIComponent(String(requiredInputInteger(input.videoId, "videoId")));
    try {
      const payload = requiredResponseRecord(await requestPexelsJson(context, `/v1/videos/videos/${videoId}`), "video");
      return normalizeVideo(payload);
    } catch (error) {
      if (!(error instanceof ProviderRequestError) || error.status !== 404) {
        throw error;
      }
    }
    const payload = requiredResponseRecord(await requestPexelsJson(context, `/v1/videos/${videoId}`), "video");
    return normalizeVideo(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, pexelsActionHandlers);

export async function validatePexelsCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  await requestPexelsJson({ apiKey, fetcher }, "/v1/curated", { page: 1, per_page: 1 }, "validate");
  return {
    profile: {
      accountId: "pexels-api-key",
      displayName: "Pexels API Key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: pexelsApiBaseUrl,
      authHeaderName: "Authorization",
      validationEndpoint: "/v1/curated",
    },
  };
}

async function getPhotoList(
  path: string,
  _input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  query: Record<string, PexelsQueryValue>,
) {
  return normalizePhotoList(requiredResponseRecord(await requestPexelsJson(context, path, query), "photo list"));
}

async function getCollectionList(path: string, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return normalizeCollectionList(
    requiredResponseRecord(
      await requestPexelsJson(context, path, {
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      }),
      "collection list",
    ),
  );
}

async function getVideoList(
  path: string,
  _input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  query: Record<string, PexelsQueryValue>,
) {
  return normalizeVideoList(requiredResponseRecord(await requestPexelsJson(context, path, query), "video list"));
}

async function requestPexelsJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  query: Record<string, PexelsQueryValue> = {},
  phase: PexelsPhase = "execute",
): Promise<unknown> {
  const url = new URL(path, pexelsApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: { Authorization: context.apiKey },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pexels request failed: ${error.message}` : "Pexels request failed",
    );
  }

  const payload = await readPexelsPayload(response);
  if (!response.ok) {
    throw createPexelsError(response, payload, phase);
  }
  return payload;
}

async function readPexelsPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPexelsError(response: Response, payload: unknown, phase: PexelsPhase): ProviderRequestError {
  const message = extractPexelsErrorMessage(payload) ?? response.statusText ?? "Pexels request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(409, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractPexelsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.error) ??
        optionalString(record.message) ??
        optionalString(record.details) ??
        optionalString(record.detail))
    : undefined;
}

function normalizePhotoList(payload: Record<string, unknown>) {
  return {
    page: requiredInteger(payload.page, "page"),
    perPage: requiredInteger(payload.per_page, "per_page"),
    totalResults: requiredInteger(payload.total_results, "total_results"),
    photos: responseArray(payload.photos, "photos").map((item, index) =>
      normalizePhoto(requiredResponseRecord(item, `photos[${index}]`)),
    ),
    nextPage: optionalString(payload.next_page),
    prevPage: optionalString(payload.prev_page),
  };
}

function normalizeCollectionList(payload: Record<string, unknown>) {
  return {
    page: requiredInteger(payload.page, "page"),
    perPage: requiredInteger(payload.per_page, "per_page"),
    totalResults: requiredInteger(payload.total_results, "total_results"),
    collections: responseArray(payload.collections, "collections").map((item, index) =>
      normalizeCollection(requiredResponseRecord(item, `collections[${index}]`)),
    ),
    nextPage: optionalString(payload.next_page),
    prevPage: optionalString(payload.prev_page),
  };
}

function normalizeVideoList(payload: Record<string, unknown>) {
  return {
    url: requiredString(payload.url, "url", pexelsResponseError),
    page: requiredInteger(payload.page, "page"),
    perPage: requiredInteger(payload.per_page, "per_page"),
    totalResults: requiredInteger(payload.total_results, "total_results"),
    videos: responseArray(payload.videos, "videos").map((item, index) =>
      normalizeVideo(requiredResponseRecord(item, `videos[${index}]`)),
    ),
    nextPage: optionalString(payload.next_page),
    prevPage: optionalString(payload.prev_page),
  };
}

function normalizeCollectionMediaItem(payload: Record<string, unknown>) {
  const type = normalizeCollectionMediaType(payload);
  return type === "Photo" ? { type, ...normalizePhoto(payload) } : { type, ...normalizeVideo(payload) };
}

function normalizeCollectionMediaType(payload: Record<string, unknown>): "Photo" | "Video" {
  const rawType = optionalString(payload.type)?.toLowerCase();
  if (rawType === "photo") {
    return "Photo";
  }
  if (rawType === "video") {
    return "Video";
  }
  if (payload.src) {
    return "Photo";
  }
  if (payload.video_files) {
    return "Video";
  }
  throw new ProviderRequestError(502, "Pexels collection media item missing media type");
}

function normalizePhoto(payload: Record<string, unknown>) {
  return {
    id: requiredInteger(payload.id, "id"),
    width: requiredInteger(payload.width, "width"),
    height: requiredInteger(payload.height, "height"),
    url: requiredString(payload.url, "url", pexelsResponseError),
    photographer: requiredString(payload.photographer, "photographer", pexelsResponseError),
    photographerUrl: requiredString(payload.photographer_url, "photographer_url", pexelsResponseError),
    photographerId: requiredInteger(payload.photographer_id, "photographer_id"),
    avgColor: optionalString(payload.avg_color),
    src: normalizePhotoSrc(requiredResponseRecord(payload.src, "src")),
    liked: optionalBoolean(payload.liked),
    alt: optionalString(payload.alt),
  };
}

function normalizePhotoSrc(payload: Record<string, unknown>) {
  return {
    original: requiredString(payload.original, "src.original", pexelsResponseError),
    large2x: requiredString(payload.large2x, "src.large2x", pexelsResponseError),
    large: requiredString(payload.large, "src.large", pexelsResponseError),
    medium: requiredString(payload.medium, "src.medium", pexelsResponseError),
    small: requiredString(payload.small, "src.small", pexelsResponseError),
    portrait: requiredString(payload.portrait, "src.portrait", pexelsResponseError),
    landscape: requiredString(payload.landscape, "src.landscape", pexelsResponseError),
    tiny: requiredString(payload.tiny, "src.tiny", pexelsResponseError),
  };
}

function normalizeCollection(payload: Record<string, unknown>) {
  return {
    id: requiredStringLike(payload.id, "id"),
    title: requiredString(payload.title, "title", pexelsResponseError),
    description: payload.description === null ? null : optionalString(payload.description),
    private: requiredBoolean(payload.private, "private"),
    mediaCount: requiredInteger(payload.media_count, "media_count"),
    photosCount: requiredInteger(payload.photos_count, "photos_count"),
    videosCount: requiredInteger(payload.videos_count, "videos_count"),
  };
}

function normalizeVideo(payload: Record<string, unknown>) {
  return {
    id: requiredInteger(payload.id, "id"),
    width: requiredInteger(payload.width, "width"),
    height: requiredInteger(payload.height, "height"),
    duration: requiredInteger(payload.duration, "duration"),
    url: requiredString(payload.url, "url", pexelsResponseError),
    image: requiredString(payload.image, "image", pexelsResponseError),
    fullRes: payload.full_res === null ? null : optionalString(payload.full_res),
    avgColor: payload.avg_color === null ? null : optionalString(payload.avg_color),
    tags: readStringArray(payload.tags, "tags"),
    user: normalizeVideoUser(requiredResponseRecord(payload.user, "user")),
    videoFiles: responseArray(payload.video_files, "video_files").map((item, index) =>
      normalizeVideoFile(requiredResponseRecord(item, `video_files[${index}]`)),
    ),
    videoPictures: responseArray(payload.video_pictures, "video_pictures").map((item, index) =>
      normalizeVideoPicture(requiredResponseRecord(item, `video_pictures[${index}]`)),
    ),
  };
}

function normalizeVideoUser(payload: Record<string, unknown>) {
  return {
    id: requiredInteger(payload.id, "user.id"),
    name: requiredString(payload.name, "user.name", pexelsResponseError),
    url: requiredString(payload.url, "user.url", pexelsResponseError),
  };
}

function normalizeVideoFile(payload: Record<string, unknown>) {
  return {
    id: requiredInteger(payload.id, "video_file.id"),
    quality: requiredString(payload.quality, "video_file.quality", pexelsResponseError),
    fileType: requiredString(payload.file_type, "video_file.file_type", pexelsResponseError),
    width: payload.width === null ? null : optionalNumber(payload.width),
    height: payload.height === null ? null : optionalNumber(payload.height),
    fps: payload.fps === null ? null : optionalNumber(payload.fps),
    link: requiredString(payload.link, "video_file.link", pexelsResponseError),
  };
}

function normalizeVideoPicture(payload: Record<string, unknown>) {
  return {
    id: requiredInteger(payload.id, "video_picture.id"),
    nr: requiredInteger(payload.nr, "video_picture.nr"),
    picture: requiredString(payload.picture, "video_picture.picture", pexelsResponseError),
  };
}

function requiredResponseRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, `Pexels response ${message}`));
}

function responseArray(value: unknown, fieldName: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `Pexels response missing array field: ${fieldName}`);
}

function requiredInputInteger(value: unknown, fieldName: string): number {
  if (Number.isInteger(value)) {
    return value as number;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an integer`);
}

function requiredInteger(value: unknown, fieldName: string): number {
  if (Number.isInteger(value)) {
    return value as number;
  }
  throw new ProviderRequestError(502, `Pexels response missing integer field: ${fieldName}`);
}

function requiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(502, `Pexels response missing boolean field: ${fieldName}`);
}

function requiredStringLike(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value !== "") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new ProviderRequestError(502, `Pexels response missing id field: ${fieldName}`);
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, `Pexels response contains non-string tag at ${fieldName}[${index}]`);
    }
    return item;
  });
}

function pexelsResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Pexels response ${message}`);
}
