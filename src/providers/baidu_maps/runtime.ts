import type { CredentialValidationResult } from "../../core/types.ts";
import type { BaiduMapsActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, readProviderTextBody } from "../provider-runtime.ts";

export const baiduMapsApiBaseUrl = "https://api.map.baidu.com";
export const baiduMapsValidationPath = "/reverse_geocoding/v3/";

export interface BaiduMapsActionContext {
  apiKey: string;
  sk?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type QueryValue = string | number | undefined;
type BaiduMapsRequestPhase = "validate" | "execute";

interface BaiduMapsResponsePayload {
  status?: unknown;
  message?: unknown;
  result?: unknown;
  results?: unknown;
  content?: unknown;
  address?: unknown;
  data_version?: unknown;
  [key: string]: unknown;
}

// Errors mapped from Baidu Maps `status` field to ProviderRequestError codes.
// Reference: https://lbsyun.baidu.com/faq/api (error code table)
const baiduMapsAuthStatuses = new Set([
  1, 2, 101, 102, 200, 201, 210, 211, 240, 250, 251, 260, 401, 402, 403, 404, 500, 501, 2000,
]);
// 301/302 = quota exceeded, 401/402 = concurrency over quota (402 = billing
// enabled). All are "slow down / over quota", so map to 429 (retryable) — the
// rate-limit set is checked before the auth set in normalizeBaiduMapsError.
const baiduMapsRateLimitStatuses = new Set([301, 302, 401, 402, 502, 503]);
const baiduMapsInputStatuses = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 21, 22, 23, 24, 25, 26, 27, 28, 29]);

type RuntimeInput = Record<string, unknown>;
type BaiduMapsActionHandler = (input: RuntimeInput, context: BaiduMapsActionContext) => Promise<unknown>;

export const baiduMapsActionHandlers: Record<BaiduMapsActionName, BaiduMapsActionHandler> = {
  geocode(input, context) {
    return executeGeocode(input, context);
  },
  reverse_geocode(input, context) {
    return executeReverseGeocode(input, context);
  },
  search_places(input, context) {
    return executeSearchPlaces(input, context);
  },
  search_places_around(input, context) {
    return executeSearchPlacesAround(input, context);
  },
  search_places_polygon(input, context) {
    return executeSearchPlacesPolygon(input, context);
  },
  get_place_detail(input, context) {
    return executeGetPlaceDetail(input, context);
  },
  input_tips(input, context) {
    return executeInputTips(input, context);
  },
  ip_locate(input, context) {
    return executeIpLocate(input, context);
  },
  district_search(input, context) {
    return executeDistrictSearch(input, context);
  },
  weather(input, context) {
    return executeWeather(input, context);
  },
  route_driving(input, context) {
    return executeRoute("driving", input, context);
  },
  route_walking(input, context) {
    return executeRoute("walking", input, context);
  },
  route_bicycling(input, context) {
    return executeRoute("riding", input, context);
  },
  route_transit(input, context) {
    return executeRoute("transit", input, context);
  },
};

