import type { CredentialValidationResult } from "../../core/types.ts";

import { requiredString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const amapApiBaseUrl = "https://restapi.amap.com";
const amapAuthErrorInfos = new Set([
  "INVALID_USER_KEY",
  "SERVICE_NOT_AVAILABLE",
  "USERKEY_PLAT_NOMATCH",
  "INVALID_USER_DOMAIN",
  "INVALID_USER_IP",
  "INVALID_USER_SIGNATURE",
  "INVALID_USER_SCODE",
]);
const amapAuthErrorInfocodes = new Set(["10001", "10002"]);
const amapRateLimitInfos = new Set(["DAILY_QUERY_OVER_LIMIT", "ACCESS_TOO_FREQUENT"]);
const amapRateLimitInfocodes = new Set(["10003", "10004"]);
const amapInputErrorInfos = new Set(["MISSING_REQUIRED_PARAMS", "INVALID_PARAMS"]);
const amapInputErrorInfocodes = new Set(["18001", "18002"]);
const amapMaxGetUrlLength = 2000;

export interface AmapActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  clientIp?: string;
}

type AmapActionHandler = (input: Record<string, unknown>, context: AmapActionContext) => Promise<unknown>;

type QueryValue = string | number | boolean | undefined;
type AmapRequestMode = "validate" | "execute";

type AmapResponsePayload = Record<string, unknown> & {
  status?: unknown;
  info?: unknown;
  infocode?: unknown;
};

export const amapActionHandlers: Record<string, AmapActionHandler> = {
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
  route_electrobike(input, runtime) {
    return executeRouteElectrobike(input, runtime);
  },
  route_transit(input, runtime) {
    return executeRouteTransit(input, runtime);
  },
};

export async function amapGet<T extends AmapResponsePayload>(
  path: string,
  query: Record<string, QueryValue>,
  fetcher: typeof fetch,
  mode: AmapRequestMode = "execute",
  signal?: AbortSignal,
): Promise<T> {
  try {
    const response = await fetcher(buildAmapUrl(path, query), {
      method: "GET",
      signal,
    });
    const payload = await readAmapJson<T>(response);
    if (!response.ok || payload.status !== "1") {
      throw normalizeAmapError(response, payload, mode);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, readUnexpectedMessage(error));
  }
}

export async function validateAmapCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredString(input.apiKey, "apiKey");
  await amapGet(
    "/v3/weather/weatherInfo",
    {
      city: "110000",
      extensions: "base",
      key: apiKey,
    },
    fetcher,
    "validate",
    signal,
  );

  return {
    profile: {
      accountId: "amap_api_key",
      displayName: "AMap API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/v3/weather/weatherInfo",
      apiBaseUrl: amapApiBaseUrl,
    },
  };
}

