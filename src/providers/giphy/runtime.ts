import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  stringArray,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const giphyApiBaseUrl = "https://api.giphy.com/v1";
const giphyValidationPath = "/gifs/trending";

type QueryValue = string | number | boolean | undefined;
type GiphyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const giphyActionHandlers: ProviderActionHandlers<"giphy", GiphyActionHandler> = {
  search_gifs(input, context) {
    return giphyList(
      "/gifs/search",
      compactObject({
        q: optionalString(input.query),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        lang: optionalString(input.lang),
        bundle: optionalString(input.bundle),
        remove_low_contrast: optionalBoolean(input.removeLowContrast),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  list_trending_gifs(input, context) {
    return giphyList(
      "/gifs/trending",
      compactObject({
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        bundle: optionalString(input.bundle),
        remove_low_contrast: optionalBoolean(input.removeLowContrast),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  search_stickers(input, context) {
    return giphyListByKey(
      "stickers",
      "/stickers/search",
      compactObject({
        q: optionalString(input.query),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        lang: optionalString(input.lang),
        bundle: optionalString(input.bundle),
        remove_low_contrast: optionalBoolean(input.removeLowContrast),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  list_trending_stickers(input, context) {
    return giphyListByKey(
      "stickers",
      "/stickers/trending",
      compactObject({
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        bundle: optionalString(input.bundle),
        remove_low_contrast: optionalBoolean(input.removeLowContrast),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  translate_gif(input, context) {
    return giphyGetSingle(
      "/gifs/translate",
      compactObject({
        s: optionalString(input.query),
        weirdness: optionalInteger(input.weirdness),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  translate_sticker(input, context) {
    return giphyGetSingle(
      "/stickers/translate",
      compactObject({
        s: optionalString(input.query),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  get_random_gif(input, context) {
    return giphyGetSingle(
      "/gifs/random",
      compactObject({
        tag: optionalString(input.tag),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  get_random_sticker(input, context) {
    return giphyGetSingle(
      "/stickers/random",
      compactObject({
        tag: optionalString(input.tag),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  get_gif(input, context) {
    return giphyGetGif(`/gifs/${encodeURIComponent(String(input.gifId))}`, toGiphyContextQuery(input), context);
  },
  list_gifs_by_ids(input, context) {
    return giphyListByIds(
      compactObject({
        ids: stringArray(input.gifIds, "gifIds").join(","),
        ...toGiphyContextQuery(input),
      }),
      context,
    );
  },
  search_tags(input, context) {
    return giphyListTerms(
      "/gifs/search/tags",
      compactObject({
        q: optionalString(input.query),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      }),
      context,
    );
  },
  list_trending_tags(_input, context) {
    return giphyListStrings("/trending/searches", {}, context);
  },
  list_related_tags(input, context) {
    return giphyListTerms(`/tags/related/${encodeURIComponent(String(input.term))}`, {}, context);
  },
  list_categories(_input, context) {
    return giphyListByKey("categories", "/gifs/categories", {}, context);
  },
  get_random_id(_input, context) {
    return giphyGetRandomId(context);
  },
};

export async function validateGiphyCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await fetcher(
    buildGiphyUrl(giphyValidationPath, {
      api_key: input.apiKey,
      limit: 1,
    }),
    {
      method: "GET",
      headers: giphyHeaders(),
      signal,
    },
  );

  if (!response.ok) {
    throw await normalizeGiphyError(response, "validate");
  }

  const payload = await readGiphyJson<{
    data?: Array<{ id?: unknown }>;
  }>(response);
  const sampleGifId = payload.data?.find((item) => typeof item?.id === "string")?.id;

  return {
    profile: {
      accountId: "giphy",
      displayName: "GIPHY API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v1/gifs/trending",
      sampleGifId: typeof sampleGifId === "string" ? sampleGifId : undefined,
    }),
  };
}

async function giphyList(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await giphyGet(path, query, context);
  const gifs = Array.isArray(payload.data) ? payload.data : [];
  return {
    gifs,
    pagination: toPagination(payload.pagination, gifs.length),
  };
}

async function giphyListByKey(
  key: string,
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await giphyGet(path, query, context);
  const values = Array.isArray(payload.data) ? payload.data : [];
  return {
    [key]: values,
    pagination: toPagination(payload.pagination, values.length),
  };
}

async function giphyGetSingle(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await giphyGet(path, query, context);
  if (!optionalRecord(payload.data)) {
    throw new ProviderRequestError(502, "giphy returned an invalid single-item payload");
  }
  return payload.data;
}

async function giphyGetGif(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  try {
    return await giphyGetSingle(path, query, context);
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 400) {
      throw new ProviderRequestError(
        400,
        "GIPHY get_gif expects a GIF id from GIF Object.id, not the random_id returned by /v1/randomid",
      );
    }
    throw error;
  }
}

async function giphyListByIds(query: Record<string, QueryValue>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await giphyGet("/gifs", query, context);
  return {
    gifs: Array.isArray(payload.data) ? payload.data : [],
  };
}

async function giphyListTerms(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await giphyGet(path, query, context);
  return {
    tags: Array.isArray(payload.data) ? payload.data : [],
  };
}

async function giphyListStrings(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await giphyGet(path, query, context);
  return {
    tags: Array.isArray(payload.data) ? payload.data.filter((value): value is string => typeof value === "string") : [],
  };
}

async function giphyGetRandomId(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await giphyGet("/randomid", {}, context);
  const randomId = optionalRecord(payload.data)?.random_id;
  if (typeof randomId !== "string" || randomId.length === 0) {
    throw new ProviderRequestError(502, "giphy returned an invalid random_id payload");
  }

  return { randomId };
}

async function giphyGet(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiKeyProviderContext,
): Promise<{ data?: unknown; pagination?: unknown }> {
  const response = await context.fetcher(
    buildGiphyUrl(path, {
      api_key: context.apiKey,
      ...query,
    }),
    {
      method: "GET",
      headers: giphyHeaders(),
      signal: context.signal,
    },
  );

  if (!response.ok) {
    throw await normalizeGiphyError(response, "execute");
  }

  return readGiphyJson(response);
}

function buildGiphyUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(`${giphyApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function giphyHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

function toGiphyContextQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    random_id: optionalString(input.randomId),
    rating: optionalString(input.rating),
    country_code: optionalString(input.countryCode),
    region: optionalString(input.region),
  });
}

function toPagination(value: unknown, count: number): Record<string, number> {
  const record = optionalRecord(value);
  if (!record) {
    return {
      count,
      offset: 0,
    };
  }

  return compactObject({
    total_count: optionalInteger(record.total_count),
    count: optionalInteger(record.count) ?? count,
    offset: optionalInteger(record.offset) ?? 0,
  }) as Record<string, number>;
}

async function normalizeGiphyError(response: Response, mode: "validate" | "execute"): Promise<ProviderRequestError> {
  const error = await readGiphyError(response);

  if (response.status === 429) {
    return new ProviderRequestError(429, error.message, error.responseId);
  }
  if (mode === "validate" && [400, 401, 403].includes(response.status)) {
    return new ProviderRequestError(400, error.message, error.responseId);
  }
  if (mode === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, error.message, error.responseId);
  }

  return new ProviderRequestError(response.status || 502, error.message, error.responseId);
}

async function readGiphyError(response: Response): Promise<{ message: string; responseId?: string }> {
  try {
    const payload = (await response.json()) as {
      message?: unknown;
      meta?: {
        msg?: unknown;
        response_id?: unknown;
      };
    };

    return {
      message:
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.meta?.msg === "string"
            ? payload.meta.msg
            : `giphy request failed with ${response.status}`,
      responseId: typeof payload.meta?.response_id === "string" ? payload.meta.response_id : undefined,
    };
  } catch {
    const message = (await response.text().catch(() => "")) || `giphy request failed with ${response.status}`;
    return {
      message,
    };
  }
}

async function readGiphyJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, `giphy returned invalid JSON with ${response.status}`);
  }
}
