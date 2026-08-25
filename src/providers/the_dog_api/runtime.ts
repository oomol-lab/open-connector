import type { CredentialValidationResult } from "../../core/types.ts";
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
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const theDogApiBaseUrl = "https://api.thedogapi.com/v1/";
const defaultTimeoutMs = 30_000;

type TheDogApiMethod = "GET" | "POST" | "DELETE";
type TheDogApiHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const theDogApiActionHandlers: ProviderActionHandlers<"the_dog_api", TheDogApiHandler> = {
  async search_images(input, context) {
    const format = optionalString(input.format);
    if (format && format !== "json") {
      throw new ProviderRequestError(400, "the_dog_api search_images currently supports format=json only");
    }
    const payload = await requestTheDogApiJson({
      method: "GET",
      path: "/images/search",
      context,
      query: buildSearchImagesQuery(input),
    });
    return { images: arrayPayload(payload, "The Dog API image search response").map(normalizeImage).filter(Boolean) };
  },
  async get_image(input, context) {
    const payload = await requestTheDogApiJson({
      method: "GET",
      path: `/images/${encodeURIComponent(requiredInputString(input.imageId, "imageId"))}`,
      context,
    });
    return { image: requireImage(payload) };
  },
  async list_breeds(input, context) {
    const payload = await requestTheDogApiJson({
      method: "GET",
      path: "/breeds",
      context,
      query: buildPagingQuery(input),
    });
    return { breeds: arrayPayload(payload, "The Dog API breeds response").map(normalizeBreed).filter(Boolean) };
  },
  async search_breeds(input, context) {
    const payload = await requestTheDogApiJson({
      method: "GET",
      path: "/breeds/search",
      context,
      query: { q: requiredInputString(input.query, "query") },
    });
    return { breeds: arrayPayload(payload, "The Dog API breed search response").map(normalizeBreed).filter(Boolean) };
  },
  async get_breed(input, context) {
    const payload = await requestTheDogApiJson({
      method: "GET",
      path: `/breeds/${encodeURIComponent(requiredInputString(input.breedId, "breedId"))}`,
      context,
    });
    return { breed: requireBreed(payload) };
  },
  async list_favourites(input, context) {
    const payload = await requestTheDogApiJson({
      method: "GET",
      path: "/favourites",
      context,
      query: buildAccountRecordQuery(input),
    });
    return { favourites: arrayPayload(payload, "The Dog API favourites response") };
  },
  async create_favourite(input, context) {
    const payload = await requestTheDogApiJson({
      method: "POST",
      path: "/favourites",
      context,
      body: compactObject({
        image_id: requiredInputString(input.imageId, "imageId"),
        sub_id: optionalString(input.subId),
      }),
    });
    return { result: mutationPayload(payload) };
  },
  async delete_favourite(input, context) {
    const payload = await requestTheDogApiJson({
      method: "DELETE",
      path: `/favourites/${encodeURIComponent(requiredInputString(input.favouriteId, "favouriteId"))}`,
      context,
    });
    return { result: mutationPayload(payload) };
  },
  async list_votes(input, context) {
    const payload = await requestTheDogApiJson({
      method: "GET",
      path: "/votes",
      context,
      query: buildAccountRecordQuery(input),
    });
    return { votes: arrayPayload(payload, "The Dog API votes response") };
  },
  async create_vote(input, context) {
    const payload = await requestTheDogApiJson({
      method: "POST",
      path: "/votes",
      context,
      body: compactObject({
        image_id: requiredInputString(input.imageId, "imageId"),
        value: optionalInteger(input.value),
        sub_id: optionalString(input.subId),
      }),
    });
    return { result: mutationPayload(payload) };
  },
  async delete_vote(input, context) {
    const payload = await requestTheDogApiJson({
      method: "DELETE",
      path: `/votes/${encodeURIComponent(requiredInputString(input.voteId, "voteId"))}`,
      context,
    });
    return { result: mutationPayload(payload) };
  },
};

