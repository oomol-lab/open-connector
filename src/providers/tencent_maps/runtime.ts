import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const tencentMapsApiBaseUrl = "https://apis.map.qq.com";
const tencentMapsValidationPath = "/ws/district/v1/list";

const tencentMapsAuthStatuses = new Set([110, 111, 112, 113, 190, 199]);
const tencentMapsRateLimitStatuses = new Set([120, 121]);
const tencentMapsInputStatuses = new Set([300, 301, 306, 310, 311, 320, 330]);

type RuntimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

type QueryValue = string | number | undefined;
type TencentMapsRequestPhase = "validate" | "execute";

type TencentMapsResponsePayload = Record<string, unknown> & {
  status?: unknown;
  message?: unknown;
  request_id?: unknown;
  result?: unknown;
  count?: unknown;
  data?: unknown;
  cluster?: unknown;
  data_version?: unknown;
};

type TencentMapsActionHandler = (input: Record<string, unknown>, runtime: RuntimeContext) => Promise<unknown>;

export const tencentMapsActionHandlers: ProviderActionHandlers<"tencent_maps", TencentMapsActionHandler> = {
  geocode(input, runtime) {
    return executeGeocode(input, runtime);
  },
  reverse_geocode(input, runtime) {
    return executeReverseGeocode(input, runtime);
  },
  search_places(input, runtime) {
    return executeSearchPlaces(input, runtime);
  },
  search_places_around(input, runtime) {
    return executeSearchPlacesAround(input, runtime);
  },
  search_places_polygon(input, runtime) {
    return executeSearchPlacesPolygon(input, runtime);
  },
  get_place_detail(input, runtime) {
    return executeGetPlaceDetail(input, runtime);
  },
  input_tips(input, runtime) {
    return executeInputTips(input, runtime);
  },
  ip_locate(input, runtime) {
    return executeIpLocate(input, runtime);
  },
  district_search(input, runtime) {
    return executeDistrictSearch(input, runtime);
  },
  weather(input, runtime) {
    return executeWeather(input, runtime);
  },
  route_driving(input, runtime) {
    return executeRouteDriving(input, runtime);
  },
  route_walking(input, runtime) {
    return executeRouteWalking(input, runtime);
  },
  route_bicycling(input, runtime) {
    return executeRouteBicycling(input, runtime);
  },
  route_transit(input, runtime) {
    return executeRouteTransit(input, runtime);
  },
  distance_matrix(input, runtime) {
    return executeDistanceMatrix(input, runtime);
  },
};

export async function validateTencentMapsCredential(context: RuntimeContext): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await tencentMapsGet(tencentMapsValidationPath, { key: context.apiKey }, context.fetcher, "validate", context.signal);

  return {
    profile: { accountId: "api_key", displayName: "Tencent Maps API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: tencentMapsApiBaseUrl,
      validationEndpoint: tencentMapsValidationPath,
    },
  };
}

export { tencentMapsApiBaseUrl };

