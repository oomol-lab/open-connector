import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const tripadvisorApiBaseUrl = "https://api.content.tripadvisor.com/api/v1";

type TripadvisorActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const tripadvisorActionHandlers: ProviderActionHandlers<"tripadvisor", TripadvisorActionHandler> = {
  search_locations(input, context) {
    return listLocations("/location/search", buildSearchLocationsQuery(input), context);
  },
  search_nearby_locations(input, context) {
    return listLocations("/location/nearby_search", buildSearchNearbyLocationsQuery(input), context);
  },
  get_location_details(input, context) {
    return getLocationDetails(readRequiredLocationId(input.locationId), buildDetailsQuery(input), context);
  },
  get_location_photos(input, context) {
    return getLocationPhotos(readRequiredLocationId(input.locationId), buildPhotosQuery(input), context);
  },
};

export async function validateTripadvisorCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await tripadvisorGet(
    "/location/search",
    { searchQuery: "New York City", category: "geos", language: "en" },
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    "validate",
  );
  const results = readDataArray(payload);
  const firstLocation = optionalRecord(results[0]);
  return {
    profile: {
      accountId: "tripadvisor",
      displayName: "Tripadvisor API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: tripadvisorApiBaseUrl,
      validationEndpoint: "/location/search",
      firstLocationId: readOptionalId(firstLocation?.location_id),
      resultCount: results.length,
    }),
  };
}

function buildSearchLocationsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  assertSearchLocationConstraints(input);
  return compactObject({
    searchQuery: readRequiredNonEmptyString(input.searchQuery, "searchQuery"),
    category: optionalString(input.category),
    phone: optionalString(input.phone),
    address: optionalString(input.address),
    latLong: buildOptionalLatLong(input.latitude, input.longitude),
    radius: stringifyOptionalNumber(input.radius),
    radiusUnit: optionalString(input.radiusUnit),
    language: optionalString(input.language),
  }) as Record<string, string | undefined>;
}

function buildSearchNearbyLocationsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  if (input.radiusUnit !== undefined && input.radius === undefined) {
    throw new ProviderRequestError(400, "radiusUnit requires radius");
  }
  return compactObject({
    latLong: buildRequiredLatLong(input.latitude, input.longitude),
    category: optionalString(input.category),
    phone: optionalString(input.phone),
    address: optionalString(input.address),
    radius: stringifyOptionalNumber(input.radius),
    radiusUnit: optionalString(input.radiusUnit),
    language: optionalString(input.language),
  }) as Record<string, string | undefined>;
}

function buildDetailsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    language: optionalString(input.language),
    currency: optionalString(input.currency),
  }) as Record<string, string | undefined>;
}

function buildPhotosQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    language: optionalString(input.language),
    limit: stringifyOptionalNumber(input.limit),
    offset: stringifyOptionalNumber(input.offset),
    source: readOptionalSourceList(input.sources),
  }) as Record<string, string | undefined>;
}

async function listLocations(
  path: string,
  query: Record<string, string | undefined>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await tripadvisorGet(path, query, context, "execute");
  return {
    locations: readDataArray(payload).map((item) => normalizeLocationSummary(item)),
  };
}

async function getLocationDetails(
  locationId: string,
  query: Record<string, string | undefined>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await tripadvisorGet(
    `/location/${encodeURIComponent(locationId)}/details`,
    query,
    context,
    "execute",
  );
  return {
    location: normalizeLocationDetails(readRequiredObject(payload, "payload")),
  };
}

async function getLocationPhotos(
  locationId: string,
  query: Record<string, string | undefined>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await tripadvisorGet(`/location/${encodeURIComponent(locationId)}/photos`, query, context, "execute");
  const record = readRequiredObject(payload, "payload");
  return compactObject({
    photos: readDataArray(record).map((item) => normalizePhoto(item)),
    paging: normalizePaging(optionalRecord(record.paging)),
  });
}

