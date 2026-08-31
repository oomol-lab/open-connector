import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "stormglass_io";
const stormglassApiBaseUrl = "https://api.stormglass.io";

type StormglassPhase = "validate" | "execute";
type StormglassActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const stormglassIoActionHandlers: ProviderActionHandlers<"stormglass_io", StormglassActionHandler> = {
  get_weather_point(input, context) {
    return executeWeatherPoint(input, context, "execute");
  },
  get_tide_extremes(input, context) {
    return executeTideExtremes(input, context);
  },
  get_tide_sea_level(input, context) {
    return executeTideSeaLevel(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, stormglassIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await executeWeatherPoint(
      {
        lat: 58.7984,
        lng: 17.8081,
        params: ["windSpeed"],
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const meta = optionalRecord(result.meta) ?? {};
    return {
      profile: {
        accountId: "stormglass_io",
        displayName: "Stormglass API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v2/weather/point",
        apiBaseUrl: stormglassApiBaseUrl,
        authHeader: "Authorization",
        probeLat: 58.7984,
        probeLng: 17.8081,
        probeParams: ["windSpeed"],
        dailyQuota: optionalNumber(meta.dailyQuota) ?? null,
        requestCount: optionalNumber(meta.requestCount) ?? null,
      },
    };
  },
};

async function executeWeatherPoint(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: StormglassPhase,
): Promise<Record<string, unknown>> {
  const payload = await stormglassJsonRequest("/v2/weather/point", buildWeatherPointQuery(input), context, phase);
  return {
    hours: objectArray(payload.hours, "hours", providerResponseError),
    meta: optionalRecord(payload.meta) ?? {},
  };
}

async function executeTideExtremes(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const payload = await stormglassJsonRequest(
    "/v2/tide/extremes/point",
    buildTidePointQuery(input),
    context,
    "execute",
  );
  return {
    extremes: objectArray(payload.data, "data", providerResponseError),
    meta: optionalRecord(payload.meta) ?? {},
  };
}

async function executeTideSeaLevel(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const payload = await stormglassJsonRequest(
    "/v2/tide/sea-level/point",
    buildTidePointQuery(input),
    context,
    "execute",
  );
  return {
    seaLevels: objectArray(payload.data, "data", providerResponseError),
    meta: optionalRecord(payload.meta) ?? {},
  };
}

async function stormglassJsonRequest(
  path: string,
  query: Record<string, string | number | undefined>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: StormglassPhase,
): Promise<Record<string, unknown>> {
  const url = new URL(path, stormglassApiBaseUrl);
  for (const [key, value] of Object.entries(compactObject(query))) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      isStormglassTimeoutError(error) ? 504 : 502,
      error instanceof Error ? `stormglass request failed: ${error.message}` : "stormglass request failed",
    );
  }

  if (!response.ok) {
    throw buildStormglassError(response.status, payload, phase);
  }
  return readRequiredObject(payload, "Stormglass response");
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Stormglass returned invalid JSON");
  }
}

function buildWeatherPointQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    lat: readRequiredNumber(input.lat, "lat"),
    lng: readRequiredNumber(input.lng, "lng"),
    params: readRequiredStringArray(input.params, "params").join(","),
    start: readOptionalTimeValue(input.start),
    end: readOptionalTimeValue(input.end),
    source: readOptionalStringArray(input.source)?.join(","),
  });
}

function buildTidePointQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    lat: readRequiredNumber(input.lat, "lat"),
    lng: readRequiredNumber(input.lng, "lng"),
    start: readOptionalTimeValue(input.start),
    end: readOptionalTimeValue(input.end),
    datum: optionalString(input.datum),
  });
}

function buildStormglassError(status: number, payload: unknown, phase: StormglassPhase): ProviderRequestError {
  const message = readStormglassErrorMessage(payload) ?? `Stormglass request failed with ${status}`;
  if (status === 402) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 404 || status === 405 || status === 410 || status === 422) {
    return new ProviderRequestError(status === 422 ? 400 : status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readStormglassErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function readRequiredObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} missing object`, value);
  }
  return object;
}

function isStormglassTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AbortError" || error.name === "TimeoutError" || error.message.toLowerCase().includes("timeout")
  );
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new ProviderRequestError(400, `${fieldName}[${index}] must be a string`);
    }
    return item.trim();
  });
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readRequiredStringArray(value, "source");
}

function readOptionalTimeValue(value: unknown): string | number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, "time value must be a non-empty string or integer");
  }
  return stringValue;
}
