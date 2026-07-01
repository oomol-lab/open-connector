import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ApiNinjasActionName } from "./actions.ts";

import { optionalNumber, optionalRecord, optionalString, objectArray } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "api_ninjas";
const apiNinjasApiBaseUrl = "https://api.api-ninjas.com";

type ApiNinjasQueryValue = string | number | undefined;
type ApiNinjasRequestPhase = "validate" | "execute";

interface ApiNinjasActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ApiNinjasActionHandler = (input: Record<string, unknown>, context: ApiNinjasActionContext) => Promise<unknown>;

export const apiNinjasActionHandlers: Record<ApiNinjasActionName, ApiNinjasActionHandler> = {
  async geocode(input, context) {
    const payload = await requestApiNinjasJson(
      "/v1/geocoding",
      {
        city: requireInputString(input.city, "city"),
        state: optionalString(input.state),
        country: optionalString(input.country),
        zipcode: optionalString(input.zipcode),
      },
      context,
      "execute",
    );

    return {
      results: objectArray(payload, "API Ninjas geocode response", providerError).map((item) => ({
        name: requireResponseString(item.name, "name"),
        latitude: requireResponseNumber(item.latitude, "latitude"),
        longitude: requireResponseNumber(item.longitude, "longitude"),
        country: requireResponseString(item.country, "country"),
      })),
    };
  },

  async reverse_geocode(input, context) {
    const payload = await requestApiNinjasJson(
      "/v1/reversegeocoding",
      {
        lat: requireInputNumber(input.lat, "lat"),
        lon: requireInputNumber(input.lon, "lon"),
      },
      context,
      "execute",
    );

    return {
      results: objectArray(payload, "API Ninjas reverse geocode response", providerError).map((item) => ({
        name: requireResponseString(item.name, "name"),
        country: requireResponseString(item.country, "country"),
        state: optionalString(item.state),
      })),
    };
  },

  async weather(input, context) {
    const payload = await requestApiNinjasJson(
      "/v1/weather",
      {
        lat: requireInputNumber(input.lat, "lat"),
        lon: requireInputNumber(input.lon, "lon"),
      },
      context,
      "execute",
    );

    return normalizeWeatherMetrics(payload);
  },

  async weather_forecast(input, context) {
    const payload = await requestApiNinjasJson(
      "/v1/weatherforecast",
      {
        lat: requireInputNumber(input.lat, "lat"),
        lon: requireInputNumber(input.lon, "lon"),
      },
      context,
      "execute",
    );

    return {
      forecast: objectArray(payload, "API Ninjas weather forecast response", providerError).map((item) =>
        normalizeWeatherMetrics(item),
      ),
    };
  },

  async air_quality(input, context) {
    validateLocationLookup(input, false);
    const payload = await requestApiNinjasJson(
      "/v1/airquality",
      {
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        city: optionalString(input.city),
        state: optionalString(input.state),
        country: optionalString(input.country),
      },
      context,
      "execute",
    );
    const record = requireResponseRecord(payload, "API Ninjas air quality response");

    return {
      overallAqi: requireResponseNumber(record.overall_aqi, "overall_aqi"),
      co: normalizePollutant(record.CO),
      no2: normalizePollutant(record.NO2),
      o3: normalizePollutant(record.O3),
      so2: normalizePollutant(record.SO2),
      pm25: normalizePollutant(record["PM2.5"]),
      pm10: normalizePollutant(record.PM10),
    };
  },

  async timezone(input, context) {
    validateLocationLookup(input, true);
    const payload = await requestApiNinjasJson(
      "/v1/timezone",
      {
        timezone: optionalString(input.timezone),
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        city: optionalString(input.city),
        state: optionalString(input.state),
        country: optionalString(input.country),
      },
      context,
      "execute",
    );
    const record = requireResponseRecord(payload, "API Ninjas timezone response");

    return {
      timezone: requireResponseString(record.timezone, "timezone"),
      utcOffset: requireResponseNumber(record.utc_offset, "utc_offset"),
      localTime: requireResponseString(record.local_time, "local_time"),
      city: optionalString(record.city),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiNinjasActionContext>({
  service,
  handlers: apiNinjasActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ApiNinjasActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestApiNinjasJson(
      "/v1/timezone",
      {
        timezone: "UTC",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "API Ninjas API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/timezone",
        apiBaseUrl: apiNinjasApiBaseUrl,
      },
    };
  },
};

async function requestApiNinjasJson(
  path: string,
  query: Record<string, ApiNinjasQueryValue>,
  context: ApiNinjasActionContext,
  phase: ApiNinjasRequestPhase,
): Promise<unknown> {
  const url = new URL(path, apiNinjasApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-Api-Key": context.apiKey,
      },
      signal: context.signal,
    });
    payload = await readApiNinjasPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `API Ninjas request failed: ${error.message}` : "API Ninjas request failed",
    );
  }

  if (!response.ok) {
    throw createApiNinjasError(response, payload, phase);
  }

  return payload;
}

