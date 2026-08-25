import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const solcastApiBaseUrl: string = "https://api.solcast.com.au";

type SolcastPhase = "validate" | "execute";
type SolcastQueryValue = string | number | boolean | undefined;
type SolcastActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const validationProbe = {
  latitude: -33.8567,
  longitude: 151.2152,
  hours: 1,
  period: "PT30M",
  output_parameters: "air_temp,dni,ghi",
};

export const solcastActionHandlers: ProviderActionHandlers<"solcast", SolcastActionHandler> = {
  get_radiation_and_weather_forecast(input, context) {
    return executeTimeseriesRequest(
      "/data/forecast/radiation_and_weather",
      buildForecastQuery(input),
      context,
      "execute",
    );
  },
  get_radiation_and_weather_live_estimated_actuals(input, context) {
    return executeTimeseriesRequest("/data/live/radiation_and_weather", buildLiveQuery(input), context, "execute");
  },
  get_radiation_and_weather_historic(input, context) {
    return executeTimeseriesRequest(
      "/data/historic/radiation_and_weather",
      buildHistoricQuery(input),
      context,
      "execute",
    );
  },
};

export async function validateSolcastCredential(context: ApiKeyProviderContext): Promise<CredentialValidationResult> {
  const result = await executeTimeseriesRequest(
    "/data/forecast/radiation_and_weather",
    validationProbe,
    context,
    "validate",
  );
  return {
    profile: {
      accountId: "solcast",
      displayName: "Solcast API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/data/forecast/radiation_and_weather",
      apiBaseUrl: solcastApiBaseUrl,
      authMethod: "bearer",
      probeLocation: "Sydney Opera House",
      probeRecordCount: readRecordCount(result),
    },
  };
}

async function executeTimeseriesRequest(
  path: string,
  query: Record<string, SolcastQueryValue>,
  context: ApiKeyProviderContext,
  phase: SolcastPhase,
): Promise<unknown> {
  const payload = await solcastJsonRequest(path, query, context, phase);
  return normalizeTimeseriesPayload(payload);
}

async function solcastJsonRequest(
  path: string,
  query: Record<string, SolcastQueryValue>,
  context: ApiKeyProviderContext,
  phase: SolcastPhase,
): Promise<Record<string, unknown>> {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${solcastApiBaseUrl}/`);
  for (const [key, value] of Object.entries(compactObject({ ...query, format: "json" }))) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Solcast request failed: ${error.message}` : "Solcast request failed",
    );
  }

  if (!response.ok) {
    throw buildSolcastError(response.status, payload, phase);
  }
  if (response.status === 202 && payload == null) {
    return {
      message: "Solcast accepted the request but did not return any records.",
    };
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Solcast returned a non-object JSON response");
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
    throw new ProviderRequestError(502, "Solcast returned invalid JSON");
  }
}

function normalizeTimeseriesPayload(payload: Record<string, unknown>): unknown {
  const records = readOptionalRecordArray(payload.forecasts) ?? readOptionalRecordArray(payload.estimated_actuals);
  const message = extractSolcastMessage(payload);
  if (records) {
    return compactObject({ records, message });
  }
  if (message) {
    return { records: [], message };
  }
  throw new ProviderRequestError(502, "Solcast response did not include forecast or estimated actual records");
}

function buildForecastQuery(input: Record<string, unknown>): Record<string, SolcastQueryValue> {
  return compactObject({
    latitude: readRequiredNumber(input.latitude, "latitude"),
    longitude: readRequiredNumber(input.longitude, "longitude"),
    hours: optionalInteger(input.hours),
    period: optionalString(input.period),
    output_parameters: optionalString(input.output_parameters),
  });
}

function buildLiveQuery(input: Record<string, unknown>): Record<string, SolcastQueryValue> {
  return buildForecastQuery(input);
}

function buildHistoricQuery(input: Record<string, unknown>): Record<string, SolcastQueryValue> {
  if (input.end === undefined && input.duration === undefined) {
    throw new ProviderRequestError(400, "Either end or duration is required.");
  }
  return compactObject({
    latitude: readRequiredNumber(input.latitude, "latitude"),
    longitude: readRequiredNumber(input.longitude, "longitude"),
    start: requiredString(input.start, "start", (message) => new ProviderRequestError(400, message)),
    end: optionalString(input.end),
    duration: optionalString(input.duration),
    period: optionalString(input.period),
    output_parameters: optionalString(input.output_parameters),
    time_zone: readOptionalTimeZone(input.time_zone),
  });
}

function buildSolcastError(status: number, payload: unknown, _phase: SolcastPhase): ProviderRequestError {
  const message = extractSolcastMessage(payload) ?? `Solcast request failed with ${status || 500}`;
  if (status === 400 || status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractSolcastMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (Array.isArray(record.errors)) {
    for (const value of record.errors) {
      if (typeof value === "string" && value.trim() !== "") {
        return value;
      }
      const errorRecord = optionalRecord(value);
      const nestedMessage = optionalString(errorRecord?.message);
      if (nestedMessage) {
        return nestedMessage;
      }
    }
  }
  return optionalString(record.message) ?? optionalString(record.response_message) ?? optionalString(record.error);
}

function readRecordCount(value: unknown): number {
  const record = requiredRecord(value, "result", (message) => new ProviderRequestError(502, message));
  const records = readOptionalRecordArray(record.records);
  return records?.length ?? 0;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be a number`);
  }
  return parsed;
}

function readOptionalTimeZone(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < -13 || value > 13 || Math.round(value * 4) !== value * 4) {
      throw new ProviderRequestError(400, "time_zone must use 0.25 hour increments from -13 to 13");
    }
    return String(value);
  }
  return optionalString(value);
}

function readOptionalRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, "Solcast returned a non-object record");
    }
    return record;
  });
}
