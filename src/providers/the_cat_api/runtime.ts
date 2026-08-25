import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const theCatApiBaseUrl = "https://api.thecatapi.com/v1/";
const theCatApiValidationPath = "/breeds";
const theCatApiDefaultTimeoutMs = 30_000;

type TheCatApiRequestPhase = "validate" | "execute";
type TheCatApiContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

export const theCatApiActionHandlers: ProviderActionHandlers<
  "the_cat_api",
  (input: Record<string, unknown>, context: TheCatApiContext) => Promise<unknown>
> = {
  search_images(input, context) {
    return executeSearchImages(input, context);
  },
  get_image(input, context) {
    return executeGetImage(input, context);
  },
  list_breeds(input, context) {
    return executeListBreeds(input, context);
  },
  search_breeds(input, context) {
    return executeSearchBreeds(input, context);
  },
  get_breed(input, context) {
    return executeGetBreed(input, context);
  },
};

export async function validateTheCatApiCredential(context: TheCatApiContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestTheCatApiJson({
    path: theCatApiValidationPath,
    apiKey: context.apiKey,
    query: { limit: "1" },
    context,
    phase: "validate",
  });
  const breeds = parseArrayPayload(payload, "The Cat API validation response must be an array");
  const sampleBreed = normalizeBreed(breeds[0]);

  return {
    profile: {
      accountId: "api_key",
      displayName: "The Cat API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: "https://api.thecatapi.com/v1",
      validationEndpoint: theCatApiValidationPath,
      sampleBreedId: sampleBreed?.id,
      sampleBreedName: sampleBreed?.name,
    }),
  };
}

async function executeSearchImages(input: Record<string, unknown>, context: TheCatApiContext) {
  const payload = await requestTheCatApiJson({
    path: "/images/search",
    apiKey: context.apiKey,
    query: buildSearchImagesQuery(input),
    context,
    phase: "execute",
  });
  const images = parseArrayPayload(payload, "The Cat API image search response must be an array");
  return { images: images.map(normalizeImage).filter((image) => image !== null) };
}

async function executeGetImage(input: Record<string, unknown>, context: TheCatApiContext) {
  const payload = await requestTheCatApiJson({
    path: `/images/${encodeURIComponent(readRequiredString(input.imageId, "imageId"))}`,
    apiKey: context.apiKey,
    query: {},
    context,
    phase: "execute",
  });
  return { image: requireNormalizedImage(payload) };
}

async function executeListBreeds(input: Record<string, unknown>, context: TheCatApiContext) {
  const payload = await requestTheCatApiJson({
    path: "/breeds",
    apiKey: context.apiKey,
    query: buildPagingQuery(input),
    context,
    phase: "execute",
  });
  const breeds = parseArrayPayload(payload, "The Cat API breeds response must be an array");
  return { breeds: breeds.map(normalizeBreed).filter((breed) => breed !== null) };
}

async function executeSearchBreeds(input: Record<string, unknown>, context: TheCatApiContext) {
  const payload = await requestTheCatApiJson({
    path: "/breeds/search",
    apiKey: context.apiKey,
    query: {
      q: readRequiredString(input.query, "query"),
    },
    context,
    phase: "execute",
  });
  const breeds = parseArrayPayload(payload, "The Cat API breed search response must be an array");
  return { breeds: breeds.map(normalizeBreed).filter((breed) => breed !== null) };
}

async function executeGetBreed(input: Record<string, unknown>, context: TheCatApiContext) {
  const payload = await requestTheCatApiJson({
    path: `/breeds/${encodeURIComponent(readRequiredString(input.breedId, "breedId"))}`,
    apiKey: context.apiKey,
    query: {},
    context,
    phase: "execute",
  });
  return { breed: requireNormalizedBreed(payload) };
}

function buildSearchImagesQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: stringifyOptionalInteger(optionalInteger(input.limit)),
    page: stringifyOptionalInteger(optionalInteger(input.page)),
    order: optionalString(input.order),
    size: optionalString(input.size),
    mime_types: optionalString(input.mimeTypes),
    has_breeds: stringifyOptionalBoolean(optionalBoolean(input.hasBreeds)),
    breed_ids: optionalString(input.breedIds),
    category_ids: optionalString(input.categoryIds),
    include_breeds: stringifyOptionalBoolean(optionalBoolean(input.includeBreeds)),
    include_categories: stringifyOptionalBoolean(optionalBoolean(input.includeCategories)),
    format: optionalString(input.format),
  }) as Record<string, string | undefined>;
}

function buildPagingQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: stringifyOptionalInteger(optionalInteger(input.limit)),
    page: stringifyOptionalInteger(optionalInteger(input.page)),
  }) as Record<string, string | undefined>;
}

async function requestTheCatApiJson(input: {
  path: string;
  apiKey: string;
  query: Record<string, string | undefined>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: TheCatApiRequestPhase;
}) {
  const timeout = createProviderTimeout(input.context.signal, theCatApiDefaultTimeoutMs);
  const url = buildTheCatApiUrl(input.path, input.query);

  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readTheCatApiPayload(response);
    if (!response.ok) {
      throw createTheCatApiError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "The Cat API request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `The Cat API request failed: ${error.message}` : "The Cat API request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildTheCatApiUrl(path: string, query: Record<string, string | undefined>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, theCatApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readTheCatApiPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTheCatApiError(response: Response, payload: unknown, phase: TheCatApiRequestPhase) {
  const message = extractTheCatApiErrorMessage(payload) ?? response.statusText ?? "The Cat API request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractTheCatApiErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function parseArrayPayload(payload: unknown, message: string) {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, message);
  }
  return payload;
}

function requireNormalizedImage(payload: unknown) {
  const image = normalizeImage(payload);
  if (!image) {
    throw new ProviderRequestError(502, "The Cat API image response is missing id or url");
  }
  return image;
}

function normalizeImage(payload: unknown) {
  const record = optionalRecord(payload);
  const id = optionalString(record?.id);
  const url = optionalString(record?.url);
  if (!record || !id || !url) {
    return null;
  }

  return {
    id,
    url,
    width: optionalNumber(record.width) ?? null,
    height: optionalNumber(record.height) ?? null,
    breeds: Array.isArray(record.breeds) ? record.breeds.map(normalizeBreed).filter((breed) => breed !== null) : [],
    categories: Array.isArray(record.categories)
      ? record.categories.map(normalizeCategory).filter((category) => category !== null)
      : [],
    raw: record,
  };
}

function requireNormalizedBreed(payload: unknown) {
  const breed = normalizeBreed(payload);
  if (!breed) {
    throw new ProviderRequestError(502, "The Cat API breed response is missing id or name");
  }
  return breed;
}

function normalizeBreed(payload: unknown) {
  const record = optionalRecord(payload);
  const id = optionalString(record?.id);
  const name = optionalString(record?.name);
  if (!record || !id || !name) {
    return null;
  }
  return { ...record, id, name };
}

function normalizeCategory(payload: unknown) {
  const record = optionalRecord(payload);
  const id = optionalInteger(record?.id);
  const name = optionalString(record?.name);
  if (!record || id === undefined || !name) {
    return null;
  }
  return { ...record, id, name };
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function stringifyOptionalInteger(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function stringifyOptionalBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : String(value);
}
