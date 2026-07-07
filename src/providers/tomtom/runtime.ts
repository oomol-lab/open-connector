import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TomtomActionName } from "./actions.ts";

import { optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const tomtomApiBaseUrl: string = "https://api.tomtom.com";
const tomtomValidationPath = "/search/2/geocode/Amsterdam.json";

type TomtomActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const tomtomActionHandlers: Record<TomtomActionName, TomtomActionHandler> = {
  fuzzy_search(input, context) {
    assertLatLonPair(input);
    return requestTomtomJson(context, {
      path: `/search/2/search/${encodeQueryPath(input.query, "query")}.json`,
      query: {
        limit: optionalNumber(input.limit),
        ofs: optionalNumber(input.offset),
        countrySet: joinStringArray(input.countrySet),
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        radius: optionalNumber(input.radius),
        language: optionalString(input.language),
        categorySet: joinNumberArray(input.categorySet),
        brandSet: joinStringArray(input.brandSet),
        entityTypeSet: joinStringArray(input.entityTypeSet),
        view: optionalString(input.view),
      },
    });
  },
  autocomplete(input, context) {
    assertLatLonPair(input);
    return requestTomtomJson(context, {
      path: `/search/2/autocomplete/${encodeQueryPath(input.query, "query")}.json`,
      query: {
        language: optionalString(input.language),
        limit: optionalNumber(input.limit),
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        radius: optionalNumber(input.radius),
        countrySet: joinStringArray(input.countrySet),
        resultSet: joinStringArray(input.resultSet),
      },
    });
  },
  nearby_search(input, context) {
    return requestTomtomJson(context, {
      path: "/search/2/nearbySearch/.json",
      query: {
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        radius: optionalNumber(input.radius),
        limit: optionalNumber(input.limit),
        ofs: optionalNumber(input.offset),
        countrySet: joinStringArray(input.countrySet),
        language: optionalString(input.language),
        categorySet: joinNumberArray(input.categorySet),
        brandSet: joinStringArray(input.brandSet),
        view: optionalString(input.view),
      },
    });
  },
  geocode(input, context) {
    assertLatLonPair(input);
    return requestTomtomJson(context, {
      path: `/search/2/geocode/${encodeQueryPath(input.query, "query")}.json`,
      query: {
        limit: optionalNumber(input.limit),
        ofs: optionalNumber(input.offset),
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        radius: optionalNumber(input.radius),
        countrySet: joinStringArray(input.countrySet),
        language: optionalString(input.language),
        view: optionalString(input.view),
        entityTypeSet: joinStringArray(input.entityTypeSet),
      },
    });
  },
  reverse_geocode(input, context) {
    return requestTomtomJson(context, {
      path: `/search/2/reverseGeocode/${serializePositionPath(input.lat, input.lon)}.json`,
      query: {
        radius: optionalNumber(input.radius),
        entityType: optionalString(input.entityType),
        language: optionalString(input.language),
        returnMatchType: optionalBoolean(input.returnMatchType),
        view: optionalString(input.view),
      },
    });
  },
};

export async function validateTomtomCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await requestTomtomJson(
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    { path: tomtomValidationPath, query: { limit: 1 }, phase: "validate" },
  );
  return {
    profile: {
      accountId: "tomtom-api-key",
      displayName: "TomTom API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: tomtomApiBaseUrl,
      validationEndpoint: tomtomValidationPath,
    },
  };
}

async function requestTomtomJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: {
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    phase?: "validate" | "execute";
  },
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildTomtomUrl(input.path, { key: context.apiKey, ...(input.query ?? {}) }), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readTomtomPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TomTom request failed: ${error.message}` : "TomTom request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createTomtomError(response, payload, input.phase ?? "execute");
  }

  return payload;
}

function buildTomtomUrl(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, tomtomApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readTomtomPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createTomtomError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload) ?? {};
  const detailedError = optionalRecord(record.detailedError);
  const message =
    optionalString(detailedError?.message) ??
    optionalString(record.errorDescription) ??
    optionalString(record.error) ??
    optionalString(record.message) ??
    `TomTom request failed with ${response.status}`;

  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status === 400) return new ProviderRequestError(400, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function encodeQueryPath(value: unknown, fieldName: string): string {
  const query = optionalString(value);
  if (!query) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(query);
}

function serializePositionPath(lat: unknown, lon: unknown): string {
  const latitude = optionalNumber(lat);
  const longitude = optionalNumber(lon);
  if (latitude === undefined || longitude === undefined) {
    throw new ProviderRequestError(400, "lat and lon are required");
  }
  return `${latitude},${longitude}`;
}

function assertLatLonPair(input: Record<string, unknown>): void {
  const hasLat = input.lat !== undefined;
  const hasLon = input.lon !== undefined;
  if (hasLat !== hasLon) {
    throw new ProviderRequestError(400, "lat and lon must be provided together.");
  }
}

function joinStringArray(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map((item) => String(item)).join(",") : undefined;
}

function joinNumberArray(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map((item) => String(item)).join(",") : undefined;
}
