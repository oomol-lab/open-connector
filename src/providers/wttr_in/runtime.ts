import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalObjectArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const wttrInApiBaseUrl = "https://wttr.in";

type WttrInJsonFormat = "j1" | "j2";
type WttrInUnits = "metric" | "us";

interface WttrInActionContext {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface WttrInRequestInput {
  location?: string;
  format?: WttrInJsonFormat;
  lang?: string;
  units?: WttrInUnits;
}

interface WttrValue {
  value?: unknown;
}

export const wttrInActionHandlers: ProviderActionHandlers<"wttr_in", ProviderRuntimeHandler<WttrInActionContext>> = {
  get_weather(input, context) {
    return getWttrInWeather(input, context);
  },
};

export async function getWttrInWeather(
  input: Record<string, unknown>,
  context: WttrInActionContext,
): Promise<Record<string, unknown>> {
  const payload = await requestWttrInJson(
    {
      location: optionalString(input.location),
      format: readOptionalJsonFormat(input.format),
      lang: optionalString(input.lang),
      units: readOptionalUnits(input.units),
    },
    context,
  );

  return normalizeWttrInPayload(payload);
}

async function requestWttrInJson(input: WttrInRequestInput, context: WttrInActionContext): Promise<unknown> {
  const url = buildWttrInUrl(input);

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `failed to reach wttr.in: ${error instanceof Error ? error.message : "network error"}`,
    );
  }

  if (!response.ok) {
    const message = await readErrorMessage(response, "wttr.in request failed");
    throw new ProviderRequestError(response.status === 429 ? 429 : response.status, message);
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderRequestError(502, "failed to parse wttr.in JSON response");
  }
}

function buildWttrInUrl(input: WttrInRequestInput): URL {
  const encodedLocation =
    input.location === undefined
      ? ""
      : input.location
          .split("/")
          .map((segment) => encodeURIComponent(segment))
          .join("%2F")
          .replaceAll("%2C", ",");
  const url = new URL(`${wttrInApiBaseUrl}/${encodedLocation}`);
  url.searchParams.set("format", input.format ?? "j1");
  if (input.lang) {
    url.searchParams.set("lang", input.lang);
  }
  if (input.units === "metric") {
    url.searchParams.set("m", "");
  } else if (input.units === "us") {
    url.searchParams.set("u", "");
  }
  return url;
}

function normalizeWttrInPayload(payload: unknown): Record<string, unknown> {
  const root = asObject(payload);
  const current = firstObject(root.current_condition);
  if (!current) {
    throw new ProviderRequestError(502, "wttr.in response missing current_condition");
  }

  return {
    location: normalizeLocation(root),
    current: normalizeCurrent(current),
    forecast: optionalObjectArray(root.weather).map(normalizeForecastDay),
    raw: root,
  };
}

function normalizeLocation(root: Record<string, unknown>): Record<string, unknown> {
  const nearestArea = firstObject(root.nearest_area);
  const request = firstObject(root.request);
  return {
    name: firstValue(nearestArea?.areaName) ?? null,
    region: firstValue(nearestArea?.region) ?? null,
    country: firstValue(nearestArea?.country) ?? null,
    latitude: parseOptionalNumber(nearestArea?.latitude),
    longitude: parseOptionalNumber(nearestArea?.longitude),
    query: optionalString(request?.query) ?? null,
    type: optionalString(request?.type) ?? null,
  };
}

function normalizeCurrent(current: Record<string, unknown>): Record<string, unknown> {
  return {
    observationTime: optionalString(current.observation_time) ?? null,
    description: firstValue(current.weatherDesc)?.trim() ?? null,
    weatherCode: optionalString(current.weatherCode) ?? null,
    temperatureC: parseOptionalNumber(current.temp_C),
    temperatureF: parseOptionalNumber(current.temp_F),
    feelsLikeC: parseOptionalNumber(current.FeelsLikeC),
    feelsLikeF: parseOptionalNumber(current.FeelsLikeF),
    humidity: parseOptionalNumber(current.humidity),
    cloudCover: parseOptionalNumber(current.cloudcover),
    pressureMb: parseOptionalNumber(current.pressure),
    precipitationMm: parseOptionalNumber(current.precipMM),
    windSpeedKmph: parseOptionalNumber(current.windspeedKmph),
    windSpeedMiles: parseOptionalNumber(current.windspeedMiles),
    windDirectionDegree: parseOptionalNumber(current.winddirDegree),
    windDirection16Point: optionalString(current.winddir16Point) ?? null,
    uvIndex: parseOptionalNumber(current.uvIndex),
    visibilityKm: parseOptionalNumber(current.visibility),
    iconUrl: firstValue(current.weatherIconUrl) ?? null,
  };
}

function normalizeForecastDay(day: Record<string, unknown>): Record<string, unknown> {
  const astronomy = firstObject(day.astronomy);
  return {
    date: optionalString(day.date) ?? null,
    minTempC: parseOptionalNumber(day.mintempC),
    maxTempC: parseOptionalNumber(day.maxtempC),
    avgTempC: parseOptionalNumber(day.avgtempC),
    minTempF: parseOptionalNumber(day.mintempF),
    maxTempF: parseOptionalNumber(day.maxtempF),
    avgTempF: parseOptionalNumber(day.avgtempF),
    uvIndex: parseOptionalNumber(day.uvIndex),
    sunHours: parseOptionalNumber(day.sunHour),
    astronomy: {
      sunrise: optionalString(astronomy?.sunrise) ?? null,
      sunset: optionalString(astronomy?.sunset) ?? null,
      moonrise: optionalString(astronomy?.moonrise) ?? null,
      moonset: optionalString(astronomy?.moonset) ?? null,
      moonPhase: optionalString(astronomy?.moon_phase) ?? null,
      moonIllumination: parseOptionalNumber(astronomy?.moon_illumination),
    },
  };
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.text();
    const trimmed = body.trim();
    return trimmed.length > 0 ? trimmed : response.statusText || fallback;
  } catch {
    return response.statusText || fallback;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "wttr.in response must be a JSON object");
  }
  return record;
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  return optionalObjectArray(value)[0];
}

function firstValue(value: unknown): string | undefined {
  const first = firstObject(value) as WttrValue | undefined;
  return optionalString(first?.value);
}

function parseOptionalNumber(value: unknown): number | null {
  const stringValue = optionalString(value);
  if (stringValue === undefined) {
    return null;
  }

  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalJsonFormat(value: unknown): WttrInJsonFormat | undefined {
  return value === "j1" || value === "j2" ? value : undefined;
}

function readOptionalUnits(value: unknown): WttrInUnits | undefined {
  return value === "metric" || value === "us" ? value : undefined;
}