export async function validateBaiduMapsCredential(input: {
  apiKey: string;
  sk?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<CredentialValidationResult> {
  const query: Record<string, QueryValue> = {
    ak: input.apiKey,
    output: "json",
    coordtype: "bd09ll",
    location: "39.915,116.404",
  };
  const signed = applyBaiduMapsSn(baiduMapsValidationPath, query, input.sk);

  await baiduMapsGet(baiduMapsValidationPath, signed, input.fetcher, "validate", input.signal);

  return {
    profile: { accountId: "baidu_ak", displayName: "Baidu Maps AK" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: baiduMapsApiBaseUrl,
      validationEndpoint: baiduMapsValidationPath,
    },
  };
}

function applyBaiduMapsSn(
  path: string,
  query: Record<string, QueryValue>,
  sk: string | undefined,
): Record<string, QueryValue> {
  // Baidu's SN check is an AK-level toggle configured per key in the console
  // ("请求校验方式": IP whitelist OR SN), NOT a per-endpoint setting: once
  // enabled, EVERY request made with that AK needs a valid `sn`. A user only
  // configures an SK when their AK requires SN, so signing exactly when an `sk`
  // is present is correct — and avoids a fragile per-path allowlist where a
  // forgotten endpoint would silently send an unsigned request Baidu rejects.
  if (!sk) {
    return query;
  }
  // Some SN-enabled endpoints (verified live: /directionlite/v1/*) reject a
  // signed request that lacks a `timestamp` (Unix epoch seconds) with
  // "timestamp is required when sn isset"; including it is harmless for the
  // endpoints that don't require it (they hash it too). It MUST be part of the
  // signed query. Baidu's SN signs the FULL request query — including `ak` and
  // `timestamp` — in the exact order it is sent, then appends `sn` last; Baidu
  // re-parses the received URL (minus `sn`) and recomputes the digest, so the
  // signed string and the sent query must match byte-for-byte and in order.
  const signed: Record<string, QueryValue> = { ...query, timestamp: baiduTimestamp() };
  const sn = computeBaiduMapsSn(path, signed, sk);
  return { ...signed, sn };
}

// Baidu's SN anti-replay timestamp is Unix epoch SECONDS (a datetime string is
// rejected as "[timestamp] format is invalid").
function baiduTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

/**
 * Sign a proxy request URL in place when an SK is configured and the endpoint
 * requires SN validation. The action-handler path signs via {@link applyBaiduMapsSn};
 * the raw proxy path reuses the same rule so signed endpoints work identically
 * through either surface. Computes the SN over the current query (including the
 * `ak` the proxy auth already injected) and appends `sn` last.
 */
export function signBaiduMapsProxyUrl(url: URL, sk: string | undefined): void {
  if (!sk) {
    return;
  }
  const query: Record<string, QueryValue> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "sn") {
      continue;
    }
    query[key] = value;
  }
  // Include the same Unix-seconds timestamp in the signed query (required by
  // some SN endpoints, harmless for the rest), as the action-handler path does.
  const signed: Record<string, QueryValue> = { ...query, timestamp: baiduTimestamp() };
  const sn = computeBaiduMapsSn(url.pathname, signed, sk);
  // Re-serialize the whole query (with sn appended) using baiduQueryString so
  // the bytes sent by the proxy's fetch(url) match the RFC-1738 bytes the SN was
  // computed over. url.searchParams.set() would re-serialize with WHATWG rules,
  // which differ on some characters (e.g. `*` → literal vs `%2A`) and would
  // break SN validation. Assigning url.search preserves the pre-encoded bytes.
  url.search = `?${baiduQueryString({ ...signed, sn })}`;
}

/**
 * Compute the Baidu Maps SN signature over a request path and query.
 *
 * Exported for unit tests. The signing rule follows the Baidu LBS docs
 * (lbsyun.baidu.com appendix):
 *   sn = md5(urlencode(path + "?" + query_string_including_ak + sk))
 * where `urlencode` is the RFC-1738 (PHP `urlencode` / Python `quote_plus`)
 * form and the whole `path?query+sk` string is encoded once more before md5.
 */
export function computeBaiduMapsSnForTest(path: string, query: Record<string, QueryValue>, sk: string): string {
  return computeBaiduMapsSn(path, query, sk);
}

function computeBaiduMapsSn(path: string, query: Record<string, QueryValue>, sk: string): string {
  const rawSigningString = `${path}?${baiduQueryString(query)}${sk}`;
  return createHash("md5").update(baiduUrlEncode(rawSigningString), "utf8").digest("hex");
}

