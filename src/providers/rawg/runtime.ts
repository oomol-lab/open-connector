import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRawString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type RawgActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
};

type RawgActionHandler = (input: Record<string, unknown>, context: RawgActionContext) => Promise<unknown>;

export const rawgApiBaseUrl = "https://api.rawg.io/api";

export function rawgRequestUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${rawgApiBaseUrl}/`);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

export async function validateRawgCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await rawgGet(
    "/platforms",
    {
      page_size: "1",
    },
    input.apiKey,
    fetcher,
    "validate",
  );

  const results = readResultsArray(payload);
  const firstPlatform = asOptionalObject(results[0]);

  return {
    profile: { accountId: "rawg", displayName: "RAWG API Key", grantedScopes: [] },
    metadata: compactObject({
      validationEndpoint: "/platforms",
      apiBaseUrl: rawgApiBaseUrl,
      firstPlatformId: asOptionalNumber(firstPlatform?.id),
      firstPlatformName: optionalRawString(firstPlatform?.name),
      pageSize: 1,
    }),
  };
}

export const rawgActionHandlers: ProviderActionHandlers<"rawg", RawgActionHandler> = {
  list_games(input, context) {
    return listResource("/games", buildListGamesQuery(input), "games", context);
  },
  get_game(input, context) {
    return getResource(`/games/${encodeURIComponent(String(readRequiredGameId(input.gameId)))}`, "game", context);
  },
  list_platforms(input, context) {
    return listResource("/platforms", buildPagedQuery(input, optionalRawString(input.ordering)), "platforms", context);
  },
  get_platform(input, context) {
    return getResource(
      `/platforms/${readRequiredPositiveInteger(input.platformId, "platformId")}`,
      "platform",
      context,
    );
  },
  list_genres(input, context) {
    return listResource("/genres", buildPagedQuery(input, optionalRawString(input.ordering)), "genres", context);
  },
  get_genre(input, context) {
    return getResource(`/genres/${readRequiredPositiveInteger(input.genreId, "genreId")}`, "genre", context);
  },
  list_stores(input, context) {
    return listResource("/stores", buildPagedQuery(input, optionalRawString(input.ordering)), "stores", context);
  },
  get_store(input, context) {
    return getResource(`/stores/${readRequiredPositiveInteger(input.storeId, "storeId")}`, "store", context);
  },
  list_developers(input, context) {
    return listResource("/developers", buildPagedQuery(input), "developers", context);
  },
  get_developer(input, context) {
    return getResource(
      `/developers/${readRequiredPositiveInteger(input.developerId, "developerId")}`,
      "developer",
      context,
    );
  },
  list_publishers(input, context) {
    return listResource("/publishers", buildPagedQuery(input), "publishers", context);
  },
  get_publisher(input, context) {
    return getResource(
      `/publishers/${readRequiredPositiveInteger(input.publisherId, "publisherId")}`,
      "publisher",
      context,
    );
  },
  list_tags(input, context) {
    return listResource("/tags", buildPagedQuery(input), "tags", context);
  },
  get_tag(input, context) {
    return getResource(`/tags/${readRequiredPositiveInteger(input.tagId, "tagId")}`, "tag", context);
  },
  list_parent_platforms(input, context) {
    return listResource("/platforms/lists/parents", buildPagedQuery(input), "parentPlatforms", context);
  },
  list_game_screenshots(input, context) {
    return listGameSubresource(input, "screenshots", "screenshots", context);
  },
  list_game_stores(input, context) {
    return listGameSubresource(input, "stores", "stores", context);
  },
  list_game_additions(input, context) {
    return listGameSubresource(input, "additions", "additions", context);
  },
  list_game_series(input, context) {
    return listGameSubresource(input, "game-series", "seriesGames", context);
  },
  list_game_movies(input, context) {
    return getGameSubresource(input, "movies", "movie", context);
  },
  list_game_reddit_posts(input, context) {
    return getGameSubresource(input, "reddit", "post", context);
  },
};

function buildListGamesQuery(input: Record<string, unknown>) {
  return compactObject({
    search: optionalRawString(input.search),
    page: stringifyOptionalNumber(input.page),
    page_size: stringifyOptionalNumber(input.pageSize),
    platforms: optionalRawString(input.platforms),
    genres: optionalRawString(input.genres),
    stores: optionalRawString(input.stores),
    developers: optionalRawString(input.developers),
    publishers: optionalRawString(input.publishers),
    tags: optionalRawString(input.tags),
    dates: optionalRawString(input.dates),
    ordering: optionalRawString(input.ordering),
    metacritic: optionalRawString(input.metacritic),
    parent_platforms: optionalRawString(input.parentPlatforms),
    search_exact: stringifyOptionalBoolean(input.searchExact),
    search_precise: stringifyOptionalBoolean(input.searchPrecise),
    exclude_additions: stringifyOptionalBoolean(input.excludeAdditions),
    exclude_parents: stringifyOptionalBoolean(input.excludeParents),
    exclude_game_series: stringifyOptionalBoolean(input.excludeGameSeries),
  });
}

function buildPagedQuery(input: Record<string, unknown>, ordering?: string) {
  return compactObject({
    page: stringifyOptionalNumber(input.page),
    page_size: stringifyOptionalNumber(input.pageSize),
    ordering,
  });
}

async function listResource(
  path: string,
  query: Record<string, string | undefined>,
  outputKey: string,
  context: RawgActionContext,
) {
  const payload = await rawgGet(path, query, context.apiKey, context.fetcher, "execute");
  const record = readRequiredObject(payload, "payload");
  return {
    count: readRequiredNumber(record.count, "count"),
    next: readNullableString(record.next, "next"),
    previous: readNullableString(record.previous, "previous"),
    [outputKey]: readResultsArray(record),
  };
}

async function getResource(path: string, outputKey: string, context: RawgActionContext) {
  const payload = await rawgGet(path, {}, context.apiKey, context.fetcher, "execute");
  const record = readRequiredObject(payload, "payload");
  return {
    [outputKey]: record,
  };
}

function listGameSubresource(
  input: Record<string, unknown>,
  resourcePath: string,
  outputKey: string,
  context: RawgActionContext,
) {
  const gameId = encodeURIComponent(String(readRequiredGameId(input.gameId)));
  return listResource(`/games/${gameId}/${resourcePath}`, buildPagedQuery(input), outputKey, context);
}

function getGameSubresource(
  input: Record<string, unknown>,
  resourcePath: string,
  outputKey: string,
  context: RawgActionContext,
) {
  const gameId = encodeURIComponent(String(readRequiredGameId(input.gameId)));
  return getResource(`/games/${gameId}/${resourcePath}`, outputKey, context);
}

async function rawgGet(
  path: string,
  query: Record<string, string | undefined>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
) {
  const url = rawgRequestUrl(path, apiKey, query);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `RAWG request failed: ${error.message}` : "RAWG request failed",
    );
  }

  const payload = await readRawgPayload(response, {
    allowInvalidPayload: !response.ok,
  });
  if (!response.ok) {
    throw buildRawgError(response.status, payload, phase);
  }

  return readRequiredObject(payload, "payload");
}

async function readRawgPayload(
  response: Response,
  options: {
    allowInvalidPayload?: boolean;
  } = {},
) {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (options.allowInvalidPayload) {
      return undefined;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `RAWG response body read failed: ${error.message}` : "RAWG response body read failed",
    );
  }
  if (!text) {
    if (options.allowInvalidPayload) {
      return undefined;
    }
    throw new ProviderRequestError(502, "RAWG returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (options.allowInvalidPayload) {
      return undefined;
    }
    throw new ProviderRequestError(502, "RAWG returned invalid JSON");
  }
}

function buildRawgError(status: number, payload: unknown, phase: "validate" | "execute") {
  const payloadObject = asOptionalObject(payload);
  const message = optionalRawString(payloadObject?.error) ?? defaultErrorMessage(status);

  if (status === 401 || status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(401, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(502, message);
}

function defaultErrorMessage(status: number) {
  if (status === 429) {
    return "RAWG request was rate limited";
  }
  return `RAWG request failed with status ${status}`;
}

function readRequiredObject(value: unknown, fieldName: string) {
  const object = asOptionalObject(value);
  if (!object) {
    throw new ProviderRequestError(502, `RAWG response missing ${fieldName}`);
  }
  return object;
}

function readResultsArray(value: Record<string, unknown>) {
  if (!Array.isArray(value.results)) {
    throw new ProviderRequestError(502, "RAWG response missing results");
  }
  return value.results.map((item, index) => {
    const record = asOptionalObject(item);
    if (!record) {
      throw new ProviderRequestError(502, `RAWG response.results[${index}] is not an object`);
    }
    return record;
  });
}

function readRequiredPositiveInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return Number(value);
}

function readRequiredGameId(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Number.isInteger(value) && Number(value) > 0) {
    return Number(value);
  }
  throw new ProviderRequestError(400, "gameId must be a non-empty string or positive integer");
}

function readRequiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `RAWG response missing ${fieldName}`);
  }
  return value;
}

function readNullableString(value: unknown, fieldName: string) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  throw new ProviderRequestError(502, `RAWG response.${fieldName} must be a string or null`);
}

function stringifyOptionalNumber(value: unknown) {
  if (value == null) {
    return undefined;
  }
  return String(value);
}

function stringifyOptionalBoolean(value: unknown) {
  if (typeof value !== "boolean") {
    return undefined;
  }
  return String(value);
}

function asOptionalObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value));
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
