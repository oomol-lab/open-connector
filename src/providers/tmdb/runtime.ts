import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  CastError,
  compactObject,
  integer,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { objectPayload, requestJson } from "../http-json-runtime.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const tmdbApiBaseUrl = "https://api.themoviedb.org";
const tmdbValidationPath = "/3/authentication";

type TmdbActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type TmdbRequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const trendingMediaTypes = ["all", "movie", "tv", "person"];
const trendingTimeWindows = ["day", "week"];

export const tmdbActionHandlers: ProviderActionHandlers<"tmdb", TmdbActionHandler> = {
  search_movie(input, context) {
    return tmdbGet(
      "/3/search/movie",
      context,
      compactObject({
        query: requiredString(input.query, "query"),
        language: optionalString(input.language),
        page: optionalInteger(input.page),
        include_adult: optionalBoolean(input.includeAdult),
        year: optionalInteger(input.year),
        primary_release_year: optionalInteger(input.primaryReleaseYear),
        region: optionalString(input.region),
      }),
    );
  },
  get_movie(input, context) {
    return tmdbGet(`/3/movie/${encodePathSegment(readTmdbId(input.movieId, "movieId"))}`, context, {
      language: optionalString(input.language),
    });
  },
  search_tv(input, context) {
    return tmdbGet(
      "/3/search/tv",
      context,
      compactObject({
        query: requiredString(input.query, "query"),
        language: optionalString(input.language),
        page: optionalInteger(input.page),
        include_adult: optionalBoolean(input.includeAdult),
        year: optionalInteger(input.year),
        first_air_date_year: optionalInteger(input.firstAirDateYear),
      }),
    );
  },
  get_tv(input, context) {
    return tmdbGet(`/3/tv/${encodePathSegment(readTmdbId(input.tvId, "tvId"))}`, context, {
      language: optionalString(input.language),
    });
  },
  get_person(input, context) {
    return tmdbGet(`/3/person/${encodePathSegment(readTmdbId(input.personId, "personId"))}`, context, {
      language: optionalString(input.language),
    });
  },
  list_trending(input, context) {
    const mediaType = readAllowedValue(input.mediaType, "mediaType", trendingMediaTypes, "all");
    const timeWindow = readAllowedValue(input.timeWindow, "timeWindow", trendingTimeWindows, "day");
    return tmdbGet(
      `/3/trending/${encodePathSegment(mediaType)}/${encodePathSegment(timeWindow)}`,
      context,
      compactObject({
        language: optionalString(input.language),
      }),
    );
  },
  get_configuration(_input, context) {
    return tmdbGet("/3/configuration", context);
  },
};

export async function validateTmdbCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await tmdbGet(tmdbValidationPath, { apiKey, fetcher, signal }, undefined, "validate");
  const record = objectPayload(payload, "TMDB authentication");
  if (record.success !== true) {
    throw new ProviderRequestError(
      400,
      optionalString(record.status_message) ?? "TMDB API Read Access Token is invalid",
      payload,
    );
  }

  return {
    profile: {
      accountId: "api_key",
      displayName: "TMDB API Read Access Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: tmdbApiBaseUrl,
      validationEndpoint: tmdbValidationPath,
    },
  };
}

async function tmdbGet(
  path: string,
  context: TmdbRequestContext,
  query?: Record<string, string | number | boolean | undefined>,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  try {
    return await requestJson({
      providerName: "TMDB",
      baseUrl: tmdbApiBaseUrl,
      path,
      fetcher: context.fetcher,
      signal: context.signal,
      query,
      phase,
      headers: {
        authorization: `Bearer ${context.apiKey}`,
      },
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      const statusMessage = optionalString(optionalRecord(error.details)?.status_message);
      if (statusMessage && statusMessage !== error.message) {
        throw new ProviderRequestError(error.status, statusMessage, error.details);
      }
    }
    throw error;
  }
}

function readTmdbId(value: unknown, fieldName: string): number {
  const id = integer(value, fieldName);
  if (id < 1) {
    throw new CastError(`${fieldName} must be a positive integer`);
  }
  return id;
}

function readAllowedValue(value: unknown, fieldName: string, allowed: readonly string[], fallback: string): string {
  const raw = optionalString(value) ?? fallback;
  if (allowed.includes(raw)) {
    return raw;
  }

  throw new CastError(`${fieldName} must be one of: ${allowed.join(", ")}`);
}