async function executeGeocode(input: Record<string, unknown>, runtime: AmapActionContext) {
  const payload = await amapGet(
    "/v3/geocode/geo",
    {
      address: readRequiredString(input.address, "address"),
      city: readOptionalString(input.city),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return {
    geocodes: readObjectArray(payload.geocodes).map((item) => ({
      formattedAddress: readOptionalString(item.formatted_address),
      country: readOptionalString(item.country),
      province: readOptionalString(item.province),
      city: readStringOrStringArray(item.city),
      district: readOptionalString(item.district),
      adcode: readOptionalString(item.adcode),
      location: readOptionalString(item.location),
    })),
  };
}

async function executeReverseGeocode(input: Record<string, unknown>, runtime: AmapActionContext) {
  const payload = await amapGet(
    "/v3/geocode/regeo",
    {
      location: readRequiredString(input.location, "location"),
      radius: readOptionalNumber(input.radius),
      extensions: readOptionalString(input.extensions),
      roadlevel: readOptionalNumber(input.roadLevel),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );
  const regeocode = readObject(payload.regeocode);

  return {
    formattedAddress: readOptionalString(regeocode?.formatted_address),
    addressComponent: readObject(regeocode?.addressComponent) ?? undefined,
    pois: readObjectArray(regeocode?.pois),
    roads: readObjectArray(regeocode?.roads),
    roadinters: readObjectArray(regeocode?.roadinters),
    aois: readObjectArray(regeocode?.aois),
  };
}

async function executeSearchPlaces(input: Record<string, unknown>, runtime: AmapActionContext) {
  const payload = await amapGet(
    "/v5/place/text",
    {
      keywords: readRequiredString(input.keywords, "keywords"),
      region: readOptionalString(input.region),
      city_limit: readOptionalBoolean(input.cityLimit),
      types: readOptionalString(input.types),
      page_num: readOptionalNumber(input.pageNum),
      page_size: readOptionalNumber(input.pageSize),
      show_fields: readOptionalString(input.showFields),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return buildPoiSearchOutput(payload);
}

async function executeSearchPlacesAround(
  input: Record<string, unknown>,
  runtime: AmapActionContext,
) {
  const payload = await amapGet(
    "/v5/place/around",
    {
      location: readRequiredString(input.location, "location"),
      radius: readOptionalNumber(input.radius),
      keywords: readOptionalString(input.keywords),
      types: readOptionalString(input.types),
      sortrule: readOptionalString(input.sortRule),
      page_num: readOptionalNumber(input.pageNum),
      page_size: readOptionalNumber(input.pageSize),
      show_fields: readOptionalString(input.showFields),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return buildPoiSearchOutput(payload);
}

async function executeSearchPlacesPolygon(
  input: Record<string, unknown>,
  runtime: AmapActionContext,
) {
  const payload = await amapGet(
    "/v5/place/polygon",
    {
      polygon: readRequiredString(input.polygon, "polygon"),
      keywords: readOptionalString(input.keywords),
      types: readOptionalString(input.types),
      page_num: readOptionalNumber(input.pageNum),
      page_size: readOptionalNumber(input.pageSize),
      show_fields: readOptionalString(input.showFields),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return buildPoiSearchOutput(payload);
}

async function executeGetPlaceDetail(input: Record<string, unknown>, runtime: AmapActionContext) {
  const payload = await amapGet(
    "/v5/place/detail",
    {
      id: readRequiredString(input.id, "id"),
      show_fields: readOptionalString(input.showFields),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return {
    pois: readPoiArray(payload.pois),
  };
}

async function executeInputTips(input: Record<string, unknown>, runtime: AmapActionContext) {
  const payload = await amapGet(
    "/v3/assistant/inputtips",
    {
      keywords: readRequiredString(input.keywords, "keywords"),
      type: readOptionalString(input.type),
      location: readOptionalString(input.location),
      city: readOptionalString(input.city),
      citylimit: readOptionalBoolean(input.cityLimit),
      datatype: readOptionalString(input.dataType),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return {
    tips: readObjectArray(payload.tips),
  };
}

async function executeIpLocate(input: Record<string, unknown>, runtime: AmapActionContext) {
  const ip = readOptionalString(input.ip) ?? runtime.clientIp;
  if (!ip) {
    throw new ProviderRequestError(400, "ip or context.clientIp is required");
  }

  const payload = await amapGet(
    "/v3/ip",
    {
      ip,
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return {
    province: readOptionalString(payload.province),
    city: readOptionalString(payload.city),
    adcode: readOptionalString(payload.adcode),
    rectangle: readOptionalString(payload.rectangle),
  };
}

async function executeDistrictSearch(input: Record<string, unknown>, runtime: AmapActionContext) {
  const payload = await amapGet(
    "/v3/config/district",
    {
      keywords: readRequiredString(input.keywords, "keywords"),
      subdistrict: readOptionalNumber(input.subDistrict),
      extensions: readOptionalString(input.extensions),
      page: readOptionalNumber(input.page),
      offset: readOptionalNumber(input.offset),
      filter: readOptionalString(input.filter),
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  return {
    count: readOptionalString(payload.count),
    districts: readObjectArray(payload.districts),
  };
}

async function executeWeather(input: Record<string, unknown>, runtime: AmapActionContext) {
  const extensions = readOptionalString(input.extensions);
  const payload = await amapGet(
    "/v3/weather/weatherInfo",
    {
      city: readRequiredString(input.city, "city"),
      extensions,
      key: runtime.apiKey,
    },
    runtime.fetcher,
    "execute",
    runtime.signal,
  );

  if (extensions === "all") {
    return {
      forecasts: readObjectArray(payload.forecasts),
    };
  }

  return {
    lives: readObjectArray(payload.lives),
  };
}

async function executeRouteWalking(input: Record<string, unknown>, runtime: AmapActionContext) {
  return executeSimpleRoute("/v5/direction/walking", {}, input, runtime);
}

async function executeRouteBicycling(input: Record<string, unknown>, runtime: AmapActionContext) {
  return executeSimpleRoute(
    "/v5/direction/bicycling",
    {
      alternative_route: readOptionalString(input.alternativeRoute),
    },
    input,
    runtime,
  );
}

async function executeRouteElectrobike(input: Record<string, unknown>, runtime: AmapActionContext) {
  return executeSimpleRoute("/v5/direction/electrobike", {}, input, runtime);
}

async function executeRouteDriving(input: Record<string, unknown>, runtime: AmapActionContext) {
  const query = {
    origin: readRequiredString(input.origin, "origin"),
    destination: readRequiredString(input.destination, "destination"),
    waypoints: readOptionalString(input.waypoints),
    strategy: readOptionalString(input.strategy),
    plate: readOptionalString(input.plate),
    cartype: readOptionalString(input.carType),
    avoidpolygons: readOptionalString(input.avoidPolygons),
    show_fields: readOptionalString(input.showFields),
    key: runtime.apiKey,
  };
  assertAmapGetUrlLength("/v5/direction/driving", query);
  const payload = await amapGet("/v5/direction/driving", query, runtime.fetcher,
    "execute",
    runtime.signal);
  const route = readObject(payload.route);

  return {
    route: {
      origin: readOptionalString(route?.origin),
      destination: readOptionalString(route?.destination),
      taxi_cost: readOptionalString(route?.taxi_cost),
      paths: readDrivingRoutePaths(route?.paths, hasShowField(input.showFields, "cost")),
    },
  };
}

async function executeRouteTransit(input: Record<string, unknown>, runtime: AmapActionContext) {
  const query = {
    origin: readRequiredString(input.origin, "origin"),
    destination: readRequiredString(input.destination, "destination"),
    city1: readRequiredString(input.originCity, "originCity"),
    city2: readRequiredString(input.destinationCity, "destinationCity"),
    strategy: readOptionalString(input.strategy),
    nightflag: readOptionalString(input.nightFlag),
    show_fields: readOptionalString(input.showFields),
    key: runtime.apiKey,
  };
  assertAmapGetUrlLength("/v5/direction/transit/integrated", query);
  const payload = await amapGet("/v5/direction/transit/integrated", query, runtime.fetcher,
    "execute",
    runtime.signal);
  const route = readObject(payload.route);
  const includeCost = hasShowField(input.showFields, "cost");

  return {
    route: {
      origin: readOptionalString(route?.origin),
      destination: readOptionalString(route?.destination),
      cost: includeCost ? readTransitTaxiCost(route?.cost) : undefined,
      transits: readTransitRoutes(route?.transits, includeCost),
    },
  };
}

function buildAmapUrl(path: string, query: Record<string, QueryValue>) {
  const url = new URL(path, amapApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function readAmapJson<T extends AmapResponsePayload>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ProviderRequestError(response.status || 500, readUnexpectedMessage(error));
  }
}

function normalizeAmapError(
  response: Response,
  payload: AmapResponsePayload,
  mode: AmapRequestMode,
) {
  const info = typeof payload.info === "string" ? payload.info : undefined;
  const infocode = typeof payload.infocode === "string" ? payload.infocode : undefined;
  const message = buildAmapErrorMessage(response.status, info, infocode);

  if (
    response.status === 429 ||
    amapRateLimitInfos.has(info ?? "") ||
    amapRateLimitInfocodes.has(infocode ?? "")
  ) {
    return new ProviderRequestError(429, message);
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    amapAuthErrorInfos.has(info ?? "") ||
    amapAuthErrorInfocodes.has(infocode ?? "")
  ) {
    if (mode === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(401, message);
  }

  if (
    response.status === 400 ||
    amapInputErrorInfos.has(info ?? "") ||
    amapInputErrorInfocodes.has(infocode ?? "")
  ) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function buildAmapErrorMessage(status: number, info?: string, infocode?: string) {
  if (info && infocode) {
    return `${info} (${infocode})`;
  }
  if (info) {
    return info;
  }
  if (infocode) {
    return `amap request failed with ${infocode}`;
  }
  return `amap request failed with ${status}`;
}

function readUnexpectedMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "amap request failed";
}

function readRequiredString(value: unknown, key: string) {
  return requiredString(value, key, providerInputError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized === "" ? undefined : normalized;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readStringOrStringArray(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readObject(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function buildPoiSearchOutput(payload: AmapResponsePayload) {
  return {
    count: readOptionalString(payload.count),
    pois: readPoiArray(payload.pois),
  };
}

function readPoiArray(value: unknown) {
  return readObjectArray(value).map((item) => ({
    id: readOptionalString(item.id),
    name: readOptionalString(item.name),
    type: readOptionalString(item.type),
    typecode: readOptionalString(item.typecode),
    address: readOptionalString(item.address),
    location: readOptionalString(item.location),
    pname: readOptionalString(item.pname),
    cityname: readOptionalString(item.cityname),
    adname: readOptionalString(item.adname),
  }));
}

async function executeSimpleRoute(
  path: string,
  query: Record<string, QueryValue>,
  input: Record<string, unknown>,
  runtime: AmapActionContext,
) {
  const fullQuery = {
    origin: readRequiredString(input.origin, "origin"),
    destination: readRequiredString(input.destination, "destination"),
    show_fields: readOptionalString(input.showFields),
    key: runtime.apiKey,
    ...query,
  };
  assertAmapGetUrlLength(path, fullQuery);
  const payload = await amapGet(path, fullQuery, runtime.fetcher,
    "execute",
    runtime.signal);
  const route = readObject(payload.route);

  return {
    route: {
      origin: readOptionalString(route?.origin),
      destination: readOptionalString(route?.destination),
      paths: readSimpleRoutePaths(route?.paths, hasShowField(input.showFields, "cost")),
    },
  };
}

function readSimpleRoutePaths(value: unknown, includeCost: boolean) {
  return readObjectArray(value).map((item) => {
    const normalized = {
      distance: readOptionalString(item.distance),
      steps: readObjectArray(item.steps),
    };
    const cost = readObject(item.cost);
    if (!includeCost || !cost) {
      return normalized;
    }

    return {
      ...normalized,
      cost: {
        duration: readOptionalString(cost.duration),
      },
    };
  });
}

function readDrivingRoutePaths(value: unknown, includeCost: boolean) {
  return readObjectArray(value).map((item) => {
    const normalized = {
      distance: readOptionalString(item.distance),
      restriction: readOptionalString(item.restriction),
      steps: readObjectArray(item.steps),
    };
    const cost = readObject(item.cost);
    if (!includeCost || !cost) {
      return normalized;
    }

    return {
      ...normalized,
      cost: {
        duration: readOptionalString(cost.duration),
        tolls: readOptionalString(cost.tolls),
      },
    };
  });
}

function readTransitRoutes(value: unknown, includeCost: boolean) {
  return readObjectArray(value).map((item) => {
    const normalized = {
      distance: readOptionalString(item.distance),
      nightflag: readOptionalString(item.nightflag),
      segments: readTransitSegments(item.segments, includeCost),
    };
    const cost = readObject(item.cost);
    if (!includeCost || !cost) {
      return normalized;
    }

    return {
      ...normalized,
      cost: {
        duration: readOptionalString(cost.duration),
      },
    };
  });
}

function readTransitSegments(value: unknown, includeCost: boolean) {
  return readObjectArray(value).map((item) => {
    if (!includeCost) {
      const { cost: _cost, ...rest } = item;
      return rest;
    }

    const cost = readObject(item.cost);
    return {
      ...item,
      ...(cost
        ? {
            cost: {
              transit_fee: readOptionalString(cost.transit_fee),
            },
          }
        : {}),
    };
  });
}

function readTransitTaxiCost(value: unknown) {
  const cost = readObject(value);
  if (!cost) {
    return undefined;
  }

  return {
    taxi_fee: readOptionalString(cost.taxi_fee),
  };
}

function assertAmapGetUrlLength(path: string, query: Record<string, QueryValue>) {
  if (buildAmapUrl(path, query).length > amapMaxGetUrlLength) {
    throw new ProviderRequestError(400, "amap GET request is too long");
  }
}

function hasShowField(value: unknown, expectedField: string) {
  if (typeof value !== "string") {
    return false;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .includes(expectedField);
}
