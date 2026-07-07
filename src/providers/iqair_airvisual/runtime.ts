import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { IqairAirvisualActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const iqairAirvisualApiBaseUrl = "https://api.airvisual.com/v2";

type IqairAirvisualPhase = "validate" | "execute";
type IqairAirvisualQueryValue = string | number | undefined;

export const iqairAirvisualActionHandlers: Record<
  IqairAirvisualActionName,
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_supported_countries(_input, context) {
    return listSupportedCountries(context, "execute");
  },
  list_supported_states(input, context) {
    return listSupportedStates(input, context);
  },
  list_supported_cities(input, context) {
    return listSupportedCities(input, context);
  },
  get_nearest_city(input, context) {
    return getNearestCity(input, context);
  },
  get_city_data(input, context) {
    return getCityData(input, context);
  },
};

export async function validateIqairAirvisualCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const result = await listSupportedCountries(
    {
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "iqair_airvisual",
      displayName: "IQAir AirVisual API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/countries",
      apiBaseUrl: iqairAirvisualApiBaseUrl,
      authMethod: "query_key",
      supportedCountryCount: result.count,
    },
  };
}

async function listSupportedCountries(
  context: ApiKeyProviderContext,
  phase: IqairAirvisualPhase,
): Promise<{ countries: Array<Record<string, string>>; count: number }> {
  const data = await iqairAirvisualJsonRequest({
    path: "/countries",
    query: {},
    context,
    phase,
  });
  const countries = normalizeNamedObjects(data, "country", "IQAir AirVisual countries response");
  return {
    countries,
    count: countries.length,
  };
}

async function listSupportedStates(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<{ states: Array<Record<string, string>>; count: number }> {
  const data = await iqairAirvisualJsonRequest({
    path: "/states",
    query: {
      country: requiredString(input.country, "country"),
    },
    context,
    phase: "execute",
  });
  const states = normalizeNamedObjects(data, "state", "IQAir AirVisual states response");
  return {
    states,
    count: states.length,
  };
}

async function listSupportedCities(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<{ cities: Array<Record<string, string>>; count: number }> {
  const data = await iqairAirvisualJsonRequest({
    path: "/cities",
    query: {
      country: requiredString(input.country, "country"),
      state: requiredString(input.state, "state"),
    },
    context,
    phase: "execute",
  });
  const cities = normalizeNamedObjects(data, "city", "IQAir AirVisual cities response");
  return {
    cities,
    count: cities.length,
  };
}

async function getNearestCity(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<{ data: Record<string, unknown> }> {
  const data = await iqairAirvisualJsonRequest({
    path: "/nearest_city",
    query: buildCoordinateQuery(input),
    context,
    phase: "execute",
  });
  return {
    data: normalizeCityData(data, "IQAir AirVisual nearest city response"),
  };
}

async function getCityData(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<{ data: Record<string, unknown> }> {
  const data = await iqairAirvisualJsonRequest({
    path: "/city",
    query: {
      country: requiredString(input.country, "country"),
      state: requiredString(input.state, "state"),
      city: requiredString(input.city, "city"),
    },
    context,
    phase: "execute",
  });
  return {
    data: normalizeCityData(data, "IQAir AirVisual city response"),
  };
}

async function iqairAirvisualJsonRequest(input: {
  path: string;
  query: Record<string, IqairAirvisualQueryValue>;
  context: ApiKeyProviderContext;
  phase: IqairAirvisualPhase;
}): Promise<unknown> {
  const url = new URL(normalizeEndpointPath(input.path), ensureTrailingSlash(iqairAirvisualApiBaseUrl));
  for (const [key, value] of Object.entries(compactObject({ ...input.query, key: input.context.apiKey }))) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readIqairAirvisualPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `IQAir AirVisual request failed: ${error.message}` : "IQAir AirVisual request failed",
    );
  }

  if (!response.ok) {
    throw buildIqairAirvisualError(response.status, payload, input.phase);
  }

  const record = readResponseRecord(payload);
  if (optionalString(record.status) !== "success") {
    throw buildIqairAirvisualError(response.status, record, input.phase);
  }
  if (!("data" in record)) {
    throw new ProviderRequestError(502, "IQAir AirVisual response did not include data");
  }

  return record.data;
}

async function readIqairAirvisualPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "IQAir AirVisual returned invalid JSON");
  }
}

function normalizeNamedObjects(data: unknown, fieldName: string, context: string): Array<Record<string, string>> {
  const records = readArray(data, context);
  return records.map((item, index) => {
    const record = readRecord(item, `${context} data[${index}]`);
    return {
      [fieldName]: readRequiredResponseString(record[fieldName], `${fieldName} at index ${index}`),
    };
  });
}

function normalizeCityData(data: unknown, context: string): Record<string, unknown> {
  const record = readRecord(data, context);
  return compactObject({
    name: readOptionalNonEmptyString(record.name),
    city: readRequiredResponseString(record.city, "city"),
    state: readRequiredResponseString(record.state, "state"),
    country: readRequiredResponseString(record.country, "country"),
    location: readOptionalRecord(record.location),
    current: readOptionalRecord(record.current),
    units: readOptionalRecord(record.units),
    forecasts: readOptionalArray(record.forecasts),
    forecasts_daily: readOptionalArray(record.forecasts_daily),
    history: readOptionalRecord(record.history),
  });
}

function buildCoordinateQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  const hasLatitude = input.latitude !== undefined;
  const hasLongitude = input.longitude !== undefined;
  if (hasLatitude !== hasLongitude) {
    throw new ProviderRequestError(400, "Provide both latitude and longitude, or omit both to use IP geolocation.");
  }

  return compactObject({
    lat: optionalNumber(input.latitude),
    lon: optionalNumber(input.longitude),
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeEndpointPath(value: string): string {
  return value.startsWith("/") ? value.slice(1) : value;
}

function readResponseRecord(payload: unknown): Record<string, unknown> {
  return readRecord(payload, "IQAir AirVisual response");
}

function readArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${context} did not include an array`);
  }
  return value;
}

function readRecord(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} did not include an object`);
  }
  return record;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return optionalRecord(value);
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  return optionalString(value);
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  const text = readOptionalNonEmptyString(value);
  if (!text) {
    throw new ProviderRequestError(502, `IQAir AirVisual response missing ${fieldName}`);
  }
  return text;
}

function buildIqairAirvisualError(status: number, payload: unknown, phase: IqairAirvisualPhase): ProviderRequestError {
  const normalizedStatus = status >= 400 ? status : 502;
  const code = extractIqairAirvisualCode(payload);
  const message = code
    ? `IQAir AirVisual API returned ${code}`
    : `IQAir AirVisual request failed with ${normalizedStatus}`;

  if (code === "call_limit_reached" || code === "too_many_requests" || normalizedStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (code === "incorrect_api_key" || code === "api_key_expired") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (code === "ip_location_failed" || code === "no_nearest_station") {
    return new ProviderRequestError(400, message, payload);
  }

  if (normalizedStatus === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  if (code === "feature_not_available") {
    return new ProviderRequestError(403, message, payload);
  }

  return new ProviderRequestError(normalizedStatus, message, payload);
}

function extractIqairAirvisualCode(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const dataRecord = optionalRecord(record.data);
  return (
    optionalString(dataRecord?.message) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    readStatusCode(record.status)
  );
}

function readStatusCode(value: unknown): string | undefined {
  const status = optionalString(value);
  if (!status || status === "fail") {
    return undefined;
  }
  return status;
}
