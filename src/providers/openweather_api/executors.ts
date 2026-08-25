import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { queryParams, readBoundedResponseBytes } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "openweather_api";
const openweatherApiBaseUrl = "https://api.openweathermap.org";
const openweatherTileBaseUrl = "https://tile.openweathermap.org";
const maxWeatherTileBytes = 5 * 1024 * 1024;
const retiredWeatherTriggersMessage =
  "OpenWeather retired Weather Triggers API on August 1, 2025; this action is no longer available.";

type OpenweatherPhase = "validate" | "execute";
type OpenweatherActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface OpenweatherJsonRequestInput {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: OpenweatherPhase;
  method?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

interface OpenweatherBinaryRequestInput {
  baseUrl: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: OpenweatherPhase;
  query?: Record<string, QueryValue>;
}

export const openweatherApiActionHandlers: ProviderActionHandlers<"openweather_api", OpenweatherActionHandler> = {
  get_geocoding_direct(input, context) {
    return executeDirectGeocoding(input, context);
  },
  get_geocoding_reverse(input, context) {
    return executeReverseGeocoding(input, context);
  },
  get_geocoding_by_zip(input, context) {
    return executeZipGeocoding(input, context);
  },
  get_current_weather(input, context) {
    return executeCurrentWeather(input, context);
  },
  get_5_day_forecast(input, context) {
    return executeFiveDayForecast(input, context);
  },
  get_circle_city_weather(input, context) {
    return executeCircleCityWeather(input, context);
  },
  get_air_pollution_current(input, context) {
    return executeAirPollutionCurrent(input, context);
  },
  get_air_pollution_forecast(input, context) {
    return executeAirPollutionForecast(input, context);
  },
  get_air_pollution_history(input, context) {
    return executeAirPollutionHistory(input, context);
  },
  get_uv_index(input, context) {
    return executeUvIndex(input, context);
  },
  get_uv_index_forecast(input, context) {
    return executeUvIndexForecast(input, context);
  },
  get_uv_index_history(input, context) {
    return executeUvIndexHistory(input, context);
  },
  get_weather_map_tile(input, context) {
    return executeWeatherMapTile(input, context);
  },
  add_weather_station(input, context) {
    return executeAddWeatherStation(input, context);
  },
  update_weather_station(input, context) {
    return executeUpdateWeatherStation(input, context);
  },
  delete_weather_station(input, context) {
    return executeDeleteWeatherStation(input, context);
  },
  list_weather_stations(_input, context) {
    return executeListWeatherStations(context);
  },
  get_weather_station(input, context) {
    return executeGetWeatherStation(input, context);
  },
  submit_station_measurements(input, context) {
    return executeSubmitStationMeasurements(input, context);
  },
  get_station_measurements(input, context) {
    return executeGetStationMeasurements(input, context);
  },
  get_weather_triggers() {
    throw new ProviderRequestError(410, retiredWeatherTriggersMessage);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, openweatherApiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = readResponseArray(
      await openweatherJsonRequest({
        path: "/geo/1.0/direct",
        query: {
          q: "London",
          limit: 1,
        },
        context: {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        phase: "validate",
      }),
      "geocoding validation response",
    );

    return {
      profile: {
        accountId: service,
        displayName: "OpenWeather API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/geo/1.0/direct",
        apiBaseUrl: openweatherApiBaseUrl,
        tileApiBaseUrl: openweatherTileBaseUrl,
        probeResultCount: payload.length,
      },
    };
  },
};

async function executeDirectGeocoding(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = readResponseArray(
    await openweatherJsonRequest({
      path: "/geo/1.0/direct",
      query: {
        q: readRequiredString(input.q, "q"),
        limit: optionalInteger(input.limit),
      },
      context,
      phase: "execute",
    }),
    "direct geocoding response",
  );

  return {
    locations: payload.map((item, index) =>
      normalizeGeocodingLocation(readResponseObject(item, `locations[${index}]`)),
    ),
  };
}

async function executeReverseGeocoding(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = readResponseArray(
    await openweatherJsonRequest({
      path: "/geo/1.0/reverse",
      query: {
        lat: readRequiredNumber(input.lat, "lat"),
        lon: readRequiredNumber(input.lon, "lon"),
        limit: optionalInteger(input.limit),
      },
      context,
      phase: "execute",
    }),
    "reverse geocoding response",
  );

  return {
    locations: payload.map((item, index) =>
      normalizeGeocodingLocation(readResponseObject(item, `locations[${index}]`)),
    ),
  };
}

async function executeZipGeocoding(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = normalizeGeocodingLocation(
    readResponseObject(
      await openweatherJsonRequest({
        path: "/geo/1.0/zip",
        query: {
          zip: readRequiredString(input.zip, "zip"),
        },
        context,
        phase: "execute",
      }),
      "zip geocoding response",
    ),
  );

  return {
    location: payload,
  };
}

async function executeCurrentWeather(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return readResponseObject(
    await openweatherJsonRequest({
      path: "/data/2.5/weather",
      query: {
        ...buildLocationQuery(input),
        units: optionalString(input.units),
        lang: optionalString(input.lang),
      },
      context,
      phase: "execute",
    }),
    "current weather response",
  );
}

async function executeFiveDayForecast(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return readResponseObject(
    await openweatherJsonRequest({
      path: "/data/2.5/forecast",
      query: {
        ...buildLocationQuery(input),
        mode: readJsonOnlyMode(input.mode),
        units: optionalString(input.units),
        lang: optionalString(input.lang),
      },
      context,
      phase: "execute",
    }),
    "5 day forecast response",
  );
}

async function executeCircleCityWeather(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return readResponseObject(
    await openweatherJsonRequest({
      path: "/data/2.5/find",
      query: {
        lat: readRequiredNumber(input.lat, "lat"),
        lon: readRequiredNumber(input.lon, "lon"),
        cnt: optionalInteger(input.cnt),
        mode: readJsonOnlyMode(input.mode),
        units: optionalString(input.units),
        lang: optionalString(input.lang),
      },
      context,
      phase: "execute",
    }),
    "circle city weather response",
  );
}

async function executeAirPollutionCurrent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return readResponseObject(
    await openweatherJsonRequest({
      path: "/data/2.5/air_pollution",
      query: {
        lat: readRequiredNumber(input.lat, "lat"),
        lon: readRequiredNumber(input.lon, "lon"),
      },
      context,
      phase: "execute",
    }),
    "air pollution current response",
  );
}

async function executeAirPollutionForecast(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return readResponseObject(
    await openweatherJsonRequest({
      path: "/data/2.5/air_pollution/forecast",
      query: {
        lat: readRequiredNumber(input.lat, "lat"),
        lon: readRequiredNumber(input.lon, "lon"),
      },
      context,
      phase: "execute",
    }),
    "air pollution forecast response",
  );
}

async function executeAirPollutionHistory(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const start = readRequiredInteger(input.start, "start");
  const end = readRequiredInteger(input.end, "end");
  assertValidUnixRange(start, end);

  return readResponseObject(
    await openweatherJsonRequest({
      path: "/data/2.5/air_pollution/history",
      query: {
        lat: readRequiredNumber(input.lat, "lat"),
        lon: readRequiredNumber(input.lon, "lon"),
        start,
        end,
      },
      context,
      phase: "execute",
    }),
    "air pollution history response",
  );
}

async function executeUvIndex(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const lat = readRequiredNumber(input.lat, "lat");
  const lon = readRequiredNumber(input.lon, "lon");
  const payload = readResponseObject(
    await openweatherJsonRequest({
      path: "/data/3.0/onecall",
      query: {
        lat,
        lon,
        exclude: "minutely,hourly,daily,alerts",
        units: optionalString(input.units),
        lang: optionalString(input.lang),
      },
      context,
      phase: "execute",
    }),
    "uv current response",
  );

  return buildUvIndexPoint(lat, lon, readResponseObject(payload.current, "current"));
}

async function executeUvIndexForecast(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const lat = readRequiredNumber(input.lat, "lat");
  const lon = readRequiredNumber(input.lon, "lon");
  const count = optionalInteger(input.cnt) ?? 8;
  const payload = readResponseObject(
    await openweatherJsonRequest({
      path: "/data/3.0/onecall",
      query: {
        lat,
        lon,
        exclude: "current,minutely,hourly,alerts",
        units: optionalString(input.units),
        lang: optionalString(input.lang),
      },
      context,
      phase: "execute",
    }),
    "uv forecast response",
  );

  const daily = readResponseArray(payload.daily, "daily");
  return {
    list: daily
      .slice(0, count)
      .map((item, index) => buildUvIndexPoint(lat, lon, readResponseObject(item, `daily[${index}]`))),
  };
}

async function executeUvIndexHistory(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const lat = readRequiredNumber(input.lat, "lat");
  const lon = readRequiredNumber(input.lon, "lon");
  const start = readRequiredInteger(input.start, "start");
  const end = readRequiredInteger(input.end, "end");
  assertValidUnixRange(start, end);

  const units = optionalString(input.units);
  const lang = optionalString(input.lang);
  const points: Array<{ lat: number; lon: number; date: number; dateIso: string; value: number }> = [];

  for (const timestamp of buildUvHistorySampleTimestamps(start, end)) {
    const payload = readResponseObject(
      await openweatherJsonRequest({
        path: "/data/3.0/onecall/timemachine",
        query: {
          lat,
          lon,
          dt: timestamp,
          units,
          lang,
        },
        context,
        phase: "execute",
      }),
      `uv history response ${timestamp}`,
    );

    const data = readResponseArray(payload.data, `data for ${timestamp}`);
    if (data.length > 0) {
      points.push(buildUvIndexPoint(lat, lon, readResponseObject(data[0], `data[0] for ${timestamp}`)));
    }
  }

  return {
    list: points,
  };
}

async function executeWeatherMapTile(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const tile = await openweatherBinaryRequest({
    baseUrl: openweatherTileBaseUrl,
    path: `/map/${readRequiredString(input.layer, "layer")}/${readRequiredInteger(input.z, "z")}/${readRequiredInteger(input.x, "x")}/${readRequiredInteger(input.y, "y")}.png`,
    query: {
      opacity: optionalNumber(input.opacity),
      palette: optionalString(input.palette),
      color: optionalString(input.color),
      fill: optionalString(input.fill),
      fill_bound: optionalBoolean(input.fill_bound),
      scale: optionalInteger(input.scale),
      format: optionalString(input.format),
    },
    context,
    phase: "execute",
  });

  return {
    tileBase64: Buffer.from(tile.bytes).toString("base64"),
    contentType: tile.contentType,
  };
}

async function executeAddWeatherStation(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = readResponseObject(
    await openweatherJsonRequest({
      path: "/data/3.0/stations",
      method: "POST",
      body: {
        external_id: readRequiredString(input.external_id, "external_id"),
        name: readRequiredString(input.name, "name"),
        latitude: readRequiredNumber(input.latitude, "latitude"),
        longitude: readRequiredNumber(input.longitude, "longitude"),
        altitude: readRequiredNumber(input.altitude, "altitude"),
      },
      context,
      phase: "execute",
    }),
    "add weather station response",
  );

  return normalizeWeatherStation(payload);
}

async function executeUpdateWeatherStation(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const stationId = encodeURIComponent(readRequiredString(input.station_id, "station_id"));
  const body = compactObject({
    external_id: optionalString(input.external_id),
    name: optionalString(input.name),
    latitude: optionalNumber(input.latitude),
    longitude: optionalNumber(input.longitude),
    altitude: optionalNumber(input.altitude),
  });
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(
      400,
      "At least one of external_id, name, latitude, longitude, or altitude is required.",
    );
  }

  const payload = readResponseObject(
    await openweatherJsonRequest({
      path: `/data/3.0/stations/${stationId}`,
      method: "PUT",
      body,
      context,
      phase: "execute",
    }),
    "update weather station response",
  );

  return normalizeWeatherStation(payload);
}

