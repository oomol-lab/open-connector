import type { CredentialValidationResult } from "../../core/types.ts";
import type { AppleMapsCredential } from "./auth.ts";

import { looseArray, optionalRecord } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import {
  acquireAppleMapsAccessToken,
  evictAppleMapsAccessToken,
  exchangeAppleMapsAccessTokenForValidation,
  readAppleMapsCredential,
} from "./auth.ts";
import {
  appleMapsApiOrigin,
  appleMapsProviderLabel,
  appleMapsTokenPath,
  createAppleMapsError,
  readAppleMapsPayload,
} from "./client.ts";

export interface AppleMapsRunContext {
  credential: AppleMapsCredential;
  fetcher: typeof fetch;
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface MapRegion {
  northLatitude: number;
  eastLongitude: number;
  southLatitude: number;
  westLongitude: number;
}

/** Hints shared by geocoding, search, and autocomplete. */
interface SearchHintInput {
  lang?: string;
  limitToCountries?: string[];
  searchLocation?: Coordinate;
  searchRegion?: MapRegion;
  userLocation?: Coordinate;
}

interface GeocodeAddressInput extends SearchHintInput {
  query: string;
}

interface ReverseGeocodeInput {
  location: Coordinate;
  lang?: string;
}

interface PlaceFilterInput extends SearchHintInput {
  query: string;
  includePoiCategories?: string[];
  excludePoiCategories?: string[];
  resultTypeFilter?: string[];
  includeAddressCategories?: string[];
  excludeAddressCategories?: string[];
  searchRegionPriority?: string;
}

interface SearchPlacesInput extends PlaceFilterInput {
  enablePagination?: boolean;
  pageToken?: string;
}

interface GetPlaceInput {
  placeId: string;
  lang?: string;
}

interface GetPlacesInput {
  placeIds: string[];
  lang?: string;
}

interface GetDirectionsInput {
  origin: string;
  destination: string;
  arrivalDate?: string;
  departureDate?: string;
  avoid?: string[];
  lang?: string;
  requestsAlternateRoutes?: boolean;
  searchLocation?: Coordinate;
  searchRegion?: MapRegion;
  userLocation?: Coordinate;
  transportType?: string;
  includeStepPaths?: boolean;
}

interface GetEtasInput {
  origin: Coordinate;
  destinations: Coordinate[];
  transportType?: string;
  departureDate?: string;
  arrivalDate?: string;
}

/** Validated input shape for each action. */
interface AppleMapsActionInputs {
  geocode_address: GeocodeAddressInput;
  reverse_geocode: ReverseGeocodeInput;
  search_places: SearchPlacesInput;
  autocomplete_search: PlaceFilterInput;
  get_place: GetPlaceInput;
  get_places: GetPlacesInput;
  get_alternate_place_ids: { placeIds: string[] };
  get_directions: GetDirectionsInput;
  get_etas: GetEtasInput;
}

type AppleMapsHandlers = {
  [Name in keyof AppleMapsActionInputs]: (
    input: AppleMapsActionInputs[Name],
    context: AppleMapsRunContext,
  ) => Promise<unknown>;
};

/** Undefined and empty parameters are omitted. */
type QueryParams = Record<string, string | undefined>;

interface AppleMapsResponse {
  ok: boolean;
  status: number;
  payload: unknown;
}

const appleMapsActionHandlers: AppleMapsHandlers = {
  async geocode_address(input, context) {
    const payload = await requestAppleMaps(context, "/v1/geocode", {
      q: input.query,
      ...searchHintParams(input),
    });
    return { results: looseArray(requiredResponseRecord(payload, "Apple Maps geocode response").results) };
  },

  async reverse_geocode(input, context) {
    const payload = await requestAppleMaps(context, "/v1/reverseGeocode", {
      loc: formatCoordinate(input.location),
      lang: input.lang,
    });
    return { results: looseArray(requiredResponseRecord(payload, "Apple Maps reverse geocode response").results) };
  },

  async search_places(input, context) {
    const payload = await requestAppleMaps(context, "/v1/search", {
      q: input.query,
      ...placeFilterParams(input),
      enablePagination: booleanString(input.enablePagination),
      pageToken: input.pageToken,
    });
    const body = requiredResponseRecord(payload, "Apple Maps search response");
    return {
      results: looseArray(body.results),
      displayMapRegion: optionalRecord(body.displayMapRegion) ?? null,
      paginationInfo: optionalRecord(body.paginationInfo) ?? null,
    };
  },

  async autocomplete_search(input, context) {
    const payload = await requestAppleMaps(context, "/v1/searchAutocomplete", {
      q: input.query,
      ...placeFilterParams(input),
    });
    return {
      results: looseArray(requiredResponseRecord(payload, "Apple Maps search autocomplete response").results),
    };
  },

  async get_place(input, context) {
    // encodeURIComponent preserves dot segments, which would resolve to a different endpoint.
    if (input.placeId === "." || input.placeId === "..") {
      throw new ProviderRequestError(400, "placeId must be an Apple Maps Place ID");
    }
    const payload = await requestAppleMaps(context, `/v1/place/${encodeURIComponent(input.placeId)}`, {
      lang: input.lang,
    });
    return { place: requiredResponseRecord(payload, "Apple Maps place response") };
  },

  async get_places(input, context) {
    const payload = await requestAppleMaps(context, "/v1/place", {
      ids: input.placeIds.join(","),
      lang: input.lang,
    });
    const body = requiredResponseRecord(payload, "Apple Maps places response");
    return { results: looseArray(body.results), errors: looseArray(body.errors) };
  },

  async get_alternate_place_ids(input, context) {
    const payload = await requestAppleMaps(context, "/v1/place/alternateIds", {
      ids: input.placeIds.join(","),
    });
    const body = requiredResponseRecord(payload, "Apple Maps alternate place IDs response");
    return { results: looseArray(body.results), errors: looseArray(body.errors) };
  },

  async get_directions(input, context) {
    // Input validation rejects using arrivalDate and departureDate together.
    const payload = await requestAppleMaps(context, "/v1/directions", {
      origin: input.origin,
      destination: input.destination,
      arrivalDate: formatUtcDateTime(input.arrivalDate, "arrivalDate"),
      departureDate: formatUtcDateTime(input.departureDate, "departureDate"),
      avoid: joinList(input.avoid),
      lang: input.lang,
      requestsAlternateRoutes: booleanString(input.requestsAlternateRoutes),
      searchLocation: formatOptionalCoordinate(input.searchLocation),
      searchRegion: formatOptionalRegion(input.searchRegion),
      userLocation: formatOptionalCoordinate(input.userLocation),
      transportType: input.transportType,
    });
    const body = requiredResponseRecord(payload, "Apple Maps directions response");
    return {
      origin: optionalRecord(body.origin) ?? null,
      destination: optionalRecord(body.destination) ?? null,
      routes: looseArray(body.routes),
      steps: looseArray(body.steps),
      // Apple always returns every path, which may be large, so expose them only when requested.
      stepPaths: input.includeStepPaths === true ? looseArray(body.stepPaths) : null,
    };
  },

  async get_etas(input, context) {
    const payload = await requestAppleMaps(context, "/v1/etas", {
      origin: formatCoordinate(input.origin),
      destinations: input.destinations.map(formatCoordinate).join("|"),
      transportType: input.transportType,
      departureDate: formatUtcDateTime(input.departureDate, "departureDate"),
      arrivalDate: formatUtcDateTime(input.arrivalDate, "arrivalDate"),
    });
    return { etas: looseArray(requiredResponseRecord(payload, "Apple Maps ETA response").etas) };
  },
};

export async function executeAppleMapsAction(
  actionName: string,
  input: Record<string, unknown>,
  context: AppleMapsRunContext,
): Promise<unknown> {
  if (!Object.hasOwn(appleMapsActionHandlers, actionName)) {
    throw new ProviderRequestError(400, `unknown apple_maps action: ${actionName}`);
  }
  validateAppleMapsInput(actionName, input);
  // The action schema has validated, defaulted, and trimmed this input.
  const handler = appleMapsActionHandlers[actionName as keyof AppleMapsActionInputs] as (
    input: unknown,
    context: AppleMapsRunContext,
  ) => Promise<unknown>;
  return handler(input, context);
}

function validateAppleMapsInput(actionName: string, input: Record<string, unknown>): void {
  if (actionName === "get_directions" && input.arrivalDate !== undefined && input.departureDate !== undefined) {
    throw new ProviderRequestError(400, "arrivalDate and departureDate cannot be used together");
  }
  if (actionName !== "search_places" && actionName !== "autocomplete_search") return;
  const filtersAddresses = input.includeAddressCategories !== undefined || input.excludeAddressCategories !== undefined;
  const resultTypes = Array.isArray(input.resultTypeFilter) ? input.resultTypeFilter : undefined;
  if (filtersAddresses && resultTypes && !resultTypes.includes("address")) {
    throw new ProviderRequestError(
      400,
      "resultTypeFilter must include address when includeAddressCategories or excludeAddressCategories is set",
    );
  }
}

/**
 * Validate a configured key with GET /v1/token.
 *
 * A successful exchange proves that the Team ID, Key ID, and private key match and have Maps
 * access. Maps Server API has no account endpoint, so the profile uses the supplied Team ID.
 */
export async function validateAppleMapsCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const credential = readAppleMapsCredential(values);
  await exchangeAppleMapsAccessTokenForValidation(credential, fetcher);

