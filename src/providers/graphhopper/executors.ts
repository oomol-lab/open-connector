import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "graphhopper";
const graphhopperApiBaseUrl = "https://graphhopper.com/api/1";

type GraphhopperRequestPhase = "validate" | "execute";
type GraphhopperActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type GraphhopperQuery = Record<string, string | number | boolean | readonly string[] | undefined>;

export const graphhopperActionHandlers: ProviderActionHandlers<"graphhopper", GraphhopperActionHandler> = {
  calculate_route(input, context) {
    return graphhopperGetJson("/route", buildRouteQuery(input), context, "execute");
  },
  geocode(input, context) {
    return graphhopperGetJson("/geocode", buildGeocodeQuery(input), context, "execute");
  },
  compute_matrix(input, context) {
    return graphhopperGetJson("/matrix", buildMatrixQuery(input), context, "execute");
  },
  compute_isochrone(input, context) {
    return graphhopperGetJson("/isochrone", buildIsochroneQuery(input), context, "execute");
  },
  async list_profiles(_input, context) {
    const payload = await graphhopperGetJson("/profiles", {}, context, "execute");
    return {
      profiles: normalizeProfilesPayload(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, graphhopperActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await graphhopperGetJson(
      "/profiles",
      {},
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const profiles = normalizeProfilesPayload(payload);
    return {
      profile: {
        accountId: `graphhopper:api_key:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: "GraphHopper API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: graphhopperApiBaseUrl,
        validationEndpoint: "/profiles",
        profileCount: profiles.length,
      },
    };
  },
};

async function graphhopperGetJson(
  path: string,
  query: GraphhopperQuery,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: GraphhopperRequestPhase,
): Promise<unknown> {
  const url = buildGraphhopperUrl(path, query, context.apiKey);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readGraphhopperPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GraphHopper request failed: ${error.message}` : "GraphHopper request failed",
    );
  }

  if (!response.ok) {
    throw createGraphhopperError(response, payload, phase);
  }

  return payload;
}

function buildGraphhopperUrl(path: string, query: GraphhopperQuery, apiKey: string): URL {
  const url = new URL(`/api/1${path}`, "https://graphhopper.com");
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", apiKey);
  return url;
}

function buildRouteQuery(input: Record<string, unknown>): GraphhopperQuery {
  return compactObject({
    point: readStringArray(input.point),
    profile: optionalString(input.profile),
    locale: optionalString(input.locale),
    point_hint: readStringArray(input.pointHint),
    snap_prevention: readStringArray(input.snapPrevention),
    curbside: readStringArray(input.curbside),
    details: readStringArray(input.details),
    optimize: optionalBoolean(input.optimize),
    instructions: optionalBoolean(input.instructions),
    calc_points: optionalBoolean(input.calcPoints),
    points_encoded: optionalBoolean(input.pointsEncoded),
    elevation: optionalBoolean(input.elevation),
    debug: optionalBoolean(input.debug),
    "ch.disable": optionalBoolean(input.chDisable),
    heading: readNumberArray(input.heading),
    heading_penalty: optionalNumber(input.headingPenalty),
    pass_through: optionalBoolean(input.passThrough),
    algorithm: optionalString(input.algorithm),
    "round_trip.distance": optionalNumber(input.roundTripDistance),
    "round_trip.seed": optionalNumber(input.roundTripSeed),
    "alternative_route.max_paths": optionalNumber(input.alternativeRouteMaxPaths),
    "alternative_route.max_weight_factor": optionalNumber(input.alternativeRouteMaxWeightFactor),
    "alternative_route.max_share_factor": optionalNumber(input.alternativeRouteMaxShareFactor),
  }) as GraphhopperQuery;
}

function buildGeocodeQuery(input: Record<string, unknown>): GraphhopperQuery {
  const q = optionalString(input.q);
  const point = optionalString(input.point);
  if (input.reverse === true) {
    if (!point) {
      throw new ProviderRequestError(400, "point is required when reverse is true");
    }
    if (q) {
      throw new ProviderRequestError(400, "q must be omitted when reverse is true");
    }
  } else if (!q) {
    throw new ProviderRequestError(400, "q is required for forward geocoding");
  }

  return compactObject({
    q,
    point,
    reverse: optionalBoolean(input.reverse),
    locale: optionalString(input.locale),
    limit: optionalNumber(input.limit),
    provider: optionalString(input.provider),
    debug: optionalBoolean(input.debug),
  }) as GraphhopperQuery;
}

function buildMatrixQuery(input: Record<string, unknown>): GraphhopperQuery {
  const point = readStringArray(input.point);
  const fromPoint = readStringArray(input.fromPoint);
  const toPoint = readStringArray(input.toPoint);
  if (point && (fromPoint || toPoint)) {
    throw new ProviderRequestError(400, "point cannot be combined with fromPoint or toPoint");
  }
  if (!point && (!fromPoint || !toPoint)) {
    throw new ProviderRequestError(400, "provide either point or both fromPoint and toPoint");
  }

  return compactObject({
    point,
    from_point: fromPoint,
    to_point: toPoint,
    profile: optionalString(input.profile),
    point_hint: readStringArray(input.pointHint),
    from_point_hint: readStringArray(input.fromPointHint),
    to_point_hint: readStringArray(input.toPointHint),
    snap_prevention: readStringArray(input.snapPrevention),
    curbside: readStringArray(input.curbside),
    from_curbside: readStringArray(input.fromCurbside),
    to_curbside: readStringArray(input.toCurbside),
    out_array: readStringArray(input.outArray),
    fail_fast: optionalBoolean(input.failFast),
  }) as GraphhopperQuery;
}

function buildIsochroneQuery(input: Record<string, unknown>): GraphhopperQuery {
  if (input.timeLimit !== undefined && input.distanceLimit !== undefined) {
    throw new ProviderRequestError(400, "timeLimit and distanceLimit cannot be provided together");
  }
  return compactObject({
    point: optionalString(input.point),
    profile: optionalString(input.profile),
    time_limit: optionalNumber(input.timeLimit),
    distance_limit: optionalNumber(input.distanceLimit),
    buckets: optionalNumber(input.buckets),
    reverse_flow: optionalBoolean(input.reverseFlow),
  }) as GraphhopperQuery;
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map(String) : undefined;
}

function readNumberArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

async function readGraphhopperPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createGraphhopperError(
  response: Response,
  payload: unknown,
  phase: GraphhopperRequestPhase,
): ProviderRequestError {
  const message = extractGraphhopperErrorMessage(payload) ?? response.statusText ?? "GraphHopper request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractGraphhopperErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.details) ??
    extractFirstHintMessage(record.hints)
  );
}

function extractFirstHintMessage(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    const record = optionalRecord(item);
    const message = record ? optionalString(record.message) : undefined;
    if (message) {
      return message;
    }
  }
  return undefined;
}

function normalizeProfilesPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = optionalRecord(payload);
  const profiles = record ? record.profiles : undefined;
  return Array.isArray(profiles) ? profiles : [];
}