async function executeDeleteWeatherStation(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const stationId = encodeURIComponent(readRequiredString(input.station_id, "station_id"));
  await openweatherJsonRequest({
    path: `/data/3.0/stations/${stationId}`,
    method: "DELETE",
    context,
    phase: "execute",
  });

  return {
    message: "Weather station deleted successfully.",
  };
}

async function executeListWeatherStations(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readResponseArray(
    await openweatherJsonRequest({
      path: "/data/3.0/stations",
      context,
      phase: "execute",
    }),
    "list weather stations response",
  );

  return {
    stations: payload.map((item, index) => normalizeWeatherStation(readResponseObject(item, `stations[${index}]`))),
  };
}

async function executeGetWeatherStation(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const stationId = encodeURIComponent(readRequiredString(input.station_id, "station_id"));
  return normalizeWeatherStation(
    readResponseObject(
      await openweatherJsonRequest({
        path: `/data/3.0/stations/${stationId}`,
        context,
        phase: "execute",
      }),
      "get weather station response",
    ),
  );
}

async function executeSubmitStationMeasurements(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  await openweatherJsonRequest({
    path: "/data/3.0/measurements",
    method: "POST",
    body: objectArray(input.measurements, "measurements", providerInvalidInput),
    context,
    phase: "execute",
  });

  return {
    message: "Measurements submitted successfully.",
    success: true,
  };
}

