import type { CredentialValidationResult } from "../../core/types.ts";
import type { BaiduMapsActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalString } from "../../core/cast.ts";
import { setSearchParams, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

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
  data_version?: unknown;
  [key: string]: unknown;
}

// Errors mapped from Baidu Maps `status` field to ProviderRequestError codes.
// Reference: https://lbsyun.baidu.com/faq/api (error code table)
const baiduMapsAuthStatuses = new Set([
  1, 2, 101, 102, 200, 201, 240, 250, 251, 260, 401, 402, 403, 404, 500, 501, 2000,
]);
const baiduMapsRateLimitStatuses = new Set([302, 401, 502, 503]);
const baiduMapsInputStatuses = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 21, 22, 23, 24, 25, 26, 27, 28, 29]);

// Paths that require SN validation when an SK is configured for the application.
const baiduMapsSignedPaths = new Set<string>([
  "/place/v2/search",
  "/place/v2/detail",
  "/place/v2/suggestion",
  "/api_region/v1/",
  "/api_distance/v2/matrixlite",
  "/api_distance/v2/distance",
  "/directionlite/v1/driving",
  "/directionlite/v1/walking",
  "/directionlite/v1/riding",
  "/directionlite/v1/transit",
  "/directionlite/v1/transit_integral",
  "/weather/v1/",
  "/location/ip",
  "/geocoding/v3/",
  "/reverse_geocoding/v3/",
  "/coordconvert/v2/",
]);

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
  distance_matrix(input, context) {
    return executeDistanceMatrix(input, context);
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
  if (!sk) {
    return query;
  }
  if (!baiduMapsSignedPaths.has(path)) {
    return query;
  }
  const sn = computeBaiduMapsSn(path, query, sk);
  const timestamp = formatBaiduTimestamp(new Date());
  return {
    ...query,
    sn,
    timestamp,
  };
}

/**
 * Compute the Baidu Maps SN signature over a request path and query.
 *
 * Exported for unit tests. The signing rule follows the Baidu LBS docs:
 *   md5(url_path + "?" + urlencode(sorted_query_without_ak_sn_ts) + sk)
 */
export function computeBaiduMapsSnForTest(path: string, query: Record<string, QueryValue>, sk: string): string {
  return computeBaiduMapsSn(path, query, sk);
}

function computeBaiduMapsSn(path: string, query: Record<string, QueryValue>, sk: string): string {
  const signingBase: Record<string, QueryValue> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === "ak" || key === "sn" || key === "timestamp" || value === undefined) {
      continue;
    }
    signingBase[key] = value;
  }
  const sortedKeys = Object.keys(signingBase).sort();
  const search = new URLSearchParams();
  for (const key of sortedKeys) {
    search.append(key, String(signingBase[key]));
  }
  const signingString = `${path}?${search.toString()}${sk}`;
  return createHash("md5").update(signingString, "utf8").digest("hex");
}

function formatBaiduTimestamp(date: Date): string {
  // Baidu Maps expects YYYY-MM-DD hh:mm:ss in UTC+8.
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")} ${lookup("hour")}:${lookup("minute")}:${lookup("second")}`;
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
    location: readOptionalStringLike(extractField(payload.result, "location")),
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
    scope: readOptionalString(input.scope),
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
        scope: readOptionalString(input.scope),
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
    result: readOptionalRecord(payload.result),
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
  const result = readOptionalRecord(payload.result);
  const addressDetail = readOptionalRecord(extractField(result, "address_detail"));
  const point = readOptionalRecord(extractField(result, "point"));
  return compactObject({
    status: readOptionalInteger(payload.status),
    message: readOptionalString(payload.message),
    address: readOptionalString(extractField(result, "address")),
    content: compactObject({
      address: readOptionalString(extractField(result, "address")),
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
  const path = districtPath(readRequiredString(input.mode, "mode"));
  const payload = await baiduMapsGet(
    path,
    applyBaiduMapsSn(
      path,
      compactObject({
        keyword: readOptionalString(input.keyword),
        id: readOptionalString(input.id),
        struct_type: readOptionalIntegerLike(input.structType ?? input.struct_type),
        get_polygon: readOptionalIntegerLike(input.getPolygon ?? input.get_polygon),
        max_offset: readOptionalIntegerLike(input.maxOffset ?? input.max_offset),
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
    data_version: readOptionalStringLike(payload.data_version),
    result: readOptionalRecord(payload.result) ?? readArrayLike(payload.result),
  });
}

async function executeWeather(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/weather/v1/",
    applyBaiduMapsSn(
      "/weather/v1/",
      compactObject({
        data_type: readOptionalString(input.dataType ?? input.data_type),
        coord_type: readOptionalString(input.coordType ?? input.coord_type),
        location: readRequiredString(input.location, "location"),
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
  const location = readOptionalRecord(extractField(result, "location"));
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
      now: readOptionalRecord(extractField(result, "now")),
      forecast: readOptionalRecord(extractField(result, "forecast")),
      forecast_hours: readOptionalRecord(extractField(result, "forecast_hours")),
      alerts: readOptionalRecord(extractField(result, "alerts")),
      indices: readOptionalRecord(extractField(result, "indices")),
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
      origin: readOptionalRecord(extractField(result, "origin")),
      destination: readOptionalRecord(extractField(result, "destination")),
      routes: readArrayLike(extractField(result, "routes")),
      origin_poi: readOptionalRecord(extractField(result, "origin_poi")),
      destination_poi: readOptionalRecord(extractField(result, "destination_poi")),
    }),
  });
}

async function executeDistanceMatrix(input: RuntimeInput, context: BaiduMapsActionContext) {
  const payload = await baiduMapsGet(
    "/api_distance/v2/matrixlite",
    applyBaiduMapsSn(
      "/api_distance/v2/matrixlite",
      compactObject({
        origins: readRequiredString(input.origins, "origins"),
        destinations: readRequiredString(input.destinations, "destinations"),
        tactics: readOptionalIntegerLike(input.tactics),
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
      elements: readArrayLike(extractField(result, "elements")),
    }),
  });
}

function districtPath(mode: string): string {
  switch (mode) {
    case "list":
      return "/api_region/v1/";
    case "children":
      return "/api_region/v1/getchildren";
    case "search":
      return "/api_region/v1/search";
    default:
      throw new ProviderRequestError(400, `unsupported district mode: ${mode}`);
  }
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
    throw new ProviderRequestError(502, readUnexpectedMessage(error));
  }
}

function buildBaiduMapsUrl(path: string, query: Record<string, QueryValue>): string {
  const url = new URL(path, baiduMapsApiBaseUrl);
  setSearchParams(url, stringifyQuery(query));
  return url.toString();
}

function stringifyQuery(query: Record<string, QueryValue>): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      output[key] = undefined;
    } else {
      output[key] = String(value);
    }
  }
  return output;
}

async function readBaiduMapsJson<T extends BaiduMapsResponsePayload>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    const text = await response.text().catch(() => "");
    throw new ProviderRequestError(502, `Baidu Maps returned a non-JSON response: ${text.slice(0, 200)}`);
  }
  return (await response.json()) as T;
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
      if (phase === "validate") {
        return new ProviderRequestError(400, message);
      }
      return new ProviderRequestError(401, message);
    }
  }
  return new ProviderRequestError(response.status || 502, message);
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

function extractField(parent: unknown, field: string): unknown {
  const record = readOptionalRecord(parent);
  return record ? record[field] : undefined;
}

function readUnexpectedMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Baidu Maps request failed: ${error.message}`;
  }
  return "Baidu Maps request failed";
}