// Serialize a query the way Baidu's SN reference does (PHP `http_build_query`):
// insertion order, `undefined` values dropped, keys and values RFC-1738 encoded.
function baiduQueryString(query: Record<string, QueryValue>): string {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${baiduUrlEncode(key)}=${baiduUrlEncode(String(value))}`)
    .join("&");
}

// Equivalent of PHP `urlencode()` / Python `quote_plus()`: spaces become "+"
// and every character except the unreserved set [A-Za-z0-9-_.] is
// percent-encoded. Baidu's server applies this same encoding when validating.
function baiduUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

async function executeGeocode(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/geocoding/v3/",
    applyBaiduMapsSn(
      "/geocoding/v3/",
      compactObject({
        address: readRequiredString(input.address, "address"),
        city: readOptionalString(input.city),
        output: "json",
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  return compactObject({
    status: readOptionalInteger(payload.status),
    location: serializeLatLng(extractField(payload.result, "location")),
    precise: readOptionalInteger(extractField(payload.result, "precise")),
    confidence: readOptionalInteger(extractField(payload.result, "confidence")),
    comprehension: readOptionalInteger(extractField(payload.result, "comprehension")),
    result: readOptionalRecord(payload.result),
  });
}

async function executeReverseGeocode(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/reverse_geocoding/v3/",
    applyBaiduMapsSn(
      "/reverse_geocoding/v3/",
      compactObject({
        location: readRequiredString(input.location, "location"),
        coordtype: readOptionalString(input.coordtype),
        radius: readOptionalIntegerLike(input.radius),
        extensions_poi: readOptionalIntegerLike(input.extensionsPoi ?? input.extensions_poi),
        poi_types: readOptionalString(input.poiTypes ?? input.poi_types),
        language: readOptionalString(input.language),
        latest_admin: readOptionalIntegerLike(input.latestAdmin ?? input.latest_admin),
        output: "json",
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  const result = readOptionalRecord(payload.result);
  return compactObject({
    status: readOptionalInteger(payload.status),
    formatted_address: readOptionalString(extractField(result, "formatted_address")),
    addressComponent: readOptionalRecord(extractField(result, "addressComponent")),
    pois: readArrayLike(extractField(result, "pois")),
    roads: readArrayLike(extractField(result, "roads")),
    poiRegions: readArrayLike(extractField(result, "poiRegions")),
    sematic_description: readOptionalString(extractField(result, "sematic_description")),
    cityCode: readOptionalIntegerLike(extractField(result, "cityCode")),
  });
}

async function executeSearchPlaces(input: RuntimeInput, context: BaiduMapsActionContext) {
  return placeSearch(payloadFromSearch(input, "region", context));
}

async function executeSearchPlacesAround(input: RuntimeInput, context: BaiduMapsActionContext) {
  return placeSearch(payloadFromSearch(input, "around", context));
}

async function executeSearchPlacesPolygon(input: RuntimeInput, context: BaiduMapsActionContext) {
  return placeSearch(payloadFromSearch(input, "polygon", context));
}

function payloadFromSearch(
  input: RuntimeInput,
  variant: "region" | "around" | "polygon",
  context: BaiduMapsActionContext,
) {
  const query: Record<string, QueryValue> = compactObject({
    query: readRequiredString(input.query, "query"),
    region: variant === "region" ? readOptionalString(input.region) : undefined,
    location: variant === "around" ? readRequiredString(input.location, "location") : undefined,
    radius: variant === "around" ? readOptionalIntegerLike(input.radius) : undefined,
    radius_limit: readOptionalIntegerLike(input.radiusLimit ?? input.radius_limit),
    bounds: variant === "polygon" ? readRequiredString(input.bounds, "bounds") : undefined,
    city_limit: readOptionalIntegerLike(input.cityLimit ?? input.city_limit),
    output: "json",
    filter: readOptionalString(input.filter),
    // `scope` is declared as a string|int union in actions.ts because Baidu
    // accepts both forms. readOptionalString drops numbers, so use the
    // string-coercing variant to preserve either shape.
    scope: readOptionalStringLike(input.scope),
    coord_type: readOptionalString(input.coordType ?? input.coord_type),
    ret_coordtype: readOptionalString(input.retCoordtype ?? input.ret_coordtype),
    page_size: readOptionalIntegerLike(input.pageSize ?? input.page_size),
    page_num: readOptionalIntegerLike(input.pageNum ?? input.page_num),
    ak: context.apiKey,
  });
  const signed = applyBaiduMapsSn("/place/v2/search", query, context.sk);
  return { query: signed, fetcher: context.fetcher, signal: context.signal };
}

async function placeSearch({
  query,
  fetcher,
  signal,
}: {
  query: Record<string, QueryValue>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}) {
  const payload = await baiduMapsGet("/place/v2/search", query, fetcher, "execute", signal);
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    total: readOptionalIntegerLike(extractField(payload, "total")),
    results: readArrayLike(payload.results),
  });
}

async function executeGetPlaceDetail(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/place/v2/detail",
    applyBaiduMapsSn(
      "/place/v2/detail",
      compactObject({
        uid: readRequiredString(input.uid, "uid"),
        // Same string|int union as search_places.scope — see comment there.
        scope: readOptionalStringLike(input.scope),
        output: "json",
        coord_type: readOptionalString(input.coordType ?? input.coord_type),
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    result: readOptionalRecord(payload.result),
  });
}

async function executeInputTips(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/place/v2/suggestion",
    applyBaiduMapsSn(
      "/place/v2/suggestion",
      compactObject({
        query: readRequiredString(input.query, "query"),
        region: readOptionalString(input.region),
        city_limit: readOptionalIntegerLike(input.cityLimit ?? input.city_limit),
        location: readOptionalString(input.location),
        coord_type: readOptionalString(input.coordType ?? input.coord_type),
        output: "json",
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    // /place/v2/suggestion returns `result` as an array of suggestion objects.
    result: readArrayLike(payload.result),
  });
}

async function executeIpLocate(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/location/ip",
    applyBaiduMapsSn(
      "/location/ip",
      compactObject({
        ip: readOptionalString(input.ip),
        coor: readOptionalString(input.coor),
        output: "json",
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  const content = readOptionalRecord(payload.content);
  const addressDetail = readOptionalRecord(extractField(content, "address_detail"));
  const point = readOptionalRecord(extractField(content, "point"));
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    address: readOptionalString(payload.address),
    content: compactObject({
      address: readOptionalString(extractField(content, "address")),
      point: compactObject({
        x: readOptionalNumber(point?.x),
        y: readOptionalNumber(point?.y),
      }),
      address_detail: compactObject({
        city: readOptionalString(extractField(addressDetail, "city")),
        city_code: readOptionalIntegerLike(extractField(addressDetail, "city_code")),
        province: readOptionalString(extractField(addressDetail, "province")),
      }),
    }),
  });
}

async function executeDistrictSearch(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/api_region_search/v1/",
    applyBaiduMapsSn(
      "/api_region_search/v1/",
      compactObject({
        keyword: readRequiredString(input.keyword, "keyword"),
        sub_admin: readOptionalIntegerLike(input.subAdmin ?? input.sub_admin),
        extensions_code: readOptionalIntegerLike(input.extensionsCode ?? input.extensions_code),
        boundary: readOptionalIntegerLike(input.boundary),
        output: "json",
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    result_size: readOptionalInteger(payload.result_size),
    // /api_region_search/v1/ returns the administrative divisions under a
    // top-level `districts` array (not `result`).
    districts: readArrayLike(payload.districts ?? payload.result),
  });
}

async function executeWeather(input: RuntimeInput, context: BaiduMapsActionContext) {
  const districtId = readOptionalString(input.districtId ?? input.district_id);
  const locationInput = readOptionalString(input.location);
  if (!districtId && !locationInput) {
    throw new ProviderRequestError(400, "either location or district_id is required");
  }
  const payload = await baiduMapsGet(
    "/weather/v1/",
    applyBaiduMapsSn(
      "/weather/v1/",
      compactObject({
        // Baidu weather expects `location` as longitude,latitude (opposite of
        // other endpoints) OR a `district_id` (adcode). The coordinate-system
        // param is `coordtype` (one word), not `coord_type`.
        district_id: districtId,
        location: locationInput,
        data_type: readOptionalString(input.dataType ?? input.data_type),
        coordtype: readOptionalString(input.coordtype ?? input.coordType ?? input.coord_type),
        output: "json",
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  const result = readOptionalRecord(payload.result);
  // Baidu returns the resolved place under `location`; accept `address` too
  // since some doc revisions name it that way.
  const location = readOptionalRecord(extractField(result, "location") ?? extractField(result, "address"));
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    result: compactObject({
      location: compactObject({
        country: readOptionalString(extractField(location, "country")),
        province: readOptionalString(extractField(location, "province")),
        city: readOptionalString(extractField(location, "city")),
        name: readOptionalString(extractField(location, "name")),
        id: readOptionalStringLike(extractField(location, "id")),
      }),
      // Baidu weather v1 returns these as arrays. Note the response key is
      // `alerts` (plural) even though the request `data_type` token is `alert`
      // (singular) — same doc-table-vs-response mismatch as location/address,
      // confirmed against Baidu's own MCP server source. Read `alert` as a
      // defensive fallback. A missing section stays undefined so compactObject
      // drops it.
      now: readOptionalRecord(extractField(result, "now")),
      forecasts: readOptionalArray(extractField(result, "forecasts")),
      forecast_hours: readOptionalArray(extractField(result, "forecast_hours")),
      alerts: readOptionalArray(extractField(result, "alerts") ?? extractField(result, "alert")),
      indexes: readOptionalArray(extractField(result, "indexes")),
    }),
  });
}

async function executeRoute(
  mode: "driving" | "walking" | "riding" | "transit",
  input: RuntimeInput,
  context: BaiduMapsActionContext,
) {
  const path = `/directionlite/v1/${mode}`;
  const payload = await baiduMapsGet(
    path,
    applyBaiduMapsSn(
      path,
      compactObject({
        origin: readRequiredString(input.origin, "origin"),
        destination: readRequiredString(input.destination, "destination"),
        origin_uid: readOptionalString(input.originUid ?? input.origin_uid),
        destination_uid: readOptionalString(input.destinationUid ?? input.destination_uid),
        waypoints: readOptionalString(input.waypoints),
        tactics: readOptionalIntegerLike(input.tactics),
        tactics_in_city: readOptionalIntegerLike(input.tacticsInCity ?? input.tactics_in_city),
        tactics_inter_city: readOptionalIntegerLike(input.tacticsInterCity ?? input.tactics_inter_city),
        alternatives: readOptionalIntegerLike(input.alternatives),
        departure_time: readOptionalString(input.departureTime ?? input.departure_time),
        plate_number: readOptionalString(input.plateNumber ?? input.plate_number),
        traffic_policy: readOptionalIntegerLike(input.trafficPolicy ?? input.traffic_policy),
        coord_type: readOptionalString(input.coordType ?? input.coord_type),
        output: "json",
        ak: context.apiKey,
      }),
      context.sk,
    ),
    context.fetcher,
    "execute",
    context.signal,
  );
  const result = readOptionalRecord(payload.result);
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    result: compactObject({
      // directionlite returns origin/destination as { lng, lat } objects and a
      // routes array; there are no origin_poi/destination_poi fields here.
      origin: readOptionalRecord(extractField(result, "origin")),
      destination: readOptionalRecord(extractField(result, "destination")),
      routes: readArrayLike(extractField(result, "routes")),
    }),
  });
}

async function baiduMapsGet<T extends BaiduMapsResponsePayload>(
  path: string,
  query: Record<string, QueryValue>,
  fetcher: typeof fetch,
  phase: BaiduMapsRequestPhase,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const url = buildBaiduMapsUrl(path, query);
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readBaiduMapsJson<T>(response);
    if (!response.ok || readStatusCode(payload.status) !== 0) {
      throw normalizeBaiduMapsError(response, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    // Surface caller-initiated cancellation as-is rather than a generic 502.
    // AbortController rejects with a DOMException whose name is "AbortError";
    // don't rely on `instanceof Error` since DOMException isn't one everywhere.
    if (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError") {
      throw error;
    }
    throw new ProviderRequestError(502, readUnexpectedMessage(error));
  }
}

function buildBaiduMapsUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(path, baiduMapsApiBaseUrl);
  // Serialize the query with the SAME RFC-1738 encoder used to compute the SN
  // (baiduQueryString), in insertion order. This guarantees the bytes Baidu
  // receives are identical to the bytes that were signed — URLSearchParams
  // encodes a few characters differently (e.g. `*` → literal vs `%2A`), which
  // would break SN validation for those values.
  const queryString = baiduQueryString(query);
  return queryString ? `${url.origin}${url.pathname}?${queryString}` : url.toString();
}

async function readBaiduMapsJson<T extends BaiduMapsResponsePayload>(response: Response): Promise<T> {
  // Bounded read (413 on overflow), matching the rest of the framework, and
  // parse regardless of content-type: Baidu sometimes returns JSON bodies with
  // a non-JSON content-type, and its own reference client parses them anyway.
  const text = await readProviderTextBody(response, "Baidu Maps response");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderRequestError(502, `Baidu Maps returned a non-JSON response: ${text.slice(0, 200)}`);
  }
}

function normalizeBaiduMapsError(
  response: Response,
  payload: BaiduMapsResponsePayload,
  phase: BaiduMapsRequestPhase,
): ProviderRequestError {
  const status = readStatusCode(payload.status);
  const message = readOptionalString(payload.message) ?? `Baidu Maps request failed with ${status ?? response.status}`;
  if (status !== undefined) {
    if (baiduMapsRateLimitStatuses.has(status) || response.status === 429) {
      return new ProviderRequestError(429, message);
    }
    if (baiduMapsInputStatuses.has(status)) {
      return new ProviderRequestError(400, message);
    }
    if (baiduMapsAuthStatuses.has(status)) {
      return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
    }
    // A non-zero Baidu status we don't specifically classify. Baidu returns
    // HTTP 200 even for errors, so `response.status` is 200 here and would be
    // misclassified as a client error; surface an explicit upstream failure.
    return new ProviderRequestError(502, message);
  }
  // No numeric Baidu status: fall back to the HTTP status when it is itself an
  // error, otherwise treat the unexpected body as an upstream failure.
  return new ProviderRequestError(response.status >= 400 ? response.status : 502, message);
}

function readStatusCode(value: unknown): number | undefined {
  return readOptionalInteger(value);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function readOptionalString(value: unknown): string | undefined {
  return optionalString(value);
}

function readOptionalStringLike(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return undefined;
}

function readOptionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readOptionalIntegerLike(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return readOptionalInteger(value);
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readArrayLike(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [];
}

// Like readArrayLike but returns undefined (instead of []) for a missing field,
// so an absent optional section is dropped by compactObject rather than
// surfacing as an empty array.
function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function extractField(parent: unknown, field: string): unknown {
  const record = readOptionalRecord(parent);
  return record ? record[field] : undefined;
}

function serializeLatLng(value: unknown): string | undefined {
  // Baidu Maps returns coordinates as either a "lat,lng" string or a
  // { lat, lng } object. Normalize to "lat,lng" for downstream consumers.
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  const record = readOptionalRecord(value);
  if (!record) {
    return undefined;
  }
  const lat = readOptionalNumber(record.lat ?? record.y);
  const lng = readOptionalNumber(record.lng ?? record.x);
  if (lat === undefined || lng === undefined) {
    return undefined;
  }
  return `${lat},${lng}`;
}

function readUnexpectedMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Baidu Maps request failed: ${error.message}`;
  }
  return "Baidu Maps request failed";
}