async function executeGetStationMeasurements(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const from = readRequiredInteger(input.from, "from");
  const to = readRequiredInteger(input.to, "to");
  assertValidUnixRange(from, to, "to", "from");
  const payload = readResponseArray(
    await openweatherJsonRequest({
      path: "/data/3.0/measurements",
      query: {
        station_id: readRequiredString(input.station_id, "station_id"),
        type: readRequiredString(input.type, "type"),
        limit: readRequiredInteger(input.limit, "limit"),
        from,
        to,
      },
      context,
      phase: "execute",
    }),
    "station measurements response",
  );

  return {
    measurements: payload.map((item, index) =>
      normalizeStationMeasurement(readResponseObject(item, `measurements[${index}]`)),
    ),
  };
}

async function openweatherJsonRequest(input: OpenweatherJsonRequestInput): Promise<unknown> {
  const method = input.method ?? "GET";
  const url = buildOpenweatherUrl(openweatherApiBaseUrl, input.path, input.context.apiKey, input.query);
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(url, {
      method,
      headers: openweatherHeaders(method !== "GET" || input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readOpenweatherPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `OpenWeather request failed: ${error.message}` : "OpenWeather request failed",
    );
  }

  if (!response.ok) {
    throw createOpenweatherError(response.status, payload, input.phase);
  }

  return payload;
}

async function openweatherBinaryRequest(input: OpenweatherBinaryRequestInput): Promise<{
  bytes: Uint8Array;
  contentType: string;
}> {
  const url = buildOpenweatherUrl(input.baseUrl, input.path, input.context.apiKey, input.query);
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `OpenWeather request failed: ${error.message}` : "OpenWeather request failed",
    );
  }

  if (!response.ok) {
    const payload = await readOpenweatherPayload(response);
    throw createOpenweatherError(response.status, payload, input.phase);
  }

  return {
    bytes: await readBoundedResponseBytes(response, {
      maxBytes: maxWeatherTileBytes,
      fieldName: "weather map tile",
      createError: (message) => new ProviderRequestError(413, message),
    }),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}

