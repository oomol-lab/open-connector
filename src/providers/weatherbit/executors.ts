import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WeatherbitActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "weatherbit";
const weatherbitApiBaseUrl = "https://api.weatherbit.io";

type WeatherbitPhase = "validate" | "execute";
type WeatherbitQueryValue = string | number | boolean | undefined;
type WeatherbitActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const weatherbitActionHandlers: Record<WeatherbitActionName, WeatherbitActionHandler> = {
  get_current_weather(input, context): Promise<unknown> {
    return executeCurrentWeather(input, context, "execute");
  },
  get_daily_forecast(input, context): Promise<unknown> {
    return executeForecast("/v2.0/forecast/daily", buildDailyForecastQuery(input), context);
  },
  get_hourly_forecast(input, context): Promise<unknown> {
    return executeForecast("/v2.0/forecast/hourly", buildHourlyForecastQuery(input), context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, weatherbitActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: weatherbitApiBaseUrl,
  auth: { type: "api_key_query", name: "key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const result = await executeCurrentWeather(
      {
        city: "Raleigh",
        country: "US",
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
        accountId: "weatherbit",
        displayName: "Weatherbit API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v2.0/current",
        apiBaseUrl: weatherbitApiBaseUrl,
        authMethod: "query_key",
        probeLocation: "Raleigh, US",
        probeRecordCount: result.count,
      },
    };
  },
};

async function executeCurrentWeather(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: WeatherbitPhase,
): Promise<{ observations: Array<Record<string, unknown>>; count: number }> {
  const payload = await weatherbitJsonRequest("/v2.0/current", buildCurrentWeatherQuery(input), context, phase);
  const data = readWeatherbitData(payload, "current weather response");
  return {
    observations: data,
    count: optionalInteger(payload.count) ?? data.length,
  };
}

async function executeForecast(
  path: string,
  query: Record<string, WeatherbitQueryValue>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await weatherbitJsonRequest(path, query, context, "execute");
  return {
    city_name: readRequiredString(payload.city_name, "city_name"),
    country_code: readRequiredString(payload.country_code, "country_code"),
    latitude: readRequiredNumber(payload.lat, "lat"),
    longitude: readRequiredNumber(payload.lon, "lon"),
    timezone: readRequiredString(payload.timezone, "timezone"),
    forecast: readWeatherbitData(payload, "forecast response"),
  };
}

async function weatherbitJsonRequest(
  path: string,
  query: Record<string, WeatherbitQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: WeatherbitPhase,
): Promise<Record<string, unknown>> {
  const url = new URL(path, weatherbitApiBaseUrl);
  for (const [key, value] of Object.entries(compactObject({ ...query, key: context.apiKey }))) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Weatherbit request failed: ${error.message}` : "Weatherbit request failed",
    );
  }

  if (!response.ok) {
    throw buildWeatherbitError(response.status, payload, phase);
  }

  const record = requireObject(payload, "Weatherbit response");
  if (readWeatherbitEmbeddedError(record)) {
    throw buildWeatherbitError(response.status || 500, record, phase);
  }

  return record;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Weatherbit returned invalid JSON");
  }
}

function buildCurrentWeatherQuery(input: Record<string, unknown>): Record<string, WeatherbitQueryValue> {
  return {
    ...buildLocationQuery(input),
    lang: optionalString(input.language),
    units: optionalString(input.units),
    include: readOptionalInclude(input.include),
  };
}

function buildDailyForecastQuery(input: Record<string, unknown>): Record<string, WeatherbitQueryValue> {
  return {
    ...buildLocationQuery(input),
    lang: optionalString(input.language),
    units: optionalString(input.units),
    days: optionalInteger(input.days),
  };
}

function buildHourlyForecastQuery(input: Record<string, unknown>): Record<string, WeatherbitQueryValue> {
  return {
    ...buildLocationQuery(input),
    lang: optionalString(input.language),
    units: optionalString(input.units),
    hours: optionalInteger(input.hours),
  };
}

function buildLocationQuery(input: Record<string, unknown>): Record<string, WeatherbitQueryValue> {
  const latitude = optionalNumber(input.latitude);
  const longitude = optionalNumber(input.longitude);
  if (latitude !== undefined && longitude !== undefined) {
    return {
      lat: latitude,
      lon: longitude,
    };
  }

  return compactObject({
    city: optionalString(input.city),
    state: optionalString(input.state),
    country: optionalString(input.country),
    postal_code: optionalString(input.postal_code),
    city_id: optionalInteger(input.city_id),
  });
}

function readOptionalInclude(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => String(item)).join(",");
}

function readWeatherbitData(payload: Record<string, unknown>, context: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, `Weatherbit ${context} did not include data`);
  }

  return payload.data.map((item, index) => {
    const record = requireObject(item, `Weatherbit ${context} data[${index}]`);
    const datetime = optionalString(record.datetime) ?? optionalString(record.timestamp_utc);
    if (!datetime) {
      throw new ProviderRequestError(502, `Weatherbit ${context} data[${index}] did not include datetime`);
    }

    return {
      ...record,
      datetime,
    };
  });
}

function buildWeatherbitError(status: number, payload: unknown, phase: WeatherbitPhase): ProviderRequestError {
  const normalizedStatus = status >= 400 ? status : 502;
  const message = extractWeatherbitMessage(payload) ?? `Weatherbit request failed with ${normalizedStatus}`;

  if (normalizedStatus === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (normalizedStatus === 401 || normalizedStatus === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : normalizedStatus, message, payload);
  }
  if (normalizedStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(normalizedStatus, message, payload);
}

function extractWeatherbitMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.status_message);
}

function readWeatherbitEmbeddedError(payload: Record<string, unknown>): string | undefined {
  return extractWeatherbitMessage(payload);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Weatherbit response missing ${fieldName}`);
  }
  return text;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw new ProviderRequestError(502, `Weatherbit response missing ${fieldName}`);
  }
  return number;
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${name} is not a JSON object`);
  }
  return record;
}
