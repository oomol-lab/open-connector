import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "ipgeolocation_io";
const ipgeolocationIoApiBaseUrl = "https://api.ipgeolocation.io";
const ipgeolocationIoDefaultRequestTimeoutMs = 30_000;

type IpgeolocationIoPhase = "validate" | "execute";
type IpgeolocationIoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type IpgeolocationIoActionHandler = (
  input: Record<string, unknown>,
  context: IpgeolocationIoActionContext,
) => Promise<unknown>;

export const ipgeolocationIoActionHandlers: ProviderActionHandlers<"ipgeolocation_io", IpgeolocationIoActionHandler> = {
  async lookup_ip(input, context) {
    const payload = await requestIpgeolocationIoJson(
      {
        path: "/v3/ipgeo",
        params: compactObject({
          ip: optionalString(input.ip),
          fields: readOptionalStringList(input.fields),
          excludes: readOptionalStringList(input.excludes),
          include: buildIpGeolocationIncludes(input),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      geolocation: normalizeIpGeolocation(payload),
    };
  },
  async get_timezone(input, context) {
    const payload = await requestIpgeolocationIoJson(
      {
        path: "/v3/timezone",
        params: compactObject({
          ip: optionalString(input.ip),
          lat: readOptionalNumberString(input.lat),
          long: readOptionalNumberString(input.long),
          location: optionalString(input.location),
          tz: optionalString(input.timeZone),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      timeZone: normalizeTimeZone(payload),
    };
  },
  async get_astronomy(input, context) {
    const payload = await requestIpgeolocationIoJson(
      {
        path: "/v3/astronomy",
        params: compactObject({
          ip: optionalString(input.ip),
          lat: readOptionalNumberString(input.lat),
          long: readOptionalNumberString(input.long),
          location: optionalString(input.location),
          date: optionalString(input.date),
        }),
        phase: "execute",
      },
      context,
    );

    return {
      astronomy: normalizeAstronomy(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ipgeolocationIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestIpgeolocationIoJson(
      {
        path: "/v3/ipgeo",
        params: {},
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "IPGeolocation.io API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: ipgeolocationIoApiBaseUrl,
        validationEndpoint: "/v3/ipgeo",
        currentIp: optionalString(payload.ip),
      }),
    };
  },
};

async function requestIpgeolocationIoJson(
  input: {
    path: string;
    params: Record<string, string | undefined>;
    phase: IpgeolocationIoPhase;
  },
  context: IpgeolocationIoActionContext,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, ipgeolocationIoDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildIpgeolocationIoUrl(input.path, context.apiKey, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readIpgeolocationIoPayload(response);

    if (!response.ok) {
      throw createIpgeolocationIoError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "IPGeolocation.io returned an invalid payload", payload);
    }
    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "IPGeolocation.io request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `IPGeolocation.io request failed: ${error.message}` : "IPGeolocation.io request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildIpgeolocationIoUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${ipgeolocationIoApiBaseUrl}/`);
  url.searchParams.set("apiKey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readIpgeolocationIoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "IPGeolocation.io returned invalid JSON");
  }
}

function createIpgeolocationIoError(
  status: number,
  payload: unknown,
  phase: IpgeolocationIoPhase,
): ProviderRequestError {
  const message =
    extractIpgeolocationIoErrorMessage(payload) ?? `IPGeolocation.io request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractIpgeolocationIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error);
}

function normalizeIpGeolocation(payload: Record<string, unknown>): Record<string, unknown> {
  const location = optionalRecord(payload.location) ?? payload;
  return {
    ip: normalizeNullableString(payload.ip),
    hostname: normalizeNullableString(payload.hostname),
    continentCode: normalizeNullableString(location.continent_code),
    continentName: normalizeNullableString(location.continent_name),
    countryCode2: normalizeNullableString(location.country_code2),
    countryCode3: normalizeNullableString(location.country_code3),
    countryName: normalizeNullableString(location.country_name),
    stateProvince: normalizeNullableString(location.state_prov),
    district: normalizeNullableString(location.district),
    city: normalizeNullableString(location.city),
    zipcode: normalizeNullableString(location.zipcode),
    latitude: normalizeNullableNumber(location.latitude),
    longitude: normalizeNullableNumber(location.longitude),
    callingCode: normalizeNullableString(optionalRecord(payload.country_metadata)?.calling_code),
    countryFlag: normalizeNullableString(location.country_flag),
    countryMetadata: optionalRecord(payload.country_metadata) ?? null,
    network: optionalRecord(payload.network) ?? null,
    asn: optionalRecord(payload.asn) ?? null,
    company: optionalRecord(payload.company) ?? null,
    timeZone: optionalRecord(payload.time_zone) ?? null,
    currency: optionalRecord(payload.currency) ?? null,
    security: optionalRecord(payload.security) ?? null,
    abuse: optionalRecord(payload.abuse) ?? null,
    userAgent: optionalRecord(payload.user_agent) ?? null,
    raw: payload,
  };
}

function normalizeTimeZone(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    timeZone: normalizeNullableString(payload.timezone),
    date: normalizeNullableString(payload.date),
    dateTime: normalizeNullableString(payload.date_time),
    dateTimeTxt: normalizeNullableString(payload.date_time_txt),
    dateTimeWti: normalizeNullableString(payload.date_time_wti),
    dateTimeYmd: normalizeNullableString(payload.date_time_ymd),
    dateTimeUnix: normalizeNullableNumber(payload.date_time_unix),
    time24: normalizeNullableString(payload.time_24),
    time12: normalizeNullableString(payload.time_12),
    week: normalizeNullableInteger(payload.week),
    month: normalizeNullableInteger(payload.month),
    year: normalizeNullableInteger(payload.year),
    yearAbbr: normalizeNullableString(payload.year_abbr),
    isDst: typeof payload.is_dst === "boolean" ? payload.is_dst : null,
    dstSavings: normalizeNullableInteger(payload.dst_savings),
    geo: optionalRecord(payload.geo) ?? null,
    raw: payload,
  };
}

function normalizeAstronomy(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    location: optionalRecord(payload.location) ?? null,
    date: normalizeNullableString(payload.date),
    currentTime: normalizeNullableString(payload.current_time),
    sunrise: normalizeNullableString(payload.sunrise),
    sunset: normalizeNullableString(payload.sunset),
    sunStatus: normalizeNullableString(payload.sun_status),
    solarNoon: normalizeNullableString(payload.solar_noon),
    dayLength: normalizeNullableString(payload.day_length),
    moonrise: normalizeNullableString(payload.moonrise),
    moonset: normalizeNullableString(payload.moonset),
    moonStatus: normalizeNullableString(payload.moon_status),
    moonPhase: normalizeNullableString(payload.moon_phase),
    moonIlluminationPercentage: normalizeNullableNumber(payload.moon_illumination_percentage),
    moonAngle: normalizeNullableNumber(payload.moon_angle),
    raw: payload,
  };
}

function buildIpGeolocationIncludes(input: Record<string, unknown>): string | undefined {
  const includes = [
    input.includeHostname === true ? "hostname" : undefined,
    input.includeGeoAccuracy === true ? "geo_accuracy" : undefined,
    input.includeDmaCode === true ? "dma_code" : undefined,
    input.includeSecurity === true ? "security" : undefined,
    input.includeAbuse === true ? "abuse" : undefined,
    input.includeUserAgent === true ? "user_agent" : undefined,
  ].filter((item): item is string => item !== undefined);

  return includes.length > 0 ? includes.join(",") : undefined;
}

function readOptionalStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item !== "");

  return values.length > 0 ? values.join(",") : undefined;
}

function readOptionalNumberString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeNullableInteger(value: unknown): number | null {
  const parsed = normalizeNullableNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}