function buildOpenweatherUrl(baseUrl: string, path: string, apiKey: string, query?: Record<string, QueryValue>): URL {
  const url = new URL(path, baseUrl);
  url.searchParams.set("appid", apiKey);
  setSearchParams(url, queryParams(query ?? {}));
  return url;
}

function openweatherHeaders(withJsonBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (withJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readOpenweatherPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createOpenweatherError(status: number, payload: unknown, phase: OpenweatherPhase): ProviderRequestError {
  const message = extractOpenweatherMessage(payload) ?? `OpenWeather request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, payload);
  }

  if (status === 401 || status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message, payload);
    }
    if (looksLikeSubscriptionError(message)) {
      return new ProviderRequestError(502, message, payload);
    }
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractOpenweatherMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  const message = optionalString(record?.message);
  if (message) {
    return message;
  }

  const cod = record?.cod;
  if (typeof cod === "string" || typeof cod === "number") {
    return `OpenWeather request failed with ${cod}`;
  }

  return undefined;
}

function looksLikeSubscriptionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("subscribe") || normalized.includes("subscription") || normalized.includes("paid account");
}

function buildLocationQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  const q = optionalString(input.q);
  const id = optionalInteger(input.id);
  const zip = optionalString(input.zip);
  const lat = optionalNumber(input.lat);
  const lon = optionalNumber(input.lon);

  if ((lat === undefined) !== (lon === undefined)) {
    throw new ProviderRequestError(400, "lat and lon must be provided together");
  }

  const selectorCount = [
    q !== undefined,
    id !== undefined,
    zip !== undefined,
    lat !== undefined && lon !== undefined,
  ].filter(Boolean).length;
  if (selectorCount !== 1) {
    throw new ProviderRequestError(400, "Exactly one of q, id, zip, or lat+lon is required.");
  }

  return {
    q,
    id,
    zip,
    lat,
    lon,
  };
}

function normalizeGeocodingLocation(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readRequiredString(payload.name, "name"),
    local_names: optionalRecord(payload.local_names),
    lat: readRequiredNumber(payload.lat, "lat"),
    lon: readRequiredNumber(payload.lon, "lon"),
    country: readRequiredString(payload.country, "country"),
    state: optionalString(payload.state),
    zip: optionalString(payload.zip),
  });
}

function normalizeWeatherStation(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readRequiredString(payload.id ?? payload.ID, "id"),
    external_id: optionalString(payload.external_id),
    name: readRequiredString(payload.name, "name"),
    latitude: readRequiredNumber(payload.latitude, "latitude"),
    longitude: readRequiredNumber(payload.longitude, "longitude"),
    altitude: optionalNumber(payload.altitude),
    rank: optionalInteger(payload.rank),
    created_at: optionalString(payload.created_at),
    updated_at: optionalString(payload.updated_at),
    user_id: optionalString(payload.user_id),
    source_type: optionalInteger(payload.source_type),
  });
}

function normalizeStationMeasurement(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    date: readRequiredInteger(payload.date, "date"),
    type: readRequiredString(payload.type, "type"),
    station_id: readRequiredString(payload.station_id, "station_id"),
    temp: optionalRecord(payload.temp),
    humidity: optionalRecord(payload.humidity),
    pressure: optionalRecord(payload.pressure),
    wind: optionalRecord(payload.wind),
    precipitation: optionalRecord(payload.precipitation),
  });
}

function buildUvIndexPoint(
  lat: number,
  lon: number,
  payload: Record<string, unknown>,
): { lat: number; lon: number; date: number; dateIso: string; value: number } {
  const timestamp = readRequiredInteger(payload.dt, "dt");
  return {
    lat,
    lon,
    date: timestamp,
    dateIso: new Date(timestamp * 1000).toISOString(),
    value: readRequiredNumber(payload.uvi, "uvi"),
  };
}

function buildUvHistorySampleTimestamps(start: number, end: number): number[] {
  assertValidUnixRange(start, end);
  const timestamps = new Set<number>();
  let current = start;

  while (current <= end) {
    timestamps.add(current);
    current += 24 * 60 * 60;
  }

  timestamps.add(end);
  return [...timestamps].sort((left, right) => left - right);
}

function assertValidUnixRange(start: number, end: number, endField = "end", startField = "start"): void {
  if (end < start) {
    throw new ProviderRequestError(400, `${endField} must be greater than or equal to ${startField}`);
  }
}

function readJsonOnlyMode(value: unknown): string | undefined {
  const mode = optionalString(value);
  if (mode !== undefined && mode !== "json") {
    throw new ProviderRequestError(400, "Only json mode is supported by this connector.");
  }
  return mode;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInvalidInput);
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readResponseObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `OpenWeather ${label} was not an object`);
  }
  return record;
}

function readResponseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `OpenWeather ${label} was not an array`);
  }
  return value;
}

function providerInvalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.openweathermap.org",
  auth: { type: "api_key_query", name: "appid" },
});