  return {
    profile: { accountId: `apple_maps:${credential.teamId}`, displayName: `Apple Maps team ${credential.teamId}` },
    metadata: {
      apiBaseUrl: appleMapsApiOrigin,
      validationEndpoint: appleMapsTokenPath,
      teamId: credential.teamId,
      keyId: credential.keyId,
    },
  };
}

/**
 * Send a business GET request and return its parsed successful response.
 *
 * Evict every token rejected with 401. Retry once when the rejected token came from cache; a fresh
 * token rejected during the same execution indicates a credential problem and is not retried.
 */
async function requestAppleMaps(context: AppleMapsRunContext, path: string, params: QueryParams): Promise<unknown> {
  const url = `${appleMapsApiOrigin}${path}${buildQueryString(params)}`;
  const lease = await acquireAppleMapsAccessToken(context.credential, context.fetcher);
  let response = await sendAppleMapsRequest(context.fetcher, url, lease.accessToken);
  if (response.status === 401) {
    evictAppleMapsAccessToken(context.credential, lease.accessToken);
    if (lease.fromCache) {
      const retryLease = await acquireAppleMapsAccessToken(context.credential, context.fetcher);
      response = await sendAppleMapsRequest(context.fetcher, url, retryLease.accessToken);
      if (response.status === 401) {
        evictAppleMapsAccessToken(context.credential, retryLease.accessToken);
      }
    }
  }

  if (!response.ok) {
    throw createAppleMapsError(response.status, response.payload, "execute");
  }
  return response.payload;
}