async function tripadvisorGet(
  path: string,
  query: Record<string, string | undefined>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(tripadvisorRequestUrl(path, context.apiKey, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tripadvisor request failed: ${error.message}` : "Tripadvisor request failed",
      error,
    );
  }

  const payload = await readTripadvisorPayload(response, { allowInvalidPayload: !response.ok });
  if (!response.ok) {
    throw buildTripadvisorError(response.status, payload, phase);
  }
  return readRequiredObject(payload, "payload");
}

function tripadvisorRequestUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${tripadvisorApiBaseUrl}/`);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

async function readTripadvisorPayload(
  response: Response,
  options: { allowInvalidPayload?: boolean } = {},
): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    if (options.allowInvalidPayload) return undefined;
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Tripadvisor response body read failed: ${error.message}`
        : "Tripadvisor response body read failed",
      error,
    );
  }
  if (!text) {
    if (options.allowInvalidPayload) return undefined;
    throw new ProviderRequestError(502, "Tripadvisor returned an empty response");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (options.allowInvalidPayload) return undefined;
    throw new ProviderRequestError(502, "Tripadvisor returned invalid JSON");
  }
}

function buildTripadvisorError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message =
    extractErrorMessage(payload) ??
    (status === 429 ? "Tripadvisor request was rate limited" : `Tripadvisor request failed with status ${status}`);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(502, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const payloadObject = optionalRecord(payload);
  const directMessage = optionalString(payloadObject?.message);
  if (directMessage) return directMessage;
  const directError = optionalString(payloadObject?.error);
  if (directError) return directError;
  const errorObject = optionalRecord(payloadObject?.error);
  const nestedMessage = optionalString(errorObject?.message) ?? optionalString(errorObject?.detail);
  if (nestedMessage) return nestedMessage;
  const errors = payloadObject?.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      const record = optionalRecord(item);
      const detail = optionalString(record?.detail) ?? optionalString(record?.message);
      if (detail) return detail;
    }
  }
  return undefined;
}

function readDataArray(value: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(value.data)) {
    throw new ProviderRequestError(502, "Tripadvisor response missing data");
  }
  return value.data.map((item, index) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `Tripadvisor response.data[${index}] is not an object`);
    }
    return record;
  });
}

function normalizeLocationSummary(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    locationId: readRequiredLocationId(value.location_id),
    name: readRequiredNonEmptyString(value.name, "name"),
    distance: optionalString(value.distance),
    bearing: optionalString(value.bearing),
    addressObj: normalizeAddress(optionalRecord(value.address_obj)),
  });
}

function normalizeLocationDetails(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    locationId: readRequiredLocationId(value.location_id),
    name: optionalString(value.name),
    description: optionalString(value.description),
    webUrl: optionalString(value.web_url),
    website: optionalString(value.website),
    phone: optionalString(value.phone),
    email: optionalString(value.email),
    rating: readOptionalNumberLike(value.rating),
    numReviews: readOptionalIntegerLike(value.num_reviews),
    latitude: readOptionalNumberLike(value.latitude),
    longitude: readOptionalNumberLike(value.longitude),
    timezone: optionalString(value.timezone),
    addressObj: normalizeAddress(optionalRecord(value.address_obj)),
  });
}

function normalizeAddress(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const address = compactObject({
    street1: optionalString(value.street1),
    street2: optionalString(value.street2),
    city: optionalString(value.city),
    state: optionalString(value.state),
    country: optionalString(value.country),
    postalCode: optionalString(value.postalcode),
    addressString: optionalString(value.address_string),
  });
  return Object.keys(address).length > 0 ? address : undefined;
}

function normalizePhoto(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readRequiredInteger(value.id, "id"),
    album: optionalString(value.album),
    caption: optionalString(value.caption),
    isBlessed: typeof value.is_blessed === "boolean" ? value.is_blessed : undefined,
    publishedDate: optionalString(value.published_date),
    images: normalizeImages(readRequiredObject(value.images, "images")),
    source: normalizePhotoSource(optionalRecord(value.source)),
    user: normalizePhotoUser(optionalRecord(value.user)),
  });
}

function normalizeImages(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    thumbnail: normalizeImageVariant(optionalRecord(value.thumbnail)),
    small: normalizeImageVariant(optionalRecord(value.small)),
    medium: normalizeImageVariant(optionalRecord(value.medium)),
    large: normalizeImageVariant(optionalRecord(value.large)),
    original: normalizeImageVariant(optionalRecord(value.original)),
  });
}

function normalizeImageVariant(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return compactObject({
    url: optionalString(value.url),
    width: readOptionalIntegerLike(value.width),
    height: readOptionalIntegerLike(value.height),
  });
}

function normalizePhotoSource(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const source = compactObject({
    name: optionalString(value.name),
    localizedName: optionalString(value.localized_name),
  });
  return Object.keys(source).length > 0 ? source : undefined;
}

function normalizePhotoUser(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const user = compactObject({
    username: optionalString(value.username),
    reviewCount: readOptionalIntegerLike(value.review_count),
    reviewerBadge: optionalString(value.reviewer_badge),
    userLocation: normalizeReviewerLocation(optionalRecord(value.user_location)),
    avatar: normalizeUserAvatar(optionalRecord(value.avatar)),
  });
  return Object.keys(user).length > 0 ? user : undefined;
}

function normalizeReviewerLocation(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const location = compactObject({
    id: readOptionalId(value.id),
    name: optionalString(value.name),
  });
  return Object.keys(location).length > 0 ? location : undefined;
}

function normalizeUserAvatar(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const avatar = compactObject({
    small: optionalString(value.small),
    medium: optionalString(value.medium),
    large: optionalString(value.large),
    thumbnail: optionalString(value.thumbnail),
    original: optionalString(value.original),
  });
  return Object.keys(avatar).length > 0 ? avatar : undefined;
}

function normalizePaging(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const paging = compactObject({
    next: optionalString(value.next),
    previous: optionalString(value.previous),
    results: readOptionalIntegerLike(value.results),
    skipped: readOptionalIntegerLike(value.skipped),
    totalResults: readOptionalIntegerLike(value.total_results),
  });
  return Object.keys(paging).length > 0 ? paging : undefined;
}

function assertSearchLocationConstraints(input: Record<string, unknown>): void {
  const hasLatitude = input.latitude !== undefined;
  const hasLongitude = input.longitude !== undefined;
  const hasCoordinatePair = hasLatitude && hasLongitude;
  if ((hasLatitude || hasLongitude) && !hasCoordinatePair) {
    throw new ProviderRequestError(400, "latitude and longitude must be provided together");
  }
  if (input.radius !== undefined && !hasCoordinatePair) {
    throw new ProviderRequestError(400, "radius requires both latitude and longitude");
  }
  if (input.radiusUnit !== undefined && input.radius === undefined) {
    throw new ProviderRequestError(400, "radiusUnit requires radius");
  }
}

function buildOptionalLatLong(latitude: unknown, longitude: unknown): string | undefined {
  if (latitude === undefined && longitude === undefined) return undefined;
  return `${readRequiredNumber(latitude, "latitude")},${readRequiredNumber(longitude, "longitude")}`;
}

function buildRequiredLatLong(latitude: unknown, longitude: unknown): string {
  return `${readRequiredNumber(latitude, "latitude")},${readRequiredNumber(longitude, "longitude")}`;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Tripadvisor response missing ${fieldName}`);
  }
  return object;
}