export async function validateTheDogApiCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestTheDogApiJson({
    method: "GET",
    path: "/breeds",
    context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    query: { limit: "1" },
    phase: "validate",
  });
  const breed = normalizeBreed(arrayPayload(payload, "The Dog API validation response")[0]);
  return {
    profile: { accountId: "the_dog_api:api-key", displayName: "The Dog API Key" },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: "https://api.thedogapi.com/v1",
      validationEndpoint: "/breeds",
      sampleBreedId: breed?.id,
      sampleBreedName: breed?.name,
    }),
  };
}

function buildSearchImagesQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    limit: stringifyInteger(optionalInteger(input.limit)),
    page: stringifyInteger(optionalInteger(input.page)),
    order: optionalString(input.order),
    size: optionalString(input.size),
    mime_types: optionalString(input.mimeTypes),
    has_breeds: stringifyBoolean(optionalBoolean(input.hasBreeds)),
    breed_ids: optionalString(input.breedIds),
    category_ids: optionalString(input.categoryIds),
    include_breeds: stringifyBoolean(optionalBoolean(input.includeBreeds)),
    include_categories: stringifyBoolean(optionalBoolean(input.includeCategories)),
    format: optionalString(input.format),
  });
}

function buildPagingQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    limit: stringifyInteger(optionalInteger(input.limit)),
    page: stringifyInteger(optionalInteger(input.page)),
  });
}

function buildAccountRecordQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    limit: stringifyInteger(optionalInteger(input.limit)),
    page: stringifyInteger(optionalInteger(input.page)),
    sub_id: optionalString(input.subId),
  });
}

async function requestTheDogApiJson(input: {
  method: TheDogApiMethod;
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, defaultTimeoutMs);
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, theDogApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  try {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: compactObject({
        accept: "application/json",
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      }) as HeadersInit,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw mapDogError(response.status, payload, input.phase ?? "execute");
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, "The Dog API request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `The Dog API request failed: ${error.message}` : "The Dog API request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function mapDogError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `The Dog API request failed with HTTP ${status}`;
  return new ProviderRequestError(
    phase === "validate" && (status === 401 || status === 403) ? 401 : status,
    message,
    payload,
  );
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function arrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, `${label} must be an array`);
  return payload;
}

function requireImage(payload: unknown): Record<string, unknown> {
  const image = normalizeImage(payload);
  if (!image) throw new ProviderRequestError(502, "The Dog API image response is missing id or url");
  return image;
}

function normalizeImage(payload: unknown): Record<string, unknown> | null {
  const record = optionalRecord(payload);
  const id = optionalString(record?.id);
  const url = optionalString(record?.url);
  if (!record || !id || !url) return null;
  return {
    id,
    url,
    width: optionalNumber(record.width) ?? null,
    height: optionalNumber(record.height) ?? null,
    breeds: Array.isArray(record.breeds) ? record.breeds.map(normalizeBreed).filter(Boolean) : [],
    categories: Array.isArray(record.categories) ? record.categories.map(normalizeCategory).filter(Boolean) : [],
    raw: record,
  };
}

function requireBreed(payload: unknown): Record<string, unknown> {
  const breed = normalizeBreed(payload);
  if (!breed) throw new ProviderRequestError(502, "The Dog API breed response is missing id or name");
  return breed;
}

function normalizeBreed(payload: unknown): (Record<string, unknown> & { id: string; name: string }) | null {
  const record = optionalRecord(payload);
  const id = optionalString(record?.id);
  const name = optionalString(record?.name);
  return record && id && name ? { ...record, id, name } : null;
}

function normalizeCategory(payload: unknown): (Record<string, unknown> & { id: string; name: string }) | null {
  const record = optionalRecord(payload);
  const id = optionalString(record?.id);
  const name = optionalString(record?.name);
  return record && id && name ? { ...record, id, name } : null;
}

function mutationPayload(payload: unknown): Record<string, unknown> {
  return optionalRecord(payload) ?? { message: typeof payload === "string" ? payload : "ok" };
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function stringifyInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyBoolean(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
