import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { isAbortLikeError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const bunnyApiBaseUrl = "https://api.bunny.net";
const validationPath = "/pullzone";

type BunnyRequestPhase = "validate" | "execute";
type BunnyRequestMethod = "GET" | "POST";
type BunnyActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type BunnyQueryValue = string | number | boolean | undefined;

interface BunnyRequestInput {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  path: string;
  phase: BunnyRequestPhase;
  method?: BunnyRequestMethod;
  query?: Record<string, BunnyQueryValue>;
  body?: unknown;
}

export const bunnycdnActionHandlers: ProviderActionHandlers<"bunnycdn", BunnyActionHandler> = {
  list_pull_zones(input, context) {
    return bunnyListPullZones(input, context);
  },
  get_pull_zone(input, context) {
    return bunnyGetPullZone(input, context);
  },
  purge_pull_zone_cache(input, context) {
    return bunnyPurgePullZoneCache(input, context);
  },
};

export async function validateBunnycdnCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await bunnyRequest({
    apiKey,
    fetcher,
    signal,
    path: validationPath,
    query: {
      page: 1,
      perPage: 1,
    },
    phase: "validate",
  });
  const result = normalizePullZoneListPayload(payload);
  const firstPullZone = optionalRecord(result.pullZones[0]);

  return {
    profile: {
      accountId: "bunnycdn:api_key",
      displayName: "Bunny API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/pullzone?page=1&perPage=1",
      firstPullZoneId: optionalInteger(firstPullZone?.Id),
      firstPullZoneName: optionalString(firstPullZone?.Name),
      totalItems: result.totalItems,
    }),
  };
}

async function bunnyListPullZones(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await bunnyRequest({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: validationPath,
    query: compactObject({
      page: optionalInteger(input.page),
      perPage: optionalInteger(input.perPage),
      search: optionalString(input.search),
      includeCertificate: typeof input.includeCertificate === "boolean" ? input.includeCertificate : undefined,
    }),
    phase: "execute",
  });

  return normalizePullZoneListPayload(payload);
}

async function bunnyGetPullZone(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const pullZoneId = requiredPullZoneId(input.pullZoneId);
  const payload = await bunnyRequest({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/pullzone/${pullZoneId}`,
    query: compactObject({
      includeCertificate: typeof input.includeCertificate === "boolean" ? input.includeCertificate : undefined,
    }),
    phase: "execute",
  });

  return {
    pullZone: sanitizePullZone(payload, "bunnycdn get_pull_zone did not return an object"),
  };
}

async function bunnyPurgePullZoneCache(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const pullZoneId = requiredPullZoneId(input.pullZoneId);
  const cacheTag = optionalString(input.cacheTag);
  await bunnyRequest({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    path: `/pullzone/${pullZoneId}/purgeCache`,
    method: "POST",
    body: cacheTag ? { CacheTag: cacheTag } : undefined,
    phase: "execute",
  });

  return compactObject({
    pullZoneId,
    purged: true,
    cacheTag,
  });
}

async function bunnyRequest(input: BunnyRequestInput): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetcher(buildBunnyUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: bunnyHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? error.message : "bunnycdn request failed",
    );
  }

  let payload: unknown;
  try {
    payload = await readBunnyPayload(response);
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "invalid bunnycdn response payload");
  }
  if (!response.ok) {
    throw createBunnyError(response, payload, input.phase);
  }

  return payload;
}

function buildBunnyUrl(path: string, query?: Record<string, BunnyQueryValue>): string {
  const url = new URL(path, bunnyApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function bunnyHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    AccessKey: apiKey,
    "User-Agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readBunnyPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

function normalizePullZoneListPayload(payload: unknown): {
  pullZones: Record<string, unknown>[];
  currentPage?: number;
  totalItems?: number;
  hasMoreItems?: boolean;
} {
  if (Array.isArray(payload)) {
    return {
      pullZones: payload.map((item, index) =>
        sanitizePullZone(item, `bunnycdn list_pull_zones returned a non-object item at index ${index}`),
      ),
    };
  }

  const envelope = optionalRecord(payload);
  if (!envelope) {
    throw new ProviderRequestError(502, "bunnycdn list_pull_zones did not return a list");
  }

  if (!Array.isArray(envelope.Items)) {
    throw new ProviderRequestError(502, "bunnycdn list_pull_zones did not return Items");
  }

  return compactObject({
    pullZones: envelope.Items.map((item, index) =>
      sanitizePullZone(item, `bunnycdn list_pull_zones returned a non-object item at index ${index}`),
    ),
    currentPage: optionalInteger(envelope.CurrentPage),
    totalItems: optionalInteger(envelope.TotalItems),
    hasMoreItems: typeof envelope.HasMoreItems === "boolean" ? envelope.HasMoreItems : undefined,
  }) as {
    pullZones: Record<string, unknown>[];
    currentPage?: number;
    totalItems?: number;
    hasMoreItems?: boolean;
  };
}

function sanitizePullZone(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return removeBunnyCertificateKeys(record) as Record<string, unknown>;
}

function removeBunnyCertificateKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeBunnyCertificateKeys);
  }
  const record = optionalRecord(value);
  if (!record) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(record)) {
    if (key !== "CertificateKey") {
      sanitized[key] = removeBunnyCertificateKeys(fieldValue);
    }
  }
  return sanitized;
}

function createBunnyError(response: Response, payload: unknown, phase: BunnyRequestPhase): ProviderRequestError {
  const errorBody = optionalRecord(payload);
  const message =
    optionalString(errorBody?.Message) ??
    (typeof payload === "string" && payload.length > 0 ? payload : undefined) ??
    response.statusText ??
    `bunnycdn request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status, message);
}

function requiredPullZoneId(value: unknown): number {
  const pullZoneId = optionalInteger(value);
  if (pullZoneId === undefined || pullZoneId <= 0) {
    throw new ProviderRequestError(400, "pullZoneId must be a positive integer");
  }
  return pullZoneId;
}
