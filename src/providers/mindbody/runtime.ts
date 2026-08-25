import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const mindbodyApiBaseUrl = "https://api.mindbodyonline.com";
const mindbodyBusinessDirectoryPath = "/partnergateway/consumer/activity/v1/businesses";

interface MindbodyBusinessPayload extends Record<string, unknown> {
  locations: Array<Record<string, unknown>>;
}

interface MindbodyListBusinessesOutput {
  pageCount: number | null;
  businesses: MindbodyBusinessPayload[];
}

type MindbodyRequestPhase = "validate" | "execute";
type MindbodyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mindbodyActionHandlers: ProviderActionHandlers<"mindbody", MindbodyActionHandler> = {
  list_businesses(input, context) {
    return executeListBusinesses(input, context, "execute");
  },
};

export async function validateMindbodyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const output = await executeListBusinesses({ pageNumber: 1 }, { apiKey, fetcher, signal }, "validate");
  const firstBusiness = output.businesses[0];

  return {
    profile: {
      accountId: "mindbody:api-key",
      displayName: "Mindbody API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mindbodyApiBaseUrl,
      validationEndpoint: mindbodyBusinessDirectoryPath,
      firstBusinessName: optionalString(firstBusiness?.name),
      pageCount: output.pageCount,
    }),
  };
}

async function executeListBusinesses(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: MindbodyRequestPhase,
): Promise<MindbodyListBusinessesOutput> {
  const payload = await mindbodyGetJson({
    path: mindbodyBusinessDirectoryPath,
    query: buildListBusinessesQuery(input),
    context,
    phase,
  });
  return normalizeListBusinessesPayload(payload);
}

async function mindbodyGetJson(input: {
  path: string;
  query: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: MindbodyRequestPhase;
}): Promise<unknown> {
  const url = new URL(input.path, mindbodyApiBaseUrl);
  appendQuery(url, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readMindbodyPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mindbody request failed: ${error.message}` : "Mindbody request failed",
    );
  }

  if (!response.ok) {
    throw createMindbodyError(response, payload, input.phase);
  }

  return payload;
}

function buildListBusinessesQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    pageNumber: input.pageNumber,
    businessIds: input.businessIds,
  });
}

function appendQuery(url: URL, query: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && item !== "") {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function readMindbodyPayload(response: Response): Promise<unknown> {
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

function createMindbodyError(response: Response, payload: unknown, phase: MindbodyRequestPhase): ProviderRequestError {
  const message = extractMindbodyErrorMessage(payload) ?? response.statusText ?? "Mindbody request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(409, message);
  }

  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractMindbodyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const firstError = Array.isArray(record.errors) ? record.errors[0] : undefined;
  const firstErrorRecord = optionalRecord(firstError);
  return (
    optionalString(record.message) ??
    optionalString(record.error_description) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(firstError) ??
    optionalString(firstErrorRecord?.message) ??
    optionalString(firstErrorRecord?.detail)
  );
}

function normalizeListBusinessesPayload(payload: unknown): MindbodyListBusinessesOutput {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Mindbody response was not an object");
  }

  if (!Array.isArray(record.businesses)) {
    throw new ProviderRequestError(502, "Mindbody response did not include a businesses array");
  }

  return {
    pageCount: optionalNumber(record.pageCount) ?? null,
    businesses: record.businesses.map((business) => normalizeBusinessPayload(business)),
  };
}

function normalizeBusinessPayload(payload: unknown): MindbodyBusinessPayload {
  const business = optionalRecord(payload);
  if (!business) {
    throw new ProviderRequestError(502, "Mindbody business payload was not an object");
  }

  const locations = Array.isArray(business.locations)
    ? business.locations.map((location) => normalizeLocationPayload(location))
    : [];

  return {
    ...business,
    locations,
  };
}

function normalizeLocationPayload(payload: unknown): Record<string, unknown> {
  const location = optionalRecord(payload);
  if (!location) {
    throw new ProviderRequestError(502, "Mindbody location payload was not an object");
  }

  return location;
}
