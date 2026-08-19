import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const mapboxApiBaseUrl = "https://api.mapbox.com";
const mapboxValidationPath = "/tokens/v2";

type MapboxActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mapboxActionHandlers: ProviderActionHandlers<"mapbox", MapboxActionHandler> = {
  forward_geocode(input, context) {
    assertBoundingBox(input.bbox);
    return requestMapboxJson({
      ...context,
      path: "/search/geocode/v6/forward",
      query: compactObject({
        q: optionalString(input.q),
        autocomplete: optionalBoolean(input.autocomplete),
        limit: optionalNumber(input.limit),
        language: optionalString(input.language),
        country: joinStringArray(input.country),
        types: joinStringArray(input.types),
        bbox: joinNumberArray(input.bbox),
        proximity: serializeCoordinate(input.proximity),
      }),
      phase: "execute",
    });
  },
  reverse_geocode(input, context) {
    return requestMapboxJson({
      ...context,
      path: "/search/geocode/v6/reverse",
      query: compactObject({
        longitude: optionalNumber(input.longitude),
        latitude: optionalNumber(input.latitude),
        limit: optionalNumber(input.limit),
        language: optionalString(input.language),
        types: joinStringArray(input.types),
        worldview: optionalString(input.worldview),
      }),
      phase: "execute",
    });
  },
  batch_geocode(input, context) {
    const queries = objectArray(input.queries, "queries").map((query) => {
      const mode = optionalString(query.mode);
      if (mode === "forward") {
        return compactObject({
          q: optionalString(query.q),
          limit: optionalNumber(query.limit),
        });
      }
      if (mode === "reverse") {
        return compactObject({
          longitude: optionalNumber(query.longitude),
          latitude: optionalNumber(query.latitude),
          limit: optionalNumber(query.limit),
        });
      }
      throw new ProviderRequestError(400, "queries[].mode must be forward or reverse");
    });

    return requestMapboxJson({
      ...context,
      path: "/search/geocode/v6/batch",
      method: "POST",
      body: queries,
      phase: "execute",
    });
  },
  get_directions(input, context) {
    return requestMapboxJson({
      ...context,
      path: `/directions/v5/${requirePathSegment(input.profile, "profile")}/${serializeCoordinatesPath(
        input.coordinates,
      )}`,
      query: compactObject({
        alternatives: optionalBoolean(input.alternatives),
        annotations: joinStringArrayWithSeparator(input.annotations, ","),
        continue_straight: optionalBoolean(input.continue_straight),
        exclude: joinStringArrayWithSeparator(input.exclude, ","),
        geometries: optionalString(input.geometries),
        language: optionalString(input.language),
        overview: optionalString(input.overview),
        roundabout_exits: optionalBoolean(input.roundabout_exits),
        steps: optionalBoolean(input.steps),
        voice_instructions: optionalBoolean(input.voice_instructions),
        banner_instructions: optionalBoolean(input.banner_instructions),
        avoid_maneuver_radius: optionalNumber(input.avoid_maneuver_radius),
        depart_at: optionalString(input.depart_at),
        arrive_by: optionalString(input.arrive_by),
        waypoints: joinNumberArrayWithSeparator(input.waypoints, ";"),
      }),
      phase: "execute",
    });
  },
  get_matrix(input, context) {
    return requestMapboxJson({
      ...context,
      path: `/directions-matrix/v1/${requirePathSegment(input.profile, "profile")}/${serializeCoordinatesPath(
        input.coordinates,
      )}`,
      query: compactObject({
        annotations: joinStringArrayWithSeparator(input.annotations, ","),
        approaches: joinStringArrayWithSeparator(input.approaches, ";"),
        bearings: joinStringArrayWithSeparator(input.bearings, ";"),
        fallback_speed: optionalNumber(input.fallback_speed),
        sources: joinNumberArrayWithSeparator(input.sources, ";"),
        destinations: joinNumberArrayWithSeparator(input.destinations, ";"),
      }),
      phase: "execute",
    });
  },
};

