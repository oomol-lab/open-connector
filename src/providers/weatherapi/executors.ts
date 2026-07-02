import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WeatherapiActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "weatherapi";
const weatherapiApiBaseUrl = "https://api.weatherapi.com/v1/";
const weatherapiDefaultRequestTimeoutMs = 30_000;
const weatherapiValidationQuery = "London";

type WeatherapiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

const weatherapiActionHandlers: Record<WeatherapiActionName, WeatherapiActionHandler> = {
  async search_locations(input, context): Promise<unknown> {
    const payload = await weatherapiRequestJson(
      "search.json",
      context.apiKey,
      {
        q: requiredString(input.query, "query"),
      },
      context,
      "execute",
    );

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "WeatherAPI search returned a non-array payload");
    }

    return {
      results: payload
        .map((item) => optionalRecord(item))
        .filter((item): item is Record<string, unknown> => item !== undefined)
        .map((item) => ({
          id: item.id,
          name: optionalString(item.name) ?? "",
          region: optionalString(item.region) ?? "",
          country: optionalString(item.country) ?? "",
          lat: item.lat,
          lon: item.lon,
          url: optionalString(item.url) ?? "",
          raw: item,
        })),
    };
  },
  async get_current_weather(input, context): Promise<unknown> {
    const payload = await weatherapiRequestJson(
      "current.json",
      context.apiKey,
      {
        q: requiredString(input.query, "query"),
        lang: optionalString(input.language),
      },
      context,
      "execute",
    );

    const record = optionalRecord(payload);
    const location = optionalRecord(record?.location);
    const current = optionalRecord(record?.current);
    if (!location || !current) {
      throw new ProviderRequestError(502, "WeatherAPI current weather response missing location or current");
    }

    return {
      location,
      current,
    };
  },
  async get_forecast(input, context): Promise<unknown> {
    const days = typeof input.days === "number" ? input.days : undefined;
    if (days === undefined) {
      throw new ProviderRequestError(400, "days is required");
    }

    const payload = await weatherapiRequestJson(
      "forecast.json",
      context.apiKey,
      {
        q: requiredString(input.query, "query"),
        days: String(days),
        dt: optionalString(input.date),
        lang: optionalString(input.language),
      },
      context,
      "execute",
    );

    const record = optionalRecord(payload);
    const location = optionalRecord(record?.location);
    const current = optionalRecord(record?.current);
    const forecast = optionalRecord(record?.forecast);
    const forecastDays = Array.isArray(forecast?.forecastday)
      ? forecast.forecastday
          .map((item) => optionalRecord(item))
          .filter((item): item is Record<string, unknown> => item !== undefined)
      : undefined;
    if (!location || !current || !forecastDays) {
      throw new ProviderRequestError(502, "WeatherAPI forecast response missing location, current, or forecast days");
    }

    return {
      location,
      current,
      forecastDays,
    };
  },
  async get_astronomy(input, context): Promise<unknown> {
    const payload = await weatherapiRequestJson(
      "astronomy.json",
      context.apiKey,
      {
        q: requiredString(input.query, "query"),
        dt: requiredString(input.date, "date"),
      },
      context,
      "execute",
    );

    const record = optionalRecord(payload);
    const location = optionalRecord(record?.location);
    const astronomy = optionalRecord(record?.astronomy);
    const astro = optionalRecord(astronomy?.astro);
    if (!location || !astro) {
      throw new ProviderRequestError(502, "WeatherAPI astronomy response missing location or astro");
    }

    return {
      location,
      astronomy: astro,
    };
  },
  async get_timezone(input, context): Promise<unknown> {
    const payload = await weatherapiRequestJson(
      "timezone.json",
      context.apiKey,
      {
        q: requiredString(input.query, "query"),
      },
      context,
      "execute",
    );

    const record = optionalRecord(payload);
    const location = optionalRecord(record?.location);
    if (!location) {
      throw new ProviderRequestError(502, "WeatherAPI timezone response missing location");
    }

    return {
      location,
      timezone: compactObject({
        tz_id: optionalString(location.tz_id),
        localtime_epoch: location.localtime_epoch,
        localtime: optionalString(location.localtime),
      }),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, weatherapiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await weatherapiRequestJson(
      "search.json",
      input.apiKey,
      {
        q: weatherapiValidationQuery,
      },
      {
        fetcher,
        signal,
      },
      "validate",
    );

    const firstLocation = Array.isArray(payload) ? optionalRecord(payload[0]) : undefined;
    const matchedLocationId = firstLocation?.id;
    const matchedLocationName = optionalString(firstLocation?.name);
    const matchedRegion = optionalString(firstLocation?.region);
    const matchedCountry = optionalString(firstLocation?.country);

    return {
      profile: {
        accountId: matchedLocationId === undefined ? "weatherapi:api_key" : String(matchedLocationId),
        displayName: matchedLocationName ?? "WeatherAPI API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/search.json",
        sampleQuery: weatherapiValidationQuery,
        matchedLocationId,
        matchedLocationName,
        matchedRegion,
        matchedCountry,
      }),
    };
  },
};

async function weatherapiRequestJson(
  path: string,
  apiKey: string,
  params: Record<string, string | undefined>,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
  phase: "validate" | "execute",
): Promise<unknown> {
  const url = weatherapiRequestUrl(path, apiKey, params);
  const timeout = createProviderTimeout(context.signal, weatherapiDefaultRequestTimeoutMs);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      signal: timeout.signal,
    });
    payload = await readWeatherapiPayload(response);
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `WeatherAPI ${path} request timed out after ${Math.max(
          1,
          Math.ceil(weatherapiDefaultRequestTimeoutMs / 1000),
        )} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `WeatherAPI request failed: ${error.message}` : "WeatherAPI request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createWeatherapiError(response.status, payload, phase);
  }

  return payload;
}

function weatherapiRequestUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const url = new URL(path, weatherapiApiBaseUrl);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readWeatherapiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "WeatherAPI returned invalid JSON");
  }
}

function createWeatherapiError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractWeatherapiMessage(payload) ?? `WeatherAPI request failed with ${status || 500}`;

  if (status === 401 && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractWeatherapiMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message);
}
