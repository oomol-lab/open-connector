import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const placesBaseUrl = "https://places.googleapis.com";
const routesBaseUrl = "https://routes.googleapis.com";
const geocodingBaseUrl = "https://maps.googleapis.com";
const searchFieldMask =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus,places.googleMapsUri,nextPageToken";
const nearbyFieldMask =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.businessStatus,places.googleMapsUri";
const detailsFieldMask = "id,displayName,formattedAddress,location,types,businessStatus,googleMapsUri";

type Phase = "validate" | "execute";
interface RequestOptions {
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  fieldMask?: string;
  apiKeyInQuery?: boolean;
}

export const handlers: ProviderActionHandlers<
  "google_maps",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  search_places(input, context) {
    const { fieldMask, body } = placesBody(input, searchFieldMask);
    return requestJson(
      new URL("/v1/places:searchText", placesBaseUrl),
      { method: "POST", body, fieldMask },
      context,
      "execute",
      "Google Places text search",
    );
  },
  search_nearby_places(input, context) {
    const { latitude, longitude, radiusMeters, fieldMask: _fieldMask, ...body } = input;
    body.locationRestriction = { circle: { center: { latitude, longitude }, radius: radiusMeters } };
    return requestJson(
      new URL("/v1/places:searchNearby", placesBaseUrl),
      { method: "POST", body, fieldMask: optionalString(input.fieldMask)?.trim() || nearbyFieldMask },
      context,
      "execute",
      "Google Places nearby search",
    );
  },
  get_place(input, context) {
    const placeId = requiredInputString(input.placeId, "placeId");
    const url = new URL(`/v1/places/${encodeURIComponent(placeId)}`, placesBaseUrl);
    addQuery(url, "languageCode", input.languageCode);
    addQuery(url, "regionCode", input.regionCode);
    return requestJson(
      url,
      { method: "GET", fieldMask: optionalString(input.fieldMask)?.trim() || detailsFieldMask },
      context,
      "execute",
      "Google Place details",
    );
  },
  autocomplete_places(input, context) {
    return requestJson(
      new URL("/v1/places:autocomplete", placesBaseUrl),
      { method: "POST", body: input },
      context,
      "execute",
      "Google Places autocomplete",
    );
  },
  geocode_address(input, context) {
    const url = new URL("/maps/api/geocode/json", geocodingBaseUrl);
    addQuery(url, "address", input.address);
    addQuery(url, "bounds", input.bounds);
    addQuery(url, "components", input.components);
    addQuery(url, "language", input.language);
    addQuery(url, "region", input.region);
    return requestJson(url, { method: "GET", apiKeyInQuery: true }, context, "execute", "Google Geocoding");
  },
  reverse_geocode(input, context) {
    const url = new URL("/maps/api/geocode/json", geocodingBaseUrl);
    url.searchParams.set("latlng", `${input.latitude},${input.longitude}`);
    addArrayQuery(url, "result_type", input.resultTypes);
    addArrayQuery(url, "location_type", input.locationTypes);
    addQuery(url, "language", input.language);
    addQuery(url, "region", input.region);
    return requestJson(url, { method: "GET", apiKeyInQuery: true }, context, "execute", "Google reverse geocoding");
  },
  compute_routes(input, context) {
    const { fieldMask, body } = routesBody(input);
    return requestJson(
      new URL("/directions/v2:computeRoutes", routesBaseUrl),
      { method: "POST", body, fieldMask },
      context,
      "execute",
      "Google Routes",
    );
  },
  compute_route_matrix(input, context) {
    const { fieldMask, body } = routesBody(input);
    if (!maskIncludes(fieldMask, "status")) {
      throw new ProviderRequestError(400, "fieldMask for compute_route_matrix must include status");
    }
    return requestJson(
      new URL("/distanceMatrix/v2:computeRouteMatrix", routesBaseUrl),
      { method: "POST", body, fieldMask },
      context,
      "execute",
      "Google Routes matrix",
    );
  },
};

export async function validateCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestJson(
    new URL("/v1/places:searchText", placesBaseUrl),
    { method: "POST", body: { textQuery: "Google" }, fieldMask: "places.id" },
    { apiKey: input.apiKey, fetcher, signal },
    "validate",
    "Google Maps credential validation",
  );
  return {
    profile: { accountId: "google_maps", displayName: "Google Maps API Key" },
    grantedScopes: [],
    metadata: { validationEndpoint: "/v1/places:searchText" },
  };
}

async function requestJson(
  url: URL,
  options: RequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: Phase,
  label: string,
): Promise<unknown> {
  if (options.apiKeyInQuery) url.searchParams.set("key", context.apiKey);
  const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
  if (options.body) headers.set("content-type", "application/json");
  if (!options.apiKeyInQuery) headers.set("x-goog-api-key", context.apiKey);
  if (options.fieldMask) headers.set("x-goog-fieldmask", options.fieldMask);
  const response = await runProviderRequest({ signal: context.signal, label }, (signal) =>
    context.fetcher(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    }),
  );
  const payload = await readPayload(response, label);
  if (!response.ok) throw requestError(response.status, payload, phase, label);
  const record = optionalRecord(payload);
  if (record && typeof record.status === "string" && record.status !== "OK" && record.status !== "ZERO_RESULTS") {
    throw requestError(googleStatusHttpStatus(record.status), payload, phase, label);
  }
  return payload;
}

async function readPayload(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }
}

function requestError(status: number, payload: unknown, phase: Phase, label: string): ProviderRequestError {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  const message =
    optionalString(error?.message) ??
    optionalString(record?.error_message) ??
    optionalString(record?.status) ??
    `${label} failed with HTTP ${status || 500}`;
  if (status === 429 || record?.status === "OVER_QUERY_LIMIT") return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (status === 400 || status === 401 || status === 403))
    return new ProviderRequestError(400, message, payload);
  if (status === 400 || status === 422) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function placesBody(
  input: Record<string, unknown>,
  fallback: string,
): { fieldMask: string; body: Record<string, unknown> } {
  const { fieldMask: _fieldMask, ...body } = input;
  return { fieldMask: optionalString(input.fieldMask)?.trim() || fallback, body };
}

function routesBody(input: Record<string, unknown>): { fieldMask: string; body: Record<string, unknown> } {
  const fieldMask = optionalString(input.fieldMask)?.trim();
  if (!fieldMask) throw new ProviderRequestError(400, "fieldMask is required");
  const { fieldMask: _fieldMask, ...body } = input;
  return { fieldMask, body };
}

function addQuery(url: URL, name: string, value: unknown): void {
  const text = optionalString(value);
  if (text) url.searchParams.set(name, text);
}

function addArrayQuery(url: URL, name: string, value: unknown): void {
  if (Array.isArray(value) && value.length > 0) url.searchParams.set(name, value.join("|"));
}

function maskIncludes(mask: string, field: string): boolean {
  return mask.trim() === "*" || mask.split(",").some((part) => part.trim() === field);
}

function googleStatusHttpStatus(status: string): number {
  if (status === "OVER_QUERY_LIMIT") return 429;
  if (status === "REQUEST_DENIED") return 403;
  if (status === "INVALID_REQUEST" || status === "NOT_FOUND") return 400;
  return 502;
}
