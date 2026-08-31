import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "aviationstack";
const aviationstackApiBaseUrl = "https://api.aviationstack.com/v1";

type AviationstackPhase = "validate" | "execute";
type AviationstackQueryValue = string | number | undefined;
type AviationstackActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const collectionActionConfig: Record<
  string,
  {
    path: string;
    outputKey: string;
    normalize: (input: Record<string, unknown>) => Record<string, unknown>;
  }
> = {
  list_airports: { path: "/airports", outputKey: "airports", normalize: normalizeAirport },
  list_airlines: { path: "/airlines", outputKey: "airlines", normalize: normalizeAirline },
  list_airplanes: { path: "/airplanes", outputKey: "airplanes", normalize: normalizeAirplane },
  list_aircraft_types: { path: "/aircraft_types", outputKey: "aircraftTypes", normalize: normalizeAircraftType },
  list_taxes: { path: "/taxes", outputKey: "taxes", normalize: normalizeTax },
  list_cities: { path: "/cities", outputKey: "cities", normalize: normalizeCity },
  list_countries: { path: "/countries", outputKey: "countries", normalize: normalizeCountry },
};

export const aviationstackActionHandlers: ProviderActionHandlers<"aviationstack", AviationstackActionHandler> = {
  search_flights(input, context) {
    return searchFlights(input, context);
  },
  search_routes(input, context) {
    return searchRoutes(input, context);
  },
  list_airports(input, context) {
    return listCollection(input, context, collectionActionConfig.list_airports);
  },
  list_airlines(input, context) {
    return listCollection(input, context, collectionActionConfig.list_airlines);
  },
  list_airplanes(input, context) {
    return listCollection(input, context, collectionActionConfig.list_airplanes);
  },
  list_aircraft_types(input, context) {
    return listCollection(input, context, collectionActionConfig.list_aircraft_types);
  },
  list_taxes(input, context) {
    return listCollection(input, context, collectionActionConfig.list_taxes);
  },
  list_cities(input, context) {
    return listCollection(input, context, collectionActionConfig.list_cities);
  },
  list_countries(input, context) {
    return listCollection(input, context, collectionActionConfig.list_countries);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: aviationstackActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAviationstackJson({
      path: "/airports",
      query: { limit: 1 },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const pagination = normalizePagination(requiredRecord(payload.pagination, "pagination", providerResponseError));
    const firstAirport = readFirstDataObject(payload);

    return {
      profile: {
        accountId: "aviationstack",
        displayName: "Aviationstack API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/airports",
        apiBaseUrl: aviationstackApiBaseUrl,
        airportCount: pagination.total,
        validationLimit: pagination.limit,
        firstAirportName: rawStringOrNull(firstAirport?.airport_name) ?? undefined,
        firstAirportIata: rawStringOrNull(firstAirport?.iata_code) ?? undefined,
      }),
    };
  },
};

async function searchFlights(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAviationstackJson({
    path: "/flights",
    query: {
      limit: readOptionalInteger(input.limit),
      offset: readOptionalInteger(input.offset),
      flight_date: readOptionalString(input.flightDate),
      flight_status: readOptionalString(input.flightStatus),
      dep_iata: readOptionalString(input.depIata),
      arr_iata: readOptionalString(input.arrIata),
      dep_icao: readOptionalString(input.depIcao),
      arr_icao: readOptionalString(input.arrIcao),
      airline_name: readOptionalString(input.airlineName),
      airline_iata: readOptionalString(input.airlineIata),
      airline_icao: readOptionalString(input.airlineIcao),
      flight_number: readOptionalString(input.flightNumber),
      flight_iata: readOptionalString(input.flightIata),
      flight_icao: readOptionalString(input.flightIcao),
      min_delay_dep: readOptionalInteger(input.minDelayDep),
      min_delay_arr: readOptionalInteger(input.minDelayArr),
      max_delay_dep: readOptionalInteger(input.maxDelayDep),
      max_delay_arr: readOptionalInteger(input.maxDelayArr),
    },
    context,
    phase: "execute",
  });

  return {
    flights: normalizeDataArray(payload).map((item) => normalizeFlight(item)),
    pagination: normalizePagination(requiredRecord(payload.pagination, "pagination", providerResponseError)),
  };
}

async function searchRoutes(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAviationstackJson({
    path: "/routes",
    query: {
      limit: readOptionalInteger(input.limit),
      offset: readOptionalInteger(input.offset),
      dep_iata: readOptionalString(input.depIata),
      arr_iata: readOptionalString(input.arrIata),
      dep_icao: readOptionalString(input.depIcao),
      arr_icao: readOptionalString(input.arrIcao),
      airline_iata: readOptionalString(input.airlineIata),
      airline_icao: readOptionalString(input.airlineIcao),
      flight_number: readOptionalString(input.flightNumber),
    },
    context,
    phase: "execute",
  });

  return {
    routes: normalizeDataArray(payload).map((item) => normalizeRoute(item)),
    pagination: normalizePagination(requiredRecord(payload.pagination, "pagination", providerResponseError)),
  };
}

async function listCollection(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  config: {
    path: string;
    outputKey: string;
    normalize: (input: Record<string, unknown>) => Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const payload = await requestAviationstackJson({
    path: config.path,
    query: {
      limit: readOptionalInteger(input.limit),
      offset: readOptionalInteger(input.offset),
      search: readOptionalString(input.search),
    },
    context,
    phase: "execute",
  });

  return {
    [config.outputKey]: normalizeDataArray(payload).map((item) => config.normalize(item)),
    pagination: normalizePagination(requiredRecord(payload.pagination, "pagination", providerResponseError)),
  };
}

async function requestAviationstackJson(input: {
  path: string;
  query: Record<string, AviationstackQueryValue>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: AviationstackPhase;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildAviationstackUrl(input.path, input.query, input.context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Aviationstack request failed: ${error.message}` : "Aviationstack request failed",
    );
  }

  const payload = await readAviationstackPayload(response);
  const errorObject = optionalRecord(payload.error);
  if (!response.ok) {
    throw createAviationstackError(response.status, payload, input.phase);
  }
  if (errorObject) {
    throw createAviationstackError(readAviationstackErrorStatus(errorObject), payload, input.phase);
  }

  return payload;
}

function buildAviationstackUrl(path: string, query: Record<string, AviationstackQueryValue>, apiKey: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${aviationstackApiBaseUrl}/`);
  setSearchParams(url, stringifyQuery({ ...query, access_key: apiKey }));
  return url;
}

async function readAviationstackPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Aviationstack returned an empty response");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Aviationstack returned invalid JSON");
  }

  return requiredRecord(payload, "Aviationstack payload", providerResponseError);
}

