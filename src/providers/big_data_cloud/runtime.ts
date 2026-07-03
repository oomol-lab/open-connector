import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BigDataCloudActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { isAbortLikeError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const bigDataCloudApiBaseUrl = "https://api-bdc.net";
const countryByIpPath = "/data/country-by-ip";
const networkByIpPath = "/data/network-by-ip";
const timezoneByIpPath = "/data/timezone-by-ip";
const reverseGeocodeWithTimezonePath = "/data/reverse-geocode-with-timezone";
const validationIp = "8.8.8.8";
const validationLocalityLanguage = "en";

type BigDataCloudRequestPhase = "validate" | "execute";
type BigDataCloudActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const bigDataCloudActionHandlers: Record<BigDataCloudActionName, BigDataCloudActionHandler> = {
  get_country_by_ip(input, context) {
    return requestBigDataCloudJson({
      path: countryByIpPath,
      context,
      query: {
        ip: input.ip,
        localityLanguage: input.localityLanguage,
      },
      phase: "execute",
    });
  },
  get_network_by_ip(input, context) {
    return requestBigDataCloudJson({
      path: networkByIpPath,
      context,
      query: {
        ip: input.ip,
        localityLanguage: input.localityLanguage,
      },
      phase: "execute",
    });
  },
  get_timezone_by_ip(input, context) {
    return requestBigDataCloudJson({
      path: timezoneByIpPath,
      context,
      query: {
        ip: input.ip,
        utcReference: input.utcReference,
      },
      phase: "execute",
    });
  },
  reverse_geocode_with_timezone(input, context) {
    return requestBigDataCloudJson({
      path: reverseGeocodeWithTimezonePath,
      context,
      query: {
        latitude: input.latitude,
        longitude: input.longitude,
        localityLanguage: input.localityLanguage,
      },
      phase: "execute",
    });
  },
};

export async function validateBigDataCloudCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBigDataCloudJson({
    path: countryByIpPath,
    context: {
      apiKey,
      fetcher,
      signal,
    },
    query: {
      ip: validationIp,
      localityLanguage: validationLocalityLanguage,
    },
    phase: "validate",
  });
  const country = optionalRecord(optionalRecord(payload)?.country);

  return {
    profile: {
      accountId: "big_data_cloud-api-key",
      displayName: "BigDataCloud API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: bigDataCloudApiBaseUrl,
      validationEndpoint: countryByIpPath,
      validatedIp: validationIp,
      validatedCountryCode: optionalString(country?.isoAlpha2),
      validatedCountryName: optionalString(country?.name),
    }),
  };
}

async function requestBigDataCloudJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query: Record<string, unknown>;
  phase: BigDataCloudRequestPhase;
}): Promise<Record<string, unknown>> {
  const url = buildBigDataCloudUrl(input.path, input.context.apiKey, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readBigDataCloudPayload(response);
  } catch (error) {
    if (isAbortLikeError(error) || isTimeoutLikeError(error)) {
      throw new ProviderRequestError(504, error instanceof Error ? error.message : "BigDataCloud request timed out");
    }

    throw new ProviderRequestError(502, error instanceof Error ? error.message : "BigDataCloud request failed");
  }

  if (!response.ok) {
    throw mapBigDataCloudError(response.status, extractBigDataCloudErrorMessage(payload), input.phase, payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "BigDataCloud response body is invalid");
  }
  return record;
}

function buildBigDataCloudUrl(path: string, apiKey: string, query: Record<string, unknown>): URL {
  const url = new URL(path, bigDataCloudApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("key", apiKey);
  return url;
}

async function readBigDataCloudPayload(response: Response): Promise<unknown> {
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

function extractBigDataCloudErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const nestedError = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.description) ??
    optionalString(record.detail) ??
    optionalString(nestedError?.message)
  );
}

function mapBigDataCloudError(
  status: number,
  message: string | undefined,
  phase: BigDataCloudRequestPhase,
  payload: unknown,
): ProviderRequestError {
  const normalizedMessage = message ?? "BigDataCloud request failed";

  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, normalizedMessage, payload);
  }

  if (status === 400 || status === 404 || status === 405) {
    return new ProviderRequestError(400, normalizedMessage, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, normalizedMessage, payload);
  }

  return new ProviderRequestError(status || 500, normalizedMessage, payload);
}

function isTimeoutLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}
