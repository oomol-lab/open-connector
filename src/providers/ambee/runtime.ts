import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const ambeeApiBaseUrl = "https://api.ambeedata.com";

type AmbeePhase = "validate" | "execute";

interface AmbeeActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AmbeeActionHandler = (input: Record<string, unknown>, context: AmbeeActionContext) => Promise<unknown>;

export const ambeeActionHandlers: Record<string, AmbeeActionHandler> = {
  geocode_by_place(input, context) {
    return geocodeByPlace(input, context);
  },
  reverse_geocode_by_lat_lng(input, context) {
    return reverseGeocodeByLatLng(input, context);
  },
  get_air_quality_by_lat_lng(input, context) {
    return getAirQualityByLatLng(input, context);
  },
  get_air_quality_forecast_by_lat_lng(input, context) {
    return getAirQualityForecastByLatLng(input, context);
  },
  get_air_quality_history_by_lat_lng(input, context) {
    return getAirQualityHistoryByLatLng(input, context);
  },
};

export async function validateAmbeeCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    apiKey: readRequiredString(input.apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const payload = await requestAmbeeJson(
    {
      path: "/geocode/by-place",
      query: {
        place: "New York",
      },
    },
    context,
    "validate",
  );

  const locations = extractLocationArray(payload, "Ambee geocode validation response");
  const firstLocation = optionalRecord(locations[0]);
  const firstAddress = optionalRecord(firstLocation?.address);
  const firstLocationLabel = optionalString(firstAddress?.label);

  return {
    profile: {
      accountId: "ambee",
      displayName: "Ambee API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/geocode/by-place",
      apiBaseUrl: ambeeApiBaseUrl,
      probeLocationCount: locations.length,
      firstLocationLabel,
    }),
  };
}

async function geocodeByPlace(input: Record<string, unknown>, context: AmbeeActionContext) {
  const payload = await requestAmbeeJson(
    {
      path: "/geocode/by-place",
      query: {
        place: readRequiredString(input.place, "place"),
      },
    },
    context,
    "execute",
  );

  return {
    locations: extractLocationArray(payload, "Ambee geocode response"),
  };
}

async function reverseGeocodeByLatLng(input: Record<string, unknown>, context: AmbeeActionContext) {
  const payload = await requestAmbeeJson(
    {
      path: "/geocode/reverse/by-lat-lng",
      query: coordinateQuery(input),
    },
    context,
    "execute",
  );

  const record = unwrapAmbeePayload(payload, "Ambee reverse geocode response");
  return compactObject({
    message: optionalString(record.message),
    locations: extractLocationArrayFromRecord(record, "Ambee reverse geocode response"),
  });
}

async function getAirQualityByLatLng(input: Record<string, unknown>, context: AmbeeActionContext) {
  const payload = await requestAmbeeJson(
    {
      path: "/latest/by-lat-lng",
      query: coordinateQuery(input),
    },
    context,
    "execute",
  );

  const record = unwrapAmbeePayload(payload, "Ambee air quality response");
  return compactObject({
    message: optionalString(record.message),
    stations: extractArrayField(record, "stations", "Ambee air quality response"),
  });
}

async function getAirQualityForecastByLatLng(input: Record<string, unknown>, context: AmbeeActionContext) {
  const payload = await requestAmbeeJson(
    {
      path: "/forecast/by-lat-lng",
      query: coordinateQuery(input),
    },
    context,
    "execute",
  );

  const record = unwrapAmbeePayload(payload, "Ambee air quality forecast response");
  return compactObject({
    message: optionalString(record.message),
    forecast: extractArrayField(record, "data", "Ambee air quality forecast response"),
  });
}

async function getAirQualityHistoryByLatLng(input: Record<string, unknown>, context: AmbeeActionContext) {
  const payload = await requestAmbeeJson(
    {
      path: "/history/by-lat-lng",
      query: {
        ...coordinateQuery(input),
        from: readRequiredString(input.from, "from"),
        to: readRequiredString(input.to, "to"),
      },
    },
    context,
    "execute",
  );

  const record = unwrapAmbeePayload(payload, "Ambee air quality history response");
  return compactObject({
    message: optionalString(record.message),
    history: extractArrayField(record, "data", "Ambee air quality history response"),
  });
}

async function requestAmbeeJson(
  input: {
    path: string;
    query: Record<string, string | number>;
  },
  context: AmbeeActionContext,
  phase: AmbeePhase,
) {
  const url = new URL(input.path, ambeeApiBaseUrl);
  for (const [key, value] of Object.entries(input.query)) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw createAmbeeTransportError(error);
  }

  const payload = await readAmbeePayload(response);
  if (!response.ok) {
    throw createAmbeeError(response.status, payload, phase);
  }

  return payload;
}

async function readAmbeePayload(response: Response) {
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

function createAmbeeError(status: number, payload: unknown, phase: AmbeePhase) {
  const message = readAmbeeMessage(payload) ?? `Ambee request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function createAmbeeTransportError(error: unknown) {
  return new ProviderRequestError(
    error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError") ? 504 : 502,
    error instanceof Error ? `Ambee request failed: ${error.message}` : "Ambee request failed",
  );
}

function readAmbeeMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message);
  if (directMessage) {
    return directMessage;
  }

  const data = optionalRecord(record.data);
  const dataMessage = optionalString(data?.message);
  if (dataMessage) {
    return dataMessage;
  }

  return optionalString(record.error);
}

function unwrapAmbeePayload(payload: unknown, label: string) {
  const record = requireRecord(payload, label);
  const nested = optionalRecord(record.data);
  const hasToolWrapperShape = typeof record.successful === "boolean" && nested;
  return hasToolWrapperShape ? nested : record;
}

function extractLocationArray(payload: unknown, label: string) {
  const record = unwrapAmbeePayload(payload, label);
  return extractLocationArrayFromRecord(record, label);
}

function extractLocationArrayFromRecord(record: Record<string, unknown>, label: string) {
  const rawLocations = Array.isArray(record.locations)
    ? record.locations
    : Array.isArray(record.data)
      ? record.data
      : undefined;

  if (!rawLocations) {
    throw new ProviderRequestError(502, `${label} is missing location results`);
  }

  return rawLocations.map((item, index) => requireRecord(item, `${label}.locations[${index}]`));
}

function extractArrayField(record: Record<string, unknown>, field: string, label: string) {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label}.${field} must be an array`);
  }

  return value.map((item, index) => requireRecord(item, `${label}.${field}[${index}]`));
}

function coordinateQuery(input: Record<string, unknown>) {
  return {
    lat: readRequiredNumber(input.lat, "lat"),
    lng: readRequiredNumber(input.lng, "lng"),
  };
}

function readRequiredString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, providerInputError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function readRequiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }

  return value as Record<string, unknown>;
}