function createAviationstackError(
  status: number,
  payload: Record<string, unknown>,
  phase: AviationstackPhase,
): ProviderRequestError {
  const message = readAviationstackErrorMessage(payload) ?? `Aviationstack request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status || 401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function readAviationstackErrorMessage(payload: Record<string, unknown>): string | undefined {
  const errorObject = optionalRecord(payload.error);
  return optionalString(errorObject?.message) ?? optionalString(payload.message);
}

function readAviationstackErrorStatus(errorObject: Record<string, unknown>): number {
  const status = optionalNumber(errorObject.status);
  return typeof status === "number" && Number.isInteger(status) && status >= 400 ? status : 502;
}

function readFirstDataObject(payload: Record<string, unknown>): Record<string, unknown> | undefined {
  return normalizeDataArray(payload)[0];
}

function normalizeDataArray(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "Aviationstack response is missing data");
  }
  return payload.data.map((item, index) => requiredRecord(item, `data[${index}]`, providerResponseError));
}

function normalizePagination(input: Record<string, unknown>): Record<string, number> {
  return {
    limit: readRequiredInteger(input.limit, "pagination.limit"),
    offset: readRequiredInteger(input.offset, "pagination.offset"),
    count: readRequiredInteger(input.count, "pagination.count"),
    total: readRequiredInteger(input.total, "pagination.total"),
  };
}

function normalizeFlight(input: Record<string, unknown>): Record<string, unknown> {
  const departure = optionalRecord(input.departure);
  const arrival = optionalRecord(input.arrival);
  const airline = optionalRecord(input.airline);
  const flight = optionalRecord(input.flight);
  const aircraft = optionalRecord(input.aircraft);
  const live = optionalRecord(input.live);

  return {
    flightDate: rawStringOrNull(input.flight_date),
    flightStatus: rawStringOrNull(input.flight_status),
    departure: normalizeAirportEndpoint(departure),
    arrival: normalizeAirportEndpoint(arrival),
    airline: normalizeAirlineSummary(airline),
    flight: normalizeFlightNumber(flight),
    aircraft: aircraft ? normalizeAircraftSummary(aircraft) : null,
    live: live ? normalizeLivePosition(live) : null,
    raw: input,
  };
}

function normalizeAirportEndpoint(input: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    airport: rawStringOrNull(input?.airport),
    timezone: rawStringOrNull(input?.timezone),
    iata: rawStringOrNull(input?.iata),
    icao: rawStringOrNull(input?.icao),
    terminal: rawStringOrNull(input?.terminal),
    gate: rawStringOrNull(input?.gate),
    baggage: rawStringOrNull(input?.baggage),
    delay: readNullableInteger(input?.delay),
    scheduled: rawStringOrNull(input?.scheduled),
    estimated: rawStringOrNull(input?.estimated),
    actual: rawStringOrNull(input?.actual),
    estimatedRunway: rawStringOrNull(input?.estimated_runway),
    actualRunway: rawStringOrNull(input?.actual_runway),
  };
}

function normalizeAirlineSummary(input: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    name: rawStringOrNull(input?.name),
    iata: rawStringOrNull(input?.iata),
    icao: rawStringOrNull(input?.icao),
  };
}

function normalizeFlightNumber(input: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    number: rawStringOrNull(input?.number),
    iata: rawStringOrNull(input?.iata),
    icao: rawStringOrNull(input?.icao),
    codeshared: optionalRecord(input?.codeshared) ?? null,
  };
}

function normalizeAircraftSummary(input: Record<string, unknown>): Record<string, unknown> {
  return pickNullableStrings(input, {
    registration: "registration",
    iata: "iata",
    icao: "icao",
    icao24: "icao24",
  });
}

function normalizeLivePosition(input: Record<string, unknown>): Record<string, unknown> {
  return {
    updated: rawStringOrNull(input.updated),
    latitude: nullableNumber(input.latitude),
    longitude: nullableNumber(input.longitude),
    altitude: nullableNumber(input.altitude),
    direction: nullableNumber(input.direction),
    speedHorizontal: nullableNumber(input.speed_horizontal),
    speedVertical: nullableNumber(input.speed_vertical),
    isGround: typeof input.is_ground === "boolean" ? input.is_ground : null,
  };
}

function normalizeRoute(input: Record<string, unknown>): Record<string, unknown> {
  return {
    departureAirport: rawStringOrNull(input.departure_airport),
    departureIata: rawStringOrNull(input.departure_iata),
    departureIcao: rawStringOrNull(input.departure_icao),
    arrivalAirport: rawStringOrNull(input.arrival_airport),
    arrivalIata: rawStringOrNull(input.arrival_iata),
    arrivalIcao: rawStringOrNull(input.arrival_icao),
    airlineName: rawStringOrNull(input.airline_name),
    airlineIata: rawStringOrNull(input.airline_iata),
    airlineIcao: rawStringOrNull(input.airline_icao),
    flightNumber: rawStringOrNull(input.flight_number),
    raw: input,
  };
}

function normalizeAirport(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: rawStringOrNull(input.id),
    name: rawStringOrNull(input.airport_name),
    iataCode: rawStringOrNull(input.iata_code),
    icaoCode: rawStringOrNull(input.icao_code),
    latitude: nullableNumber(input.latitude),
    longitude: nullableNumber(input.longitude),
    timezone: rawStringOrNull(input.timezone),
    gmt: rawStringOrNull(input.gmt),
    countryName: rawStringOrNull(input.country_name),
    countryIso2: rawStringOrNull(input.country_iso2),
    cityIataCode: rawStringOrNull(input.city_iata_code),
    raw: input,
  };
}

function normalizeAirline(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: rawStringOrNull(input.id),
    name: rawStringOrNull(input.airline_name),
    iataCode: rawStringOrNull(input.iata_code),
    icaoCode: rawStringOrNull(input.icao_code),
    callsign: rawStringOrNull(input.callsign),
    countryName: rawStringOrNull(input.country_name),
    status: rawStringOrNull(input.status),
    raw: input,
  };
}

function normalizeAirplane(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: rawStringOrNull(input.id),
    registrationNumber: rawStringOrNull(input.registration_number),
    productionLine: rawStringOrNull(input.production_line),
    modelName: rawStringOrNull(input.model_name),
    modelCode: rawStringOrNull(input.model_code),
    planeStatus: rawStringOrNull(input.plane_status),
    airlineIataCode: rawStringOrNull(input.airline_iata_code),
    airlineIcaoCode: rawStringOrNull(input.airline_icao_code),
    iataType: rawStringOrNull(input.iata_type),
    raw: input,
  };
}

function normalizeAircraftType(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: rawStringOrNull(input.id),
    iataCode: rawStringOrNull(input.iata_code),
    aircraftName: rawStringOrNull(input.aircraft_name),
    planeTypeId: rawStringOrNull(input.plane_type_id),
    raw: input,
  };
}

function normalizeTax(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: rawStringOrNull(input.id),
    taxId: rawStringOrNull(input.tax_id),
    taxName: rawStringOrNull(input.tax_name),
    iataCode: rawStringOrNull(input.iata_code),
    raw: input,
  };
}

function normalizeCity(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: rawStringOrNull(input.id),
    cityId: rawStringOrNull(input.city_id),
    name: rawStringOrNull(input.city_name),
    iataCode: rawStringOrNull(input.iata_code),
    countryIso2: rawStringOrNull(input.country_iso2),
    latitude: nullableNumber(input.latitude),
    longitude: nullableNumber(input.longitude),
    timezone: rawStringOrNull(input.timezone),
    gmt: rawStringOrNull(input.gmt),
    raw: input,
  };
}

function normalizeCountry(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: rawStringOrNull(input.id),
    countryId: rawStringOrNull(input.country_id),
    name: rawStringOrNull(input.country_name),
    iso2: rawStringOrNull(input.country_iso2),
    iso3: rawStringOrNull(input.country_iso3),
    continent: rawStringOrNull(input.continent),
    capital: rawStringOrNull(input.capital),
    currencyCode: rawStringOrNull(input.currency_code),
    currencyName: rawStringOrNull(input.currency_name),
    phonePrefix: rawStringOrNull(input.phone_prefix),
    population: rawStringOrNull(input.population),
    raw: input,
  };
}

function pickNullableStrings(input: Record<string, unknown>, fields: Record<string, string>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [target, source] of Object.entries(fields)) {
    output[target] = rawStringOrNull(input[source]);
  }
  return output;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const numeric = optionalNumber(value);
  if (numeric === undefined || !Number.isInteger(numeric)) {
    throw new ProviderRequestError(502, `Aviationstack response is missing ${fieldName}`);
  }
  return numeric;
}

function readNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = optionalNumber(value);
  return numeric !== undefined && Number.isInteger(numeric) ? numeric : null;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}

function stringifyQuery(input: Record<string, AviationstackQueryValue>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === undefined ? undefined : String(value)]),
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
