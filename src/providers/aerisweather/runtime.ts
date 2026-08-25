import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const aerisweatherApiBaseUrl = "https://data.api.xweather.com";

const aerisweatherRequestTimeoutMs = 30_000;

type AerisWeatherRequestPhase = "validate" | "execute";
type AerisWeatherQueryValue = string | number | undefined;

export interface AerisWeatherContext {
  apiKey: string;
  clientId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const aerisweatherActionHandlers: ProviderActionHandlers<
  "aerisweather",
  ProviderRuntimeHandler<AerisWeatherContext>
> = {
  async get_place(input, context) {
    const payload = await requestAerisWeatherJson({
      path: `/places/${encodeURIComponent(requiredString(input.location, "location", inputError))}`,
      query: {
        fields: joinOptionalStringList(input.fields),
      },
      context,
      phase: "execute",
    });
    return {
      place: normalizePlace(requireResponseObject(payload, "Xweather place response")),
      raw: payload,
    };
  },
  async get_observation(input, context) {
    const payload = await requestAerisWeatherJson({
      path: `/observations/${encodeURIComponent(requiredString(input.location, "location", inputError))}`,
      query: {
        fields: joinOptionalStringList(input.fields),
      },
      context,
      phase: "execute",
    });
    return {
      observation: normalizeObservation(requireResponseObject(payload, "Xweather observation response")),
      raw: payload,
    };
  },
  async get_forecast(input, context) {
    const payload = await requestAerisWeatherJson({
      path: `/forecasts/${encodeURIComponent(requiredString(input.location, "location", inputError))}`,
      query: {
        filter: optionalString(input.filter),
        limit: optionalInteger(input.limit),
        plimit: optionalInteger(input.periodLimit),
        fields: joinOptionalStringList(input.fields),
      },
      context,
      phase: "execute",
    });
    return {
      forecasts: requireResponseArray(payload, "Xweather forecast response").map(normalizeForecast),
      raw: payload,
    };
  },
};

export async function validateAerisWeatherCredential(
  input: { apiKey: string; clientId: unknown },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: AerisWeatherContext = {
    apiKey: input.apiKey,
    clientId: requiredString(input.clientId, "clientId", inputError),
    fetcher,
    signal,
  };
  const payload = await requestAerisWeatherJson({
    path: "/places/98109",
    query: {
      fields: "loc,place.name,place.state,place.country",
    },
    context,
    phase: "validate",
  });
  const place = normalizePlace(requireResponseObject(payload, "Xweather validation response"));

  return {
    profile: {
      displayName: "Xweather API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: aerisweatherApiBaseUrl,
      validationEndpoint: "/places/98109",
      validationPlaceName: optionalString(place.place.name),
      validationPlaceState: optionalString(place.place.state),
      validationPlaceCountry: optionalString(place.place.country),
    }),
  };
}

async function requestAerisWeatherJson(input: {
  path: string;
  query: Record<string, AerisWeatherQueryValue>;
  context: AerisWeatherContext;
  phase: AerisWeatherRequestPhase;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, aerisweatherApiBaseUrl);
  url.searchParams.set("client_id", input.context.clientId);
  url.searchParams.set("client_secret", input.context.apiKey);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.context.signal, aerisweatherRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Xweather returned invalid JSON",
    });
    if (!response.ok) {
      throw createAerisWeatherError(response.status, payload, input.phase);
    }
    assertSuccessfulPayload(payload, input.phase);
    return requiredRecord(payload, "Xweather response", responseError);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, "Xweather request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Xweather request failed: ${error.message}` : "Xweather request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function assertSuccessfulPayload(payload: unknown, phase: AerisWeatherRequestPhase): void {
  const record = optionalRecord(payload);
  if (record?.success === false) {
    throw createAerisWeatherError(200, payload, phase);
  }
}

function createAerisWeatherError(
  status: number,
  payload: unknown,
  phase: AerisWeatherRequestPhase,
): ProviderRequestError {
  const message = extractAerisWeatherErrorMessage(payload) ?? `Xweather request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractAerisWeatherErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.description) ?? optionalString(error?.message) ?? optionalString(record?.message);
}

function requireResponseObject(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  const response = optionalRecord(payload.response);
  if (!response) {
    throw new ProviderRequestError(502, `${label} did not include an object response`);
  }
  return response;
}

function requireResponseArray(payload: Record<string, unknown>, label: string): Record<string, unknown>[] {
  if (!Array.isArray(payload.response)) {
    throw new ProviderRequestError(502, `${label} did not include an array response`);
  }
  return payload.response.map((value) => requiredRecord(value, label, responseError));
}

function normalizePlace(value: Record<string, unknown>): {
  loc: Record<string, unknown>;
  place: Record<string, unknown>;
  profile: Record<string, unknown>;
  raw: Record<string, unknown>;
} {
  return {
    loc: optionalRecord(value.loc) ?? {},
    place: optionalRecord(value.place) ?? {},
    profile: optionalRecord(value.profile) ?? {},
    raw: value,
  };
}

function normalizeObservation(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(value.id) ?? null,
    dataSource: optionalString(value.dataSource) ?? null,
    loc: optionalRecord(value.loc) ?? {},
    place: optionalRecord(value.place) ?? {},
    profile: optionalRecord(value.profile) ?? {},
    observation: optionalRecord(value.ob) ?? {},
    raw: value,
  };
}

function normalizeForecast(value: Record<string, unknown>): Record<string, unknown> {
  return {
    loc: optionalRecord(value.loc) ?? {},
    interval: optionalString(value.interval) ?? null,
    place: optionalRecord(value.place) ?? {},
    periods: Array.isArray(value.periods) ? value.periods.map((period) => optionalRecord(period) ?? {}) : [],
    raw: value,
  };
}

function joinOptionalStringList(value: unknown): string | undefined {
  const values = optionalStringArray(value);
  return values && values.length > 0
    ? values
        .map((item) => item.trim())
        .filter(Boolean)
        .join(",")
    : undefined;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function responseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