async function executeGeocode(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/geocoder/v1",
    compactObject({
      address: readRequiredString(input.address, "address"),
      policy: readOptionalInteger(input.policy),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  const result = readObject(payload.result);
  const addressComponents = readObject(result?.address_components);
  const adInfo = readObject(result?.ad_info);

  return {
    geocodes: result
      ? [
          {
            title: readOptionalString(result.title),
            location: serializeLocation(result.location),
            province: readOptionalString(addressComponents?.province),
            city: readOptionalString(addressComponents?.city),
            district: readOptionalString(addressComponents?.district),
            street: readOptionalString(addressComponents?.street),
            streetNumber: readOptionalString(addressComponents?.street_number),
            adcode: readOptionalStringLike(adInfo?.adcode),
            adLevel: readOptionalInteger(result.level),
          },
        ]
      : [],
  };
}

async function executeReverseGeocode(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/geocoder/v1",
    compactObject({
      location: readRequiredString(input.location, "location"),
      radius: readOptionalInteger(input.radius),
      get_poi: readOptionalFlag(input.getPoi),
      poi_options: readOptionalString(input.poiOptions),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  const result = readObject(payload.result);

  return {
    formattedAddress: readOptionalString(result?.address),
    formattedAddresses: readObject(result?.formatted_addresses) ?? undefined,
    addressComponent: readObject(result?.address_component) ?? undefined,
    adInfo: readObject(result?.ad_info) ?? undefined,
    pois: readObjectArrayLike(result?.pois).map(buildPoi),
  };
}

async function executeSearchPlaces(input: Record<string, unknown>, runtime: RuntimeContext) {
  const region = readRequiredString(input.region, "region");
  const autoExtend = readOptionalInteger(input.autoExtend);
  const locationBias = readOptionalString(input.locationBias);

  const payload = await tencentMapsGet(
    "/ws/place/v1/search",
    compactObject({
      keyword: readRequiredString(input.keywords, "keywords"),
      boundary: buildRegionBoundary(region, autoExtend, locationBias),
      get_subpois: readOptionalFlag(input.getSubPois),
      filter: readOptionalString(input.filter),
      added_fields: readOptionalString(input.addedFields),
      page_index: readOptionalInteger(input.pageIndex),
      page_size: readOptionalInteger(input.pageSize),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return buildPoiSearchOutput(payload);
}

async function executeSearchPlacesAround(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/place/v1/search",
    compactObject({
      keyword: readRequiredString(input.keywords, "keywords"),
      boundary: buildNearbyBoundary(
        readRequiredString(input.location, "location"),
        readOptionalInteger(input.radius) ?? 1000,
        readOptionalBoolean(input.autoExtend),
      ),
      get_subpois: readOptionalFlag(input.getSubPois),
      filter: readOptionalString(input.filter),
      added_fields: readOptionalString(input.addedFields),
      orderby: readOptionalString(input.orderBy),
      page_index: readOptionalInteger(input.pageIndex),
      page_size: readOptionalInteger(input.pageSize),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return buildPoiSearchOutput(payload);
}

async function executeSearchPlacesPolygon(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/place/v1/search_by_polygon",
    compactObject({
      polygon: readRequiredString(input.polygon, "polygon"),
      keyword: readRequiredString(input.keywords, "keywords"),
      filter: readOptionalString(input.filter),
      added_fields: readOptionalString(input.addedFields),
      page_index: readOptionalInteger(input.pageIndex),
      page_size: readOptionalInteger(input.pageSize),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return buildPoiSearchOutput(payload);
}

async function executeGetPlaceDetail(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/place/v1/detail",
    compactObject({
      id: readRequiredString(input.id, "id"),
      get_subpois: readOptionalFlag(input.getSubPois),
      added_fields: readOptionalString(input.addedFields),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  const result = readObject(payload.result);
  return {
    pois: result ? [buildPoi(result)] : [],
  };
}

async function executeInputTips(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/place/v1/suggestion",
    compactObject({
      keyword: readRequiredString(input.keywords, "keywords"),
      region: readOptionalString(input.region),
      region_fix: readOptionalFlag(input.regionFix),
      location: readOptionalString(input.location),
      get_subpois: readOptionalFlag(input.getSubPois),
      get_ad: readOptionalFlag(input.getAd),
      policy: readOptionalInteger(input.policy),
      filter: readOptionalString(input.filter),
      added_fields: readOptionalString(input.addedFields),
      address_format: readOptionalString(input.addressFormat),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return {
    count: readOptionalInteger(payload.count),
    tips: readObjectArrayLike(payload.data).map(buildPoi),
  };
}

async function executeIpLocate(input: Record<string, unknown>, runtime: RuntimeContext) {
  const ip = readOptionalString(input.ip) ?? undefined;
  const payload = await tencentMapsGet(
    "/ws/location/v1/ip",
    compactObject({
      ip,
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  const result = readObject(payload.result);
  return {
    ip: readOptionalString(result?.ip),
    location: serializeLocation(result?.location),
    adInfo: readObject(result?.ad_info) ?? undefined,
  };
}

async function executeDistrictSearch(input: Record<string, unknown>, runtime: RuntimeContext) {
  const mode = readRequiredString(input.mode, "mode");
  const path = buildDistrictPath(mode);
  const payload = await tencentMapsGet(
    path,
    compactObject({
      struct_type: readOptionalInteger(input.structType),
      id: readOptionalStringLike(input.id),
      keyword: readOptionalStringLike(input.keyword),
      get_polygon: readOptionalInteger(input.getPolygon),
      max_offset: readOptionalInteger(input.maxOffset),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return {
    dataVersion: readOptionalInteger(payload.data_version),
    result: Array.isArray(payload.result) ? payload.result : [],
  };
}

async function executeWeather(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/weather/v1",
    compactObject({
      adcode: readOptionalString(input.adcode),
      location: readOptionalString(input.location),
      type: readOptionalString(input.type),
      get_md: readOptionalFlag(input.getMd),
      added_fields: readOptionalString(input.addedFields),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  const result = readObject(payload.result);
  return {
    realtime: readObjectArrayLike(result?.realtime),
    forecast: readObjectArrayLike(result?.forecast),
    forecastHours: readObjectArrayLike(result?.forecast_hours),
  };
}

async function executeRouteDriving(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/direction/v1/driving",
    compactObject({
      from: readRequiredString(input.from, "from"),
      from_poi: readOptionalString(input.fromPoi),
      to: readRequiredString(input.to, "to"),
      to_poi: readOptionalString(input.toPoi),
      to_poiname: readOptionalString(input.toPoiName),
      waypoints: readOptionalString(input.waypoints),
      waypoint_order: readOptionalFlag(input.waypointOrder),
      with_dest: readOptionalFlag(input.withDest),
      departure_time: readOptionalInteger(input.departureTime),
      plate_number: readOptionalString(input.plateNumber),
      cartype: readOptionalInteger(input.carType),
      policy: readOptionalString(input.policy),
      avoid_polygons: readOptionalString(input.avoidPolygons),
      get_mp: readOptionalFlag(input.getMultipleRoutes),
      get_speed: readOptionalFlag(input.getSpeed),
      added_fields: readOptionalString(input.addedFields),
      no_step: readOptionalFlag(input.noStep),
      service_level: readOptionalInteger(input.serviceLevel),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return buildRouteOutput(payload);
}

async function executeRouteWalking(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/direction/v1/walking",
    compactObject({
      from: readRequiredString(input.from, "from"),
      to: readRequiredString(input.to, "to"),
      to_poi: readOptionalString(input.toPoi),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return buildRouteOutput(payload);
}

async function executeRouteBicycling(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/direction/v1/bicycling",
    compactObject({
      from: readRequiredString(input.from, "from"),
      to: readRequiredString(input.to, "to"),
      to_poi: readOptionalString(input.toPoi),
      added_fields: readOptionalString(input.addedFields),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return buildRouteOutput(payload);
}

async function executeRouteTransit(input: Record<string, unknown>, runtime: RuntimeContext) {
  const payload = await tencentMapsGet(
    "/ws/direction/v1/transit",
    compactObject({
      from: readRequiredString(input.from, "from"),
      from_poi: readOptionalString(input.fromPoi),
      to: readRequiredString(input.to, "to"),
      to_poi: readOptionalString(input.toPoi),
      departure_time: readOptionalInteger(input.departureTime),
      policy: readOptionalString(input.policy),
      added_fields: readOptionalString(input.addedFields),
      key: runtime.apiKey,
    }),
    runtime.fetcher,
  );

  return buildRouteOutput(payload);
}

async function executeDistanceMatrix(input: Record<string, unknown>, runtime: RuntimeContext) {
  const mode = readRequiredString(input.mode, "mode");
  const from = readRequiredString(input.from, "from");
  const to = readRequiredString(input.to, "to");

  assertDistanceMatrixCoordinateLimits(from, to);

  const payload = await tencentMapsPost(
    "/ws/distance/v1/matrix",
    { mode },
    compactObject({
      key: runtime.apiKey,
      from,
      to,
    }),
    runtime.fetcher,
  );

  const result = readObject(payload.result);
  return {
    rows: readObjectArrayLike(result?.rows).map((row) => ({
      elements: readObjectArrayLike(readObject(row)?.elements).map((element) => {
        const elementObject = readObject(element);
        return compactObject({
          distance: readRequiredNumber(elementObject?.distance, "distance"),
          duration: readOptionalNumber(elementObject?.duration),
          status: readOptionalInteger(elementObject?.status),
        });
      }),
    })),
  };
}

async function tencentMapsPost<T extends TencentMapsResponsePayload>(
  path: string,
  query: Record<string, QueryValue>,
  body: Record<string, QueryValue>,
  fetcher: typeof fetch,
  phase: TencentMapsRequestPhase = "execute",
  signal?: AbortSignal,
) {
  try {
    const response = await fetcher(buildTencentMapsUrl(path, query), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal,
    });
    const payload = await readTencentMapsJson<T>(response);
    if (!response.ok || readStatusCode(payload.status) !== 0) {
      throw normalizeTencentMapsError(response, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, readUnexpectedMessage(error));
  }
}

function assertDistanceMatrixCoordinateLimits(from: string, to: string) {
  const fromCount = countCoordinateGroups(from);
  const toCount = countCoordinateGroups(to);

  if (fromCount <= 1 || toCount <= 1) {
    if (Math.max(fromCount, toCount) > 200) {
      throw new ProviderRequestError(
        400,
        "distance_matrix supports at most 200 coordinates for one-to-many or many-to-one requests",
      );
    }
    return;
  }

  if (fromCount > 50 || toCount > 50 || fromCount * toCount > 625) {
    throw new ProviderRequestError(
      400,
      "distance_matrix supports at most 625 origin-destination pairs and 50 coordinates per side for many-to-many requests",
    );
  }
}

function countCoordinateGroups(value: string) {
  return value.split(";").filter((item) => item.length > 0).length;
}

function readRequiredNumber(value: unknown, fieldName: string) {
  const resolvedValue = readOptionalNumber(value);
  if (resolvedValue === undefined) {
    throw new ProviderRequestError(502, `Tencent Maps response missing ${fieldName}`);
  }
  return resolvedValue;
}

async function tencentMapsGet<T extends TencentMapsResponsePayload>(
  path: string,
  query: Record<string, QueryValue>,
  fetcher: typeof fetch,
  phase: TencentMapsRequestPhase = "execute",
  signal?: AbortSignal,
) {
  try {
    const response = await fetcher(buildTencentMapsUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readTencentMapsJson<T>(response);
    if (!response.ok || readStatusCode(payload.status) !== 0) {
      throw normalizeTencentMapsError(response, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, readUnexpectedMessage(error));
  }
}

function buildTencentMapsUrl(path: string, query: Record<string, QueryValue>) {
  const url = new URL(path, tencentMapsApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readTencentMapsJson<T extends TencentMapsResponsePayload>(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ProviderRequestError(502, "Tencent Maps returned a non-JSON response");
  }
  return (await response.json()) as T;
}

function normalizeTencentMapsError(
  response: Response,
  payload: TencentMapsResponsePayload,
  phase: TencentMapsRequestPhase,
) {
  const status = readStatusCode(payload.status);
  const message = readOptionalString(payload.message) ?? `Tencent Maps request failed with ${status}`;

  if (status !== undefined) {
    if (tencentMapsRateLimitStatuses.has(status) || response.status === 429) {
      return new ProviderRequestError(429, message);
    }
    if (tencentMapsInputStatuses.has(status)) {
      return new ProviderRequestError(400, message);
    }
    if (tencentMapsAuthStatuses.has(status)) {
      if (phase === "validate") {
        return new ProviderRequestError(400, message);
      }
      return new ProviderRequestError(401, message);
    }
  }

  return new ProviderRequestError(response.status || 502, message);
}

function buildRegionBoundary(region: string, autoExtend?: number, locationBias?: string) {
  if (!locationBias && autoExtend === undefined) {
    return `region(${region})`;
  }
  if (!locationBias) {
    return `region(${region},${autoExtend})`;
  }
  return `region(${region},${autoExtend ?? 1},${locationBias})`;
}

function buildNearbyBoundary(location: string, radius: number, autoExtend?: boolean) {
  if (autoExtend === undefined) {
    return `nearby(${location},${radius})`;
  }
  return `nearby(${location},${radius},${autoExtend ? 1 : 0})`;
}

function buildDistrictPath(mode: string) {
  switch (mode) {
    case "list":
      return "/ws/district/v1/list";
    case "children":
      return "/ws/district/v1/getchildren";
    case "search":
      return "/ws/district/v1/search";
    default:
      throw new ProviderRequestError(400, `unsupported district search mode: ${mode}`);
  }
}

function buildPoiSearchOutput(payload: TencentMapsResponsePayload) {
  return compactObject({
    count: readOptionalInteger(payload.count),
    pois: readObjectArrayLike(payload.data).map(buildPoi),
    clusters: readObjectArrayLike(payload.cluster),
  });
}

function buildPoi(value: unknown) {
  const item = readObject(value);
  const adInfo = readObject(item?.ad_info);
  return compactObject({
    id: readOptionalString(item?.id),
    name: readOptionalString(item?.title),
    address: readOptionalString(item?.address),
    category: readOptionalString(item?.category),
    categoryCode: readOptionalInteger(item?.category_code),
    type: readOptionalInteger(item?.type),
    adcode: readOptionalStringLike(adInfo?.adcode),
    location: serializeLocation(item?.location),
    distance: readOptionalNumber(item?._distance),
    province: readOptionalString(adInfo?.province),
    city: readOptionalString(adInfo?.city),
    district: readOptionalString(adInfo?.district),
  });
}

function buildRouteOutput(payload: TencentMapsResponsePayload) {
  const result = readObject(payload.result);
  return compactObject({
    requestId: readOptionalString(payload.request_id),
    routes: readObjectArrayLike(result?.routes).map((route) => {
      const routeObject = readObject(route);
      return compactObject({
        mode: readOptionalString(routeObject?.mode),
        distance: readOptionalNumber(routeObject?.distance),
        duration: readOptionalNumber(routeObject?.duration),
        direction: readOptionalString(routeObject?.direction),
        trafficLightCount: readOptionalInteger(routeObject?.traffic_light_count),
        toll: readOptionalNumber(routeObject?.toll),
        bounds: readOptionalString(routeObject?.bounds),
        tags: readStringArray(routeObject?.tags),
        restriction: readObject(routeObject?.restriction) ?? undefined,
        polyline: readNumberArray(routeObject?.polyline),
        steps: readObjectArrayLike(routeObject?.steps),
      });
    }),
  });
}

function readStatusCode(value: unknown) {
  return readOptionalInteger(value);
}

function serializeLocation(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  const objectValue = readObject(value);
  if (!objectValue) {
    return undefined;
  }
  const lat = readOptionalStringLike(objectValue.lat);
  const lng = readOptionalStringLike(objectValue.lng);
  if (!lat || !lng) {
    return undefined;
  }
  return `${lat},${lng}`;
}

function readObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function readObjectArrayLike(value: unknown) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === "object");
  }
  if (typeof value === "object") {
    return [value];
  }
  return [];
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => readOptionalNumber(item)).filter((item): item is number => item !== undefined);
}

function readRequiredString(value: unknown, fieldName: string) {
  const resolvedValue = readOptionalString(value);
  if (!resolvedValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolvedValue;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOptionalStringLike(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readOptionalInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsedValue = Number(value);
    if (Number.isInteger(parsedValue)) {
      return parsedValue;
    }
  }
  return undefined;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }
  return undefined;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalFlag(value: unknown) {
  const booleanValue = readOptionalBoolean(value);
  if (booleanValue === undefined) {
    return undefined;
  }
  return booleanValue ? 1 : 0;
}

function readUnexpectedMessage(error: unknown) {
  if (error instanceof Error) {
    return `Tencent Maps request failed: ${error.message}`;
  }
  return "Tencent Maps request failed";
}
