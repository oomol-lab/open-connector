import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "radar";
const radarApiBaseUrl = "https://api.radar.io";
const radarDefaultRequestTimeoutMs = 30_000;
const radarValidationPath = "/v1/geocode/ip";

type RadarRequestPhase = "validate" | "execute";
type RadarActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const radarActionHandlers: ProviderActionHandlers<"radar", RadarActionHandler> = {
  async forward_geocode(input, context) {
    const payload = await requestRadarJson({
      path: "/v1/geocode/forward",
      apiKey: context.apiKey,
      query: compactObject({
        query: readRequiredString(input.query, "query"),
        layers: joinStringList(input.layers),
        country: joinCountryCodeList(input.country),
        lang: readOptionalString(input.lang),
      }),
      context,
      phase: "execute",
    });

    return {
      meta: normalizeMeta(payload.meta),
      addresses: normalizeAddressList(payload.addresses),
    };
  },
  async reverse_geocode(input, context) {
    const payload = await requestRadarJson({
      path: "/v1/geocode/reverse",
      apiKey: context.apiKey,
      query: compactObject({
        coordinates: formatCoordinates(
          readRequiredNumber(input.latitude, "latitude"),
          readRequiredNumber(input.longitude, "longitude"),
        ),
        layers: joinStringList(input.layers),
      }),
      context,
      phase: "execute",
    });

    return {
      meta: normalizeMeta(payload.meta),
      addresses: normalizeAddressList(payload.addresses),
    };
  },
  async ip_geocode(_input, context) {
    const payload = await requestRadarJson({
      path: radarValidationPath,
      apiKey: context.apiKey,
      query: {},
      context,
      phase: "execute",
    });

    return normalizeIpGeocodePayload(payload);
  },
  async autocomplete(input, context) {
    const near = buildOptionalNear(input);
    const payload = await requestRadarJson({
      path: "/v1/search/autocomplete",
      apiKey: context.apiKey,
      query: compactObject({
        query: readRequiredString(input.query, "query"),
        near,
        layers: joinStringList(input.layers),
        limit: readOptionalNumberString(input.limit),
        countryCode: joinCountryCodeList(input.countryCode),
      }),
      context,
      phase: "execute",
    });

    return {
      meta: normalizeMeta(payload.meta),
      addresses: normalizeAddressList(payload.addresses),
    };
  },
  async search_places(input, context) {
    const chains = joinStringList(input.chains);
    const categories = joinStringList(input.categories);
    if (!chains && !categories) {
      throw new ProviderRequestError(400, "chains or categories is required");
    }

    const payload = await requestRadarJson({
      path: "/v1/search/places",
      apiKey: context.apiKey,
      query: compactObject({
        near: formatCoordinates(
          readRequiredNumber(input.latitude, "latitude"),
          readRequiredNumber(input.longitude, "longitude"),
        ),
        chains,
        categories,
        radius: readOptionalNumberString(input.radius),
        limit: readOptionalNumberString(input.limit),
      }),
      context,
      phase: "execute",
    });

    return {
      meta: normalizeMeta(payload.meta),
      places: normalizePlaceList(payload.places),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, radarActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestRadarJson({
      path: radarValidationPath,
      apiKey: input.apiKey,
      query: {},
      context,
      phase: "validate",
    });
    const normalized = normalizeIpGeocodePayload(payload);

    return {
      profile: {
        accountId: "radar:api_key",
        displayName: "Radar API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: radarApiBaseUrl,
        validationEndpoint: radarValidationPath,
        validatedIp: normalized.ip,
        validatedCity: normalized.address.city,
        validatedCountryCode: normalized.address.countryCode,
      }),
    };
  },
};

