import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FoursquareActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "foursquare";
const foursquareApiBaseUrl = "https://api.foursquare.com";
const foursquareValidationPath = "/v3/places/search";
const requiredPlaceFields = ["fsq_id", "name"];

type FoursquareActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const foursquareActionHandlers: Record<FoursquareActionName, FoursquareActionHandler> = {
  async search_places(input, context) {
    validateSearchPlacesInput(input);
    const payload = await requestFoursquareJson({
      path: "/v3/places/search",
      query: compactObject({
        near: optionalString(input.near),
        query: optionalString(input.query),
        fields: joinStringArray(input.fields, requiredPlaceFields),
        radius: optionalNumber(input.radius),
        limit: optionalNumber(input.limit),
        ll: serializeLatLng(input.latitude, input.longitude),
        open_now: optionalBoolean(input.openNow),
        open_at: optionalString(input.openAt),
        min_price: optionalNumber(input.minPrice),
        max_price: optionalNumber(input.maxPrice),
        exclude_all_chains: optionalBoolean(input.excludeAllChains),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Foursquare search response");
    return {
      context: normalizeUnknown(record.context),
      results: normalizePlaceArray(record.results),
    };
  },

  async get_nearby_places(input, context) {
    const payload = await requestFoursquareJson({
      path: "/v3/places/nearby",
      query: compactObject({
        ll: serializeRequiredLatLng(input.latitude, input.longitude),
        hacc: optionalNumber(input.hacc),
        altitude: optionalNumber(input.altitude),
        limit: optionalNumber(input.limit),
        fields: joinStringArray(input.fields, requiredPlaceFields),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Foursquare nearby response");
    return {
      results: normalizePlaceArray(record.results),
    };
  },

  async get_place(input, context) {
    const fsqId = requireString(input.fsqId, "fsqId");
    const payload = await requestFoursquareJson({
      path: `/v3/places/${encodeURIComponent(fsqId)}`,
      query: compactObject({
        fields: joinStringArray(input.fields, requiredPlaceFields),
      }),
      context,
      phase: "execute",
    });

    return normalizePlace(payload);
  },

  async get_place_photos(input, context) {
    const fsqId = requireString(input.fsqId, "fsqId");
    const payload = await requestFoursquareJson({
      path: `/v3/places/${encodeURIComponent(fsqId)}/photos`,
      query: compactObject({
        sort: optionalString(input.sort),
        classifications: joinStringArray(input.classifications),
        limit: optionalNumber(input.limit),
      }),
      context,
      phase: "execute",
    });

    return {
      photos: normalizePhotoArray(payload),
    };
  },

  async get_place_tips(input, context) {
    const fsqId = requireString(input.fsqId, "fsqId");
    const payload = await requestFoursquareJson({
      path: `/v3/places/${encodeURIComponent(fsqId)}/tips`,
      query: compactObject({
        sort: optionalString(input.sort),
        limit: optionalNumber(input.limit),
        fields: joinStringArray(input.fields),
      }),
      context,
      phase: "execute",
    });

    const record = requireObject(payload, "Foursquare tips response");
    return {
      tips: normalizeTipArray(record.results),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, foursquareActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: foursquareApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "fsq3 ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestFoursquareJson({
      path: foursquareValidationPath,
      query: {
        query: "coffee",
        near: "New York, NY",
        limit: 1,
      },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    const record = requireObject(payload, "Foursquare validation response");
    const results = Array.isArray(record.results) ? record.results : [];
    return {
      profile: {
        accountId: "foursquare-api-key",
        displayName: "Foursquare API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: foursquareApiBaseUrl,
        validationEndpoint: foursquareValidationPath,
        resultCount: results.length,
      },
    };
  },
};

async function requestFoursquareJson(input: {
  path: string;
  query: Record<string, string | number | boolean | undefined>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildFoursquareUrl(input.path, input.query), {
      method: "GET",
      headers: foursquareHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
    payload = await readFoursquarePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Foursquare request failed: ${error.message}` : "Foursquare request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createFoursquareError(response, payload, input.phase);
  }

  return payload;
}

function buildFoursquareUrl(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, foursquareApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function foursquareHeaders(apiKey: string): Headers {
  return new Headers({
    accept: "application/json",
    authorization: `fsq3 ${apiKey}`,
    "user-agent": providerUserAgent,
  });
}

async function readFoursquarePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createFoursquareError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const record = optionalRecord(payload) ?? {};
  const message =
    optionalString(record.message) ??
    optionalString(record.error) ??
    `Foursquare request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }

  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function joinStringArray(value: unknown, requiredFields: readonly string[] = []): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const fields = value.map((item) => String(item));
  for (const field of requiredFields) {
    if (!fields.includes(field)) {
      fields.push(field);
    }
  }

  return fields.join(",");
}

function validateSearchPlacesInput(input: Record<string, unknown>): void {
  const hasLatitude = input.latitude !== undefined;
  const hasLongitude = input.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new ProviderRequestError(400, "latitude and longitude must be provided together.");
  }

  if (!optionalString(input.query) && !optionalString(input.near) && !hasLatitude) {
    throw new ProviderRequestError(400, "query, near, or latitude/longitude is required.");
  }

  if (optionalBoolean(input.openNow) && optionalString(input.openAt)) {
    throw new ProviderRequestError(400, "openNow and openAt cannot be used together.");
  }

  const minPrice = optionalNumber(input.minPrice);
  const maxPrice = optionalNumber(input.maxPrice);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ProviderRequestError(400, "minPrice must be less than or equal to maxPrice.");
  }
}

function serializeLatLng(latitude: unknown, longitude: unknown): string | undefined {
  const lat = optionalNumber(latitude);
  const lon = optionalNumber(longitude);
  if (lat === undefined || lon === undefined) {
    return undefined;
  }
  return `${lat},${lon}`;
}

function serializeRequiredLatLng(latitude: unknown, longitude: unknown): string {
  const ll = serializeLatLng(latitude, longitude);
  if (!ll) {
    throw new ProviderRequestError(400, "latitude and longitude are required");
  }
  return ll;
}

function requireString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return record;
}

function normalizePlaceArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throwInvalidArrayResponse("results", value);
  }
  return value.map((item) => normalizePlace(item));
}

function normalizePhotoArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throwInvalidArrayResponse("photos", value);
  }
  return value.map((item) => normalizePhoto(item));
}

function normalizeTipArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throwInvalidArrayResponse("tips", value);
  }
  return value.map((item) => normalizeTip(item));
}

function throwInvalidArrayResponse(fieldName: "results" | "photos" | "tips", value: unknown): never {
  throw new ProviderRequestError(
    502,
    `invalid foursquare ${fieldName} response: expected array, got ${describeResponseValue(value)}`,
    value,
  );
}

function describeResponseValue(value: unknown): string {
  const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

  if (type === "string") {
    return `${type} ${truncateErrorText(JSON.stringify(value))}`;
  }

  if (type === "object") {
    try {
      return `${type} ${truncateErrorText(JSON.stringify(value))}`;
    } catch {
      return type;
    }
  }

  return `${type} ${String(value)}`;
}

function truncateErrorText(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function normalizePlace(value: unknown): Record<string, unknown> {
  return normalizeRecord(value, "invalid foursquare place response");
}

function normalizePhoto(value: unknown): Record<string, unknown> {
  return normalizeRecord(value, "invalid foursquare photo response");
}

function normalizeTip(value: unknown): Record<string, unknown> {
  return normalizeRecord(value, "invalid foursquare tip response");
}

function normalizeRecord(value: unknown, message: string): Record<string, unknown> {
  const normalized = normalizeUnknown(value);
  const record = optionalRecord(normalized);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function normalizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeUnknown(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [toCamelCase(key), normalizeUnknown(child)]),
  );
}

function toCamelCase(value: string): string {
  const segments = value.split("_");
  if (segments.length === 1) {
    return value;
  }

  return segments
    .map((segment, index) => (index === 0 ? segment : segment.slice(0, 1).toUpperCase() + segment.slice(1)))
    .join("");
}
