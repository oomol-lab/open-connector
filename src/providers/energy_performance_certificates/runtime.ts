import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const energyPerformanceCertificatesApiBaseUrl = "https://api.get-energy-performance-data.communities.gov.uk";
const requestTimeoutMs = 30_000;

type EnergyPerformanceCertificatesPhase = "validate" | "execute";
type SearchFamily = "domestic" | "non-domestic" | "display";
type QueryValue = string | number | readonly string[] | undefined;
type EnergyPerformanceCertificatesActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface RequestJsonResult {
  payload: unknown;
  response: Response;
}

export const energyPerformanceCertificatesActionHandlers: ProviderActionHandlers<
  "energy_performance_certificates",
  EnergyPerformanceCertificatesActionHandler
> = {
  search_domestic_certificates(input, context) {
    return searchCertificates("domestic", input, context);
  },
  get_certificate(input, context) {
    return getCertificate(input, context);
  },
  search_non_domestic_certificates(input, context) {
    return searchCertificates("non-domestic", input, context);
  },
  search_display_certificates(input, context) {
    return searchCertificates("display", input, context);
  },
};

export async function validateEnergyPerformanceCertificatesCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestJson({
    context: { apiKey, fetcher, signal },
    path: "/api/codes",
    phase: "validate",
  });

  return {
    profile: {
      accountId: "energy_performance_certificates",
      displayName: "Energy Performance Certificates Bearer Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: energyPerformanceCertificatesApiBaseUrl,
      validationEndpoint: "/api/codes",
      validationMode: "codes_probe",
    },
  };
}

async function searchCertificates(
  family: SearchFamily,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  assertSearchHasFilter(input);
  const result = await requestJson({
    context,
    path: `/api/${family}/search`,
    query: searchQuery(input),
    phase: "execute",
    allowSearchNotFound: true,
  });
  const { payload, response } = result;
  const raw = normalizeRawObject(payload);

  return {
    rows: response.status === 404 ? [] : readRows(payload),
    pagination: response.status === 404 ? null : readPagination(payload),
    raw,
  };
}

async function getCertificate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestJson({
    context,
    path: "/api/certificate",
    query: {
      certificate_number: optionalString(input.certificateNumber),
    },
    phase: "execute",
  });
  const raw = normalizeRawObject(payload);

  return {
    certificate: readRows(payload)[0] ?? readCertificatePayload(payload),
    raw,
  };
}

async function requestJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: EnergyPerformanceCertificatesPhase;
  query?: Record<string, QueryValue>;
  allowSearchNotFound?: boolean;
}): Promise<RequestJsonResult> {
  const url = new URL(`.${input.path}`, `${energyPerformanceCertificatesApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(key, child);
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: "GET",
      headers: requestHeaders(input.context.apiKey),
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "energy_performance_certificates request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `energy_performance_certificates request failed: ${error.message}`
        : "energy_performance_certificates request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok && !(input.allowSearchNotFound && response.status === 404)) {
    throw createRequestError(response, payload, input.phase);
  }

  return { payload, response };
}

function requestHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": providerUserAgent,
  };
}

async function readPayload(response: Response): Promise<unknown> {
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

function createRequestError(
  response: Response,
  payload: unknown,
  phase: EnergyPerformanceCertificatesPhase,
): ProviderRequestError {
  const message =
    extractErrorMessage(payload) ??
    response.statusText ??
    `energy_performance_certificates request failed with status ${response.status}`;
  const isAuthError = response.status === 401 || response.status === 403;

  if (isAuthError) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function searchQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return compactObject({
    address: optionalString(input.address),
    postcode: optionalString(input.postcode),
    uprn: scalarQueryValue(input.uprn),
    "council[]": stringArrayQueryValue(input.councils),
    "constituency[]": stringArrayQueryValue(input.constituencies),
    "efficiency_rating[]": stringArrayQueryValue(input.energyRatings),
    date_start: optionalString(input.dateStart),
    date_end: optionalString(input.dateEnd),
    page_size: numberQueryValue(input.pageSize),
    current_page: numberQueryValue(input.currentPage),
  });
}

function assertSearchHasFilter(input: Record<string, unknown>): void {
  if (
    [
      input.address,
      input.postcode,
      input.uprn,
      input.councils,
      input.constituencies,
      input.energyRatings,
      input.dateStart,
    ].some(isSearchFilterPresent)
  ) {
    return;
  }

  throw new ProviderRequestError(400, "energy_performance_certificates search requires at least one search filter");
}

function isSearchFilterPresent(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return typeof value === "number";
}

function stringArrayQueryValue(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function scalarQueryValue(value: unknown): string | number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function numberQueryValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
  }

  const object = optionalRecord(payload);
  if (!object) {
    return [];
  }

  const rows = object.rows ?? object.data ?? object.results;
  if (Array.isArray(rows)) {
    return rows.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  if ("rows" in object || "data" in object || "results" in object) {
    return [];
  }

  return [object];
}

function readCertificatePayload(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload);
  const data = optionalRecord(object?.data);
  const result = data ?? optionalRecord(payload);
  if (!result) {
    throw new ProviderRequestError(502, "energy_performance_certificates response did not include a certificate");
  }
  return result;
}

function readPagination(payload: unknown): Record<string, unknown> | null {
  const object = optionalRecord(payload);
  return optionalRecord(object?.pagination) ?? null;
}

function normalizeRawObject(payload: unknown): Record<string, unknown> {
  return optionalRecord(payload) ?? { value: payload };
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const errors = object.errors;
  if (Array.isArray(errors)) {
    const first = errors[0];
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
    const errorObject = optionalRecord(first);
    const errorMessage =
      optionalString(errorObject?.message) ?? optionalString(errorObject?.detail) ?? optionalString(errorObject?.title);
    if (errorMessage) {
      return errorMessage;
    }
  }

  return optionalString(object.error) ?? optionalString(object.message) ?? optionalString(object.detail);
}