async function requestRadarJson(input: {
  path: string;
  apiKey: string;
  query: Record<string, string | undefined>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: RadarRequestPhase;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, radarDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(buildRadarUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readRadarPayload(response);

    if (!response.ok) {
      throw createRadarError(response.status, payload, input.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Radar returned an invalid payload", payload);
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Radar request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Radar request failed: ${error.message}` : "Radar request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildRadarUrl(path: string, query: Record<string, string | undefined>): URL {
  const url = new URL(path, radarApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readRadarPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Radar returned invalid JSON");
  }
}

function createRadarError(status: number, payload: unknown, phase: RadarRequestPhase): ProviderRequestError {
  const message = extractRadarErrorMessage(payload) ?? `Radar request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractRadarErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const meta = optionalRecord(record.meta);
  return optionalString(meta?.message) ?? optionalString(record.message) ?? optionalString(record.error);
}

function normalizeIpGeocodePayload(payload: Record<string, unknown>): {
  meta: Record<string, unknown>;
  address: Record<string, unknown>;
  proxy?: boolean;
  ip?: string;
} {
  const address = optionalRecord(payload.address);
  if (!address) {
    throw new ProviderRequestError(502, "Radar IP geocode response did not include address", payload);
  }

  return compactObject({
    meta: normalizeMeta(payload.meta),
    address: normalizeAddress(address),
    proxy: optionalBoolean(payload.proxy),
    ip: optionalString(payload.ip),
  }) as {
    meta: Record<string, unknown>;
    address: Record<string, unknown>;
    proxy?: boolean;
    ip?: string;
  };
}

function normalizeMeta(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function normalizeAddressList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [normalizeAddress(record)] : [];
  });
}

function normalizeAddress(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    latitude: optionalNumber(record.latitude),
    longitude: optionalNumber(record.longitude),
    geometry: optionalRecord(record.geometry),
    country: optionalString(record.country),
    countryCode: optionalString(record.countryCode),
    countryFlag: optionalString(record.countryFlag),
    county: optionalString(record.county),
    confidence: optionalString(record.confidence),
    distance: optionalNumber(record.distance),
    borough: optionalString(record.borough),
    city: optionalString(record.city),
    number: optionalString(record.number),
    neighborhood: optionalString(record.neighborhood),
    postalCode: optionalString(record.postalCode),
    stateCode: optionalString(record.stateCode),
    state: optionalString(record.state),
    street: optionalString(record.street),
    layer: optionalString(record.layer),
    formattedAddress: optionalString(record.formattedAddress),
    addressLabel: optionalString(record.addressLabel),
    placeLabel: optionalString(record.placeLabel),
    timeZone: optionalRecord(record.timeZone),
    raw: record,
  });
}

function normalizePlaceList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [normalizePlace(record)] : [];
  });
}

function normalizePlace(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(record.name),
    categories: readOptionalStringList(record.categories),
    chain: optionalRecord(record.chain),
    location: optionalRecord(record.location),
    raw: record,
  });
}

function buildOptionalNear(input: Record<string, unknown>): string | undefined {
  const hasLatitude = typeof input.latitude === "number";
  const hasLongitude = typeof input.longitude === "number";
  if (!hasLatitude && !hasLongitude) {
    return undefined;
  }
  if (hasLatitude !== hasLongitude) {
    throw new ProviderRequestError(400, "latitude and longitude must be provided together");
  }

  return formatCoordinates(
    readRequiredNumber(input.latitude, "latitude"),
    readRequiredNumber(input.longitude, "longitude"),
  );
}

function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude},${longitude}`;
}

function joinStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    const trimmed = item.trim();
    return trimmed ? [trimmed] : [];
  });

  return values.length > 0 ? values.join(",") : undefined;
}

function joinCountryCodeList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    const trimmed = item.trim().toUpperCase();
    return trimmed ? [trimmed] : [];
  });

  return values.length > 0 ? values.join(",") : undefined;
}

function readOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return stringValue;
}

function readOptionalString(value: unknown): string | undefined {
  return optionalString(value);
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return value;
}

function readOptionalNumberString(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}
