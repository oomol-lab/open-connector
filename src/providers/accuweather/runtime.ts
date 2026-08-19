import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const accuweatherApiBaseUrl = "https://dataservice.accuweather.com";

type AccuweatherRequestPhase = "validate" | "execute";
type AccuweatherQueryValue = string | number | boolean | undefined;
type AccuweatherActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type AccuweatherActionHandler = (input: Record<string, unknown>, context: AccuweatherActionContext) => Promise<unknown>;

export const accuweatherActionHandlers: ProviderActionHandlers<"accuweather", AccuweatherActionHandler> = {
  async search_locations(input, context) {
    const payload = await accuweatherGetJson(
      {
        path: "/locations/v1/cities/search",
        query: {
          q: readRequiredInputString(input.query, "query"),
          language: optionalString(input.language),
          details: optionalBoolean(input.details),
          offset: optionalInteger(input.offset),
          alias: optionalInteger(input.alias),
        },
      },
      context,
      "execute",
    );
    return {
      locations: readRequiredArray(payload, "AccuWeather location search response").map(normalizeLocation),
      raw: payload,
    };
  },

  async get_location_by_geoposition(input, context) {
    const latitude = readRequiredInputNumber(input.latitude, "latitude");
    const longitude = readRequiredInputNumber(input.longitude, "longitude");
    const payload = await accuweatherGetJson(
      {
        path: "/locations/v1/cities/geoposition/search",
        query: {
          q: `${latitude},${longitude}`,
          language: optionalString(input.language),
          details: optionalBoolean(input.details),
          toplevel: optionalBoolean(input.topLevel),
        },
      },
      context,
      "execute",
    );
    return {
      location: normalizeLocation(readRequiredObject(payload, "AccuWeather location")),
      raw: payload,
    };
  },

  async get_current_conditions(input, context) {
    const locationKey = encodeURIComponent(readRequiredInputString(input.locationKey, "locationKey"));
    const payload = await accuweatherGetJson(
      {
        path: `/currentconditions/v1/${locationKey}`,
        query: {
          language: optionalString(input.language),
          details: optionalBoolean(input.details),
        },
      },
      context,
      "execute",
    );
    return {
      conditions: readRequiredArray(payload, "AccuWeather current conditions response").map(normalizeCondition),
      raw: payload,
    };
  },

  async get_daily_forecast(input, context) {
    const duration = readRequiredInputString(input.duration, "duration");
    const locationKey = encodeURIComponent(readRequiredInputString(input.locationKey, "locationKey"));
    const payload = await accuweatherGetJson(
      {
        path: `/forecasts/v1/daily/${duration}/${locationKey}`,
        query: {
          language: optionalString(input.language),
          details: optionalBoolean(input.details),
          metric: optionalBoolean(input.metric),
        },
      },
      context,
      "execute",
    );
    const record = readRequiredObject(payload, "AccuWeather daily forecast response");
    return {
      headline: optionalRecord(record.Headline) ?? {},
      dailyForecasts: readRequiredArray(record.DailyForecasts, "AccuWeather DailyForecasts"),
      raw: payload,
    };
  },

  async get_hourly_forecast(input, context) {
    const duration = readRequiredInputString(input.duration, "duration");
    const locationKey = encodeURIComponent(readRequiredInputString(input.locationKey, "locationKey"));
    const payload = await accuweatherGetJson(
      {
        path: `/forecasts/v1/hourly/${duration}/${locationKey}`,
        query: {
          language: optionalString(input.language),
          details: optionalBoolean(input.details),
          metric: optionalBoolean(input.metric),
        },
      },
      context,
      "execute",
    );
    return {
      forecasts: readRequiredArray(payload, "AccuWeather hourly forecast response"),
      raw: payload,
    };
  },
};

export async function validateAccuweatherCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await accuweatherGetJson(
    {
      path: "/locations/v1/cities/autocomplete",
      query: {
        q: "New York",
      },
    },
    { apiKey, fetcher, signal },
    "validate",
  );
  const locations = Array.isArray(payload) ? payload.map(normalizeLocation) : [];

  return {
    profile: {
      accountId: "api_key",
      displayName: "AccuWeather API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: accuweatherApiBaseUrl,
      validationEndpoint: "/locations/v1/cities/autocomplete",
      validationLocationKey: locations[0]?.key,
    },
  };
}

async function accuweatherGetJson(
  input: { path: string; query?: Record<string, AccuweatherQueryValue> },
  context: AccuweatherActionContext,
  phase: AccuweatherRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(accuweatherUrl(input), {
      method: "GET",
      headers: accuweatherHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readAccuweatherPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `AccuWeather request failed: ${error.message}` : "AccuWeather request failed",
    );
  }

  if (!response.ok) {
    throw createAccuweatherError(response, payload, phase);
  }
  return payload;
}

function accuweatherUrl(input: { path: string; query?: Record<string, AccuweatherQueryValue> }): URL {
  const url = new URL(input.path, accuweatherApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function accuweatherHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "accept-encoding": "gzip,deflate",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readAccuweatherPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAccuweatherError(
  response: Response,
  payload: unknown,
  phase: AccuweatherRequestPhase,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.Message) ??
    optionalString(record?.message) ??
    response.statusText ??
    `AccuWeather request failed with ${response.status}`;

  if (response.status === 403 || response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function normalizeLocation(value: unknown): Record<string, unknown> {
  const record = readRequiredObject(value, "AccuWeather location");
  return {
    key: readRequiredString(record.Key, "Key"),
    localizedName: readRequiredString(record.LocalizedName, "LocalizedName"),
    englishName: readRequiredString(record.EnglishName, "EnglishName"),
    type: readRequiredString(record.Type, "Type"),
    rank: readRequiredInteger(record.Rank, "Rank"),
    country: optionalRecord(record.Country) ?? {},
    administrativeArea: optionalRecord(record.AdministrativeArea) ?? {},
    raw: record,
  };
}

function normalizeCondition(value: unknown): Record<string, unknown> {
  const record = readRequiredObject(value, "AccuWeather current condition");
  return {
    localObservationDateTime: readRequiredString(record.LocalObservationDateTime, "LocalObservationDateTime"),
    weatherText: readRequiredString(record.WeatherText, "WeatherText"),
    weatherIcon: readRequiredInteger(record.WeatherIcon, "WeatherIcon"),
    hasPrecipitation: readRequiredBoolean(record.HasPrecipitation, "HasPrecipitation"),
    precipitationType:
      record.PrecipitationType === null ? null : readRequiredString(record.PrecipitationType, "PrecipitationType"),
    isDayTime: readRequiredBoolean(record.IsDayTime, "IsDayTime"),
    temperature: optionalRecord(record.Temperature) ?? {},
    mobileLink: readRequiredString(record.MobileLink, "MobileLink"),
    link: readRequiredString(record.Link, "Link"),
    raw: record,
  };
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (result) {
    return result;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readRequiredInputNumber(value: unknown, fieldName: string): number {
  const result = optionalNumber(value);
  if (result !== undefined) {
    return result;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a number`);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (result !== undefined) {
    return result;
  }
  throw new ProviderRequestError(502, `AccuWeather ${fieldName} must be a string`);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `AccuWeather ${fieldName} must be an integer`);
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  throw new ProviderRequestError(502, `AccuWeather ${fieldName} must be a boolean`);
}

function readRequiredArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `${label} must be an array`);
}

function readRequiredObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, `${label} must be an object`);
}