function readRequiredLocationId(value: unknown): string {
  const normalized = readOptionalId(value);
  if (!normalized) throw new ProviderRequestError(400, "locationId is required");
  return normalized;
}

function readOptionalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function readRequiredNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(502, `Tripadvisor response missing ${fieldName}`);
  return normalized;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const normalized = readOptionalIntegerLike(value);
  if (normalized === undefined) throw new ProviderRequestError(502, `Tripadvisor response missing ${fieldName}`);
  return normalized;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const normalized = readOptionalNumberLike(value);
  if (normalized === undefined) throw new ProviderRequestError(400, `${fieldName} is required`);
  return normalized;
}

function readOptionalNumberLike(value: unknown): number | undefined {
  const directNumber = optionalNumber(value);
  if (directNumber !== undefined) return directNumber;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readOptionalIntegerLike(value: unknown): number | undefined {
  const normalized = readOptionalNumberLike(value);
  return normalized === undefined || !Number.isInteger(normalized) ? undefined : normalized;
}

function stringifyOptionalNumber(value: unknown): string | undefined {
  const normalized = readOptionalNumberLike(value);
  return normalized === undefined ? undefined : String(normalized);
}

function readOptionalSourceList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => (typeof item === "string" ? item.trim() : "")).filter((item) => item.length > 0);
  return items.length > 0 ? items.join(",") : undefined;
}