async function sendAppleMapsRequest(
  fetcher: typeof fetch,
  url: string,
  accessToken: string,
): Promise<AppleMapsResponse> {
  return runProviderRequest({ label: appleMapsProviderLabel }, async (signal) => {
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${accessToken}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      payload: await readAppleMapsPayload(response),
    };
  });
}

/**
 * Build a query string with `%20` spaces, matching Apple's examples rather than URLSearchParams.
 */
function buildQueryString(params: QueryParams): string {
  const pairs = Object.entries(params).flatMap(([name, value]) =>
    value === undefined || value === "" ? [] : [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`],
  );
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

function searchHintParams(input: SearchHintInput): QueryParams {
  return {
    limitToCountries: joinList(input.limitToCountries),
    lang: input.lang,
    searchLocation: formatOptionalCoordinate(input.searchLocation),
    searchRegion: formatOptionalRegion(input.searchRegion),
    userLocation: formatOptionalCoordinate(input.userLocation),
  };
}

function placeFilterParams(input: PlaceFilterInput): QueryParams {
  return {
    ...searchHintParams(input),
    includePoiCategories: joinList(input.includePoiCategories),
    excludePoiCategories: joinList(input.excludePoiCategories),
    resultTypeFilter: joinList(input.resultTypeFilter),
    includeAddressCategories: joinList(input.includeAddressCategories),
    excludeAddressCategories: joinList(input.excludeAddressCategories),
    searchRegionPriority: input.searchRegionPriority,
  };
}

/** Apple list parameters are comma-separated strings; empty lists are omitted. */
function joinList(values: readonly string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(",") : undefined;
}

function formatCoordinate(coordinate: Coordinate): string {
  return `${formatDecimal(coordinate.latitude)},${formatDecimal(coordinate.longitude)}`;
}

function formatOptionalCoordinate(coordinate: Coordinate | undefined): string | undefined {
  return coordinate ? formatCoordinate(coordinate) : undefined;
}

/** SearchRegion order is north, east, south, west. */
function formatOptionalRegion(region: MapRegion | undefined): string | undefined {
  return region
    ? [region.northLatitude, region.eastLongitude, region.southLatitude, region.westLongitude]
        .map(formatDecimal)
        .join(",")
    : undefined;
}

/**
 * Format a coordinate as decimal text without exponent notation.
 *
 * Number#toString uses exponent notation below 1e-6, which Apple's coordinate strings reject.
 * Expanding it preserves significant digits without the binary-error padding introduced by toFixed.
 */
function formatDecimal(value: number): string {
  const text = String(value);
  const exponentIndex = text.indexOf("e-");
  if (exponentIndex === -1) {
    return text;
  }

  const negative = text.startsWith("-");
  const mantissa = text.slice(negative ? 1 : 0, exponentIndex);
  const exponent = Number(text.slice(exponentIndex + "e-".length));
  const [integerDigits = "", fractionDigits = ""] = mantissa.split(".");
  // Moving the decimal left by the exponent adds leading zeros before the significant digits.
  const leadingZeros = "0".repeat(exponent - integerDigits.length);
  return `${negative ? "-" : ""}0.${leadingZeros}${integerDigits}${fractionDigits}`;
}

/**
 * Format a validated date-time as Apple's second-precision UTC representation.
 *
 * Normalize offsets to UTC and discard fractional seconds. Reject schema-valid forms Date.parse
 * cannot read, such as hour-only offsets and leap seconds, instead of sending ambiguous input.
 */
function formatUtcDateTime(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new ProviderRequestError(
      400,
      `${fieldName} must be an ISO 8601 date-time Apple can read, such as 2023-04-15T16:42:00Z`,
    );
  }
  return `${new Date(time).toISOString().slice(0, 19)}Z`;
}

function booleanString(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