export async function validateMapboxCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await fetcher(buildMapboxUrl(mapboxValidationPath, { access_token: apiKey }), {
    method: "GET",
    headers: mapboxHeaders(),
    signal,
  });
  const payload = await readMapboxPayload(response);
  if (!response.ok) {
    throw createMapboxError(response, payload, "validate");
  }

  const record = requiredRecord(payload, "Mapbox token response");
  const code = optionalString(record.code);
  if (code !== "TokenValid") {
    throw new ProviderRequestError(400, code ?? "mapbox token is invalid", payload);
  }

  const token = requiredRecord(record.token, "Mapbox token");
  const tokenUser = optionalString(token.user);
  const tokenAuthorization = optionalString(token.authorization);
  return {
    profile: {
      accountId: tokenUser ?? tokenAuthorization ?? "api_key",
      displayName: tokenUser ?? "Mapbox Access Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: mapboxValidationPath,
      apiBaseUrl: mapboxApiBaseUrl,
      tokenUsage: optionalString(token.usage),
      tokenUser,
      tokenAuthorization,
    }),
  };
}

async function requestMapboxJson(input: {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
  method?: "GET" | "POST";
  body?: unknown;
}): Promise<unknown> {
  const response = await input.fetcher(
    buildMapboxUrl(input.path, {
      ...(input.query ?? {}),
      access_token: input.apiKey,
    }),
    {
      method: input.method ?? "GET",
      headers: mapboxHeaders(input.body === undefined ? undefined : "application/json"),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    },
  );
  const payload = await readMapboxPayload(response);
  if (!response.ok) {
    throw createMapboxError(response, payload, input.phase);
  }
  return payload;
}

function buildMapboxUrl(path: string, query: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(path, mapboxApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function mapboxHeaders(contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (contentType) {
    headers["content-type"] = contentType;
  }
  return headers;
}

async function readMapboxPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function createMapboxError(response: Response, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.code) ??
    `mapbox request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function joinStringArray(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map(String).join(",") : undefined;
}

function joinNumberArray(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map(String).join(",") : undefined;
}

function joinStringArrayWithSeparator(value: unknown, separator: string): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map(String).join(separator) : undefined;
}

function joinNumberArrayWithSeparator(value: unknown, separator: string): string | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map(String).join(separator) : undefined;
}

function serializeCoordinate(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const coordinate = readCoordinate(value);
  return `${coordinate[0]},${coordinate[1]}`;
}

function serializeCoordinatesPath(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "coordinates are required");
  }
  return value
    .map((item) => {
      const coordinate = readCoordinate(item);
      return `${coordinate[0]},${coordinate[1]}`;
    })
    .join(";");
}

function readCoordinate(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new ProviderRequestError(400, "coordinates must be [longitude, latitude] pairs");
  }
  const [longitude, latitude] = value;
  if (!isNumberInRange(longitude, -180, 180) || !isNumberInRange(latitude, -90, 90)) {
    throw new ProviderRequestError(400, "coordinates must be valid [longitude, latitude] pairs");
  }
  return [longitude, latitude];
}

function assertBoundingBox(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.length !== 4) {
    throw new ProviderRequestError(400, "bbox must be [minLon, minLat, maxLon, maxLat]");
  }
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = value;
  if (
    !isNumberInRange(minLongitude, -180, 180) ||
    !isNumberInRange(maxLongitude, -180, 180) ||
    !isNumberInRange(minLatitude, -90, 90) ||
    !isNumberInRange(maxLatitude, -90, 90)
  ) {
    throw new ProviderRequestError(400, "bbox values are outside valid longitude or latitude ranges");
  }
  if (minLongitude > maxLongitude || minLatitude > maxLatitude) {
    throw new ProviderRequestError(400, "The bounding box minimums must be less than or equal to the maximums.");
  }
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function requirePathSegment(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}