async function readApiNinjasPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createApiNinjasError(
  response: Response,
  payload: unknown,
  phase: ApiNinjasRequestPhase,
): ProviderRequestError {
  const message = extractApiNinjasErrorMessage(payload) ?? response.statusText ?? "API Ninjas request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractApiNinjasErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function normalizeWeatherMetrics(payload: unknown): Record<string, number> {
  const record = requireResponseRecord(payload, "API Ninjas weather response");

  return {
    temp: requireResponseNumber(record.temp, "temp"),
    feelsLike: requireResponseNumber(record.feels_like, "feels_like"),
    minTemp: requireResponseNumber(record.min_temp, "min_temp"),
    maxTemp: requireResponseNumber(record.max_temp, "max_temp"),
    humidity: requireResponseNumber(record.humidity, "humidity"),
    windSpeed: requireResponseNumber(record.wind_speed, "wind_speed"),
    windDegrees: requireResponseNumber(record.wind_degrees, "wind_degrees"),
    sunrise: requireResponseNumber(record.sunrise, "sunrise"),
    sunset: requireResponseNumber(record.sunset, "sunset"),
  };
}

function normalizePollutant(payload: unknown): Record<string, number> {
  const record = requireResponseRecord(payload, "API Ninjas pollutant response");

  return {
    concentration: requireResponseNumber(record.concentration, "concentration"),
    aqi: requireResponseNumber(record.aqi, "aqi"),
  };
}

function validateLocationLookup(input: Record<string, unknown>, allowTimezone: boolean): void {
  const hasTimezone = optionalString(input.timezone) !== undefined;
  const hasLat = input.lat !== undefined;
  const hasLon = input.lon !== undefined;
  const hasCoordinates = hasLat || hasLon;
  const hasCityLookup =
    optionalString(input.city) !== undefined ||
    optionalString(input.state) !== undefined ||
    optionalString(input.country) !== undefined;

  if (hasLat && !hasLon) {
    throw new ProviderRequestError(400, "lon is required when lat is provided.");
  }
  if (hasLon && !hasLat) {
    throw new ProviderRequestError(400, "lat is required when lon is provided.");
  }
  if (!allowTimezone && hasCoordinates && hasCityLookup) {
    throw new ProviderRequestError(400, "Provide either coordinates or city-based lookup fields, not both.");
  }
  if (!allowTimezone && !hasCoordinates && optionalString(input.city) === undefined) {
    throw new ProviderRequestError(400, "city is required when coordinates are not provided.");
  }
  if (allowTimezone && hasTimezone && (hasCoordinates || hasCityLookup)) {
    throw new ProviderRequestError(400, "Provide either timezone or premium location fields, not both.");
  }
  if (allowTimezone && hasCoordinates && hasCityLookup) {
    throw new ProviderRequestError(400, "Provide either coordinates or city-based lookup fields, not both.");
  }
  if (allowTimezone && !hasTimezone && !hasCoordinates && optionalString(input.city) === undefined) {
    throw new ProviderRequestError(400, "Provide timezone, coordinates, or city-based lookup fields.");
  }
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed) {
    return parsed;
  }

  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function requireInputNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed !== undefined) {
    return parsed;
  }

  throw new ProviderRequestError(400, `${fieldName} must be a number`);
}

function requireResponseRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }

  throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
}

function requireResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed) {
    return parsed;
  }

  throw new ProviderRequestError(502, `API Ninjas response missing string field: ${fieldName}`);
}

function requireResponseNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed !== undefined) {
    return parsed;
  }

  throw new ProviderRequestError(502, `API Ninjas response missing numeric field: ${fieldName}`);
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
