import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "geocodio";
const geocodioApiBaseUrl = "https://api.geocod.io";
const geocodioApiVersion = "v1.12";
const geocodioValidationQuery = "1109 N Highland St, Arlington VA";

type GeocodioActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GeocodioActionHandler = (input: Record<string, unknown>, context: GeocodioActionContext) => Promise<unknown>;

export const geocodioActionHandlers: ProviderActionHandlers<"geocodio", GeocodioActionHandler> = {
  single_geocode(input, context) {
    validateSingleGeocodeInput(input);
    return geocodioGet("/geocode", buildSingleGeocodeQuery(input), context);
  },

  geocode_batch(input, context) {
    return geocodioPost("/geocode", buildBatchQuery(input), input.addresses, context);
  },

  single_reverse_geocode(input, context) {
    return geocodioGet("/reverse", buildSingleReverseQuery(input), context);
  },

  batch_reverse_geocode(input, context) {
    return geocodioPost("/reverse", buildBatchQuery(input), input.coordinates, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, geocodioActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await geocodioGet(
      "/geocode",
      {
        q: geocodioValidationQuery,
        limit: 1,
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
        accountId: "geocodio-api-key",
        displayName: "Geocodio API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: `/${geocodioApiVersion}/geocode`,
        apiBaseUrl: geocodioApiBaseUrl,
        apiVersion: geocodioApiVersion,
        validatedQuery: geocodioValidationQuery,
        validatedFormattedAddress: firstFormattedAddress(payload),
      },
    };
  },
};

async function geocodioGet(
  path: string,
  query: Record<string, string | number | undefined>,
  context: GeocodioActionContext,
  phase: "validate" | "execute" = "execute",
): Promise<unknown> {
  return geocodioRequest(buildGeocodioUrl(path, query, context.apiKey), { method: "GET" }, context, phase);
}

async function geocodioPost(
  path: string,
  query: Record<string, string | number | undefined>,
  body: unknown,
  context: GeocodioActionContext,
): Promise<unknown> {
  return geocodioRequest(
    buildGeocodioUrl(path, query, context.apiKey),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    context,
    "execute",
  );
}

function buildGeocodioUrl(path: string, query: Record<string, string | number | undefined>, apiKey: string): URL {
  const url = new URL(`/${geocodioApiVersion}${path}`, geocodioApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("api_key", apiKey);
  return url;
}

async function geocodioRequest(
  url: URL,
  init: RequestInit,
  context: GeocodioActionContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      ...init,
      signal: context.signal,
    });
    payload = await readGeocodioPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Geocodio request failed: ${error.message}` : "Geocodio request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createGeocodioError(response, payload, phase);
  }

  return payload;
}

async function readGeocodioPayload(response: Response): Promise<unknown> {
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

function createGeocodioError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractGeocodioErrorMessage(payload) || response.statusText || "Geocodio request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractGeocodioErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function firstFormattedAddress(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const results = Array.isArray(record?.results) ? record.results : undefined;
  const first = results ? optionalRecord(results[0]) : undefined;
  return optionalString(first?.formatted_address);
}

function buildSingleGeocodeQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    q: optionalString(input.q),
    street: optionalString(input.street),
    street2: optionalString(input.street2),
    city: optionalString(input.city),
    state: optionalString(input.state),
    postal_code: optionalString(input.postal_code),
    country: optionalString(input.country),
    county: optionalString(input.county),
    fields: optionalString(input.fields),
    limit: optionalNumber(input.limit),
    format: optionalString(input.format),
  };
}

function buildSingleReverseQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    q: `${String(input.lat)},${String(input.lng)}`,
    fields: optionalString(input.fields),
    limit: optionalNumber(input.limit),
    format: optionalString(input.format),
  };
}

function buildBatchQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    fields: optionalString(input.fields),
    limit: optionalNumber(input.limit),
  };
}

function validateSingleGeocodeInput(input: Record<string, unknown>): void {
  if (
    !optionalString(input.q) &&
    !optionalString(input.street) &&
    !optionalString(input.street2) &&
    !optionalString(input.city) &&
    !optionalString(input.state) &&
    !optionalString(input.postal_code) &&
    !optionalString(input.country) &&
    !optionalString(input.county)
  ) {
    throw new ProviderRequestError(400, "q or at least one address component is required");
  }
}
