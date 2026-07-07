import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { GeoapifyActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "geoapify";
const geoapifyApiBaseUrl = "https://api.geoapify.com";
const geoapifyValidationPath = "/v1/geocode/search";

type GeoapifyActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GeoapifyActionHandler = (input: Record<string, unknown>, context: GeoapifyActionContext) => Promise<unknown>;

export const geoapifyActionHandlers: Record<GeoapifyActionName, GeoapifyActionHandler> = {
  forward_geocode(input, context) {
    return requestGeoapify({
      path: "/v1/geocode/search",
      query: geocodingQuery(input, context.apiKey),
      method: "GET",
      context,
      phase: "execute",
    });
  },

  reverse_geocode(input, context) {
    return requestGeoapify({
      path: "/v1/geocode/reverse",
      query: compactObject({
        lat: optionalNumber(input.lat),
        lon: optionalNumber(input.lon),
        lang: optionalString(input.lang),
        limit: optionalNumber(input.limit),
        type: optionalString(input.type),
        filter: optionalString(input.filter),
        bias: optionalString(input.bias),
        format: optionalString(input.format),
        apiKey: context.apiKey,
      }),
      method: "GET",
      context,
      phase: "execute",
    });
  },

  address_autocomplete(input, context) {
    return requestGeoapify({
      path: "/v1/geocode/autocomplete",
      query: geocodingQuery(input, context.apiKey),
      method: "GET",
      context,
      phase: "execute",
    });
  },

  get_route(input, context) {
    return requestGeoapify({
      path: "/v1/routing",
      query: compactObject({
        waypoints: serializeWaypoints(input.waypoints),
        mode: optionalString(input.mode),
        type: optionalString(input.type),
        units: optionalString(input.units),
        lang: optionalString(input.lang),
        details: optionalString(input.details),
        traffic: optionalString(input.traffic),
        max_speed: optionalNumber(input.max_speed),
        avoid: optionalString(input.avoid),
        format: optionalString(input.format),
        apiKey: context.apiKey,
      }),
      method: "GET",
      context,
      phase: "execute",
    });
  },

  get_route_matrix(input, context) {
    return requestGeoapify({
      path: "/v1/routematrix",
      query: {
        apiKey: context.apiKey,
      },
      method: "POST",
      body: compactObject({
        mode: optionalString(input.mode),
        type: optionalString(input.type),
        units: optionalString(input.units),
        traffic: optionalString(input.traffic),
        max_speed: optionalNumber(input.max_speed),
        sources: Array.isArray(input.sources) ? input.sources : undefined,
        targets: Array.isArray(input.targets) ? input.targets : undefined,
        avoid: Array.isArray(input.avoid) ? input.avoid : undefined,
      }),
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, geoapifyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: geoapifyApiBaseUrl,
  auth: {
    type: "api_key_query",
    name: "apiKey",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestGeoapify({
      path: geoapifyValidationPath,
      query: {
        text: "Berlin",
        limit: 1,
        apiKey: input.apiKey,
      },
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "geoapify-api-key",
        displayName: "Geoapify API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: geoapifyValidationPath,
        apiBaseUrl: geoapifyApiBaseUrl,
      },
    };
  },
};

function geocodingQuery(input: Record<string, unknown>, apiKey: string): Record<string, string | number | undefined> {
  return compactObject({
    text: optionalString(input.text),
    lang: optionalString(input.lang),
    limit: optionalNumber(input.limit),
    type: optionalString(input.type),
    filter: optionalString(input.filter),
    bias: optionalString(input.bias),
    format: optionalString(input.format),
    apiKey,
  });
}

async function requestGeoapify(input: {
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  method: "GET" | "POST";
  body?: unknown;
  context: GeoapifyActionContext;
  phase: "validate" | "execute";
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildGeoapifyUrl(input.path, input.query ?? {}), {
      method: input.method,
      headers: geoapifyHeaders(input.body === undefined ? undefined : "application/json"),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readGeoapifyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Geoapify request failed: ${error.message}` : "Geoapify request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createGeoapifyError(response, payload, input.phase);
  }

  return payload;
}

function buildGeoapifyUrl(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, geoapifyApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function geoapifyHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (contentType) {
    headers["content-type"] = contentType;
  }
  return headers;
}

async function readGeoapifyPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createGeoapifyError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const record =
    typeof payload === "object" && payload != null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const message =
    optionalString(record.message) ?? optionalString(record.error) ?? `Geoapify request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function serializeWaypoints(value: unknown): string {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "waypoints must be an array");
  }

  return value
    .map((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length !== 2) {
        throw new ProviderRequestError(400, "waypoints entries must be coordinate pairs");
      }

      const [longitude, latitude] = coordinate;
      if (typeof longitude !== "number" || typeof latitude !== "number") {
        throw new ProviderRequestError(400, "waypoints entries must contain numbers");
      }

      return `lonlat:${longitude},${latitude}`;
    })
    .join("|");
}
