import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalInteger, optionalRecord, optionalString, pickOptionalInteger } from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const aircallApiBaseUrl = "https://api.aircall.io";
const aircallRequestBaseUrl = "https://api.aircall.io/";
const aircallValidationPath = "/v1/ping";

type AircallRequestPhase = "validate" | "execute";

export interface AircallActionContext {
  apiId: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AircallRequestInput {
  path: string;
  phase: AircallRequestPhase;
  query?: Record<string, string | undefined>;
}

interface AircallListRequest {
  path: string;
  resourceName: string;
  query?: Record<string, string | undefined>;
}

type AircallActionHandler = (input: Record<string, unknown>, context: AircallActionContext) => Promise<unknown>;

export const aircallActionHandlers: ProviderActionHandlers<"aircall", AircallActionHandler> = {
  list_users(input, context) {
    return executeListResources(context, {
      path: "/v2/users",
      resourceName: "users",
      query: buildPaginationQuery(input),
    });
  },
  get_user(input, context) {
    return executeGetResource(input, context, "/v2/users", "user");
  },
  list_teams(input, context) {
    return executeListResources(context, {
      path: "/v1/teams",
      resourceName: "teams",
      query: buildPaginationQuery(input),
    });
  },
  get_team(input, context) {
    return executeGetResource(input, context, "/v1/teams", "team");
  },
  list_numbers(input, context) {
    return executeListResources(context, {
      path: "/v1/numbers",
      resourceName: "numbers",
      query: buildPaginationQuery(input),
    });
  },
  get_number(input, context) {
    return executeGetResource(input, context, "/v1/numbers", "number");
  },
  list_contacts(input, context) {
    return executeListResources(context, {
      path: "/v1/contacts",
      resourceName: "contacts",
      query: queryParams({
        ...buildPaginationQuery(input),
        order: optionalString(input.order),
      }),
    });
  },
  get_contact(input, context) {
    return executeGetResource(input, context, "/v1/contacts", "contact");
  },
  list_calls(input, context) {
    return executeListResources(context, {
      path: "/v1/calls",
      resourceName: "calls",
      query: queryParams({
        ...buildPaginationQuery(input),
        from: optionalString(input.from),
        to: optionalString(input.to),
        order: optionalString(input.order),
        fetch_contact: readOptionalBooleanString(input.fetchContact),
        fetch_short_urls: readOptionalBooleanString(input.fetchShortUrls),
        fetch_call_timeline: readOptionalBooleanString(input.fetchCallTimeline),
      }),
    });
  },
  get_call(input, context) {
    return executeGetResource(input, context, "/v1/calls", "call", {
      fetch_contact: readOptionalBooleanString(input.fetchContact),
      fetch_short_urls: readOptionalBooleanString(input.fetchShortUrls),
      fetch_call_timeline: readOptionalBooleanString(input.fetchCallTimeline),
    });
  },
};

export async function validateAircallCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiId = requiredAircallApiId(input.values.apiId);
  await requestAircallJson(
    {
      apiId,
      apiKey: input.apiKey,
      fetcher,
      signal,
    },
    {
      path: aircallValidationPath,
      phase: "validate",
    },
  );

  return {
    profile: {
      accountId: apiId,
      displayName: `Aircall API ${apiId}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: aircallApiBaseUrl,
      validationEndpoint: aircallValidationPath,
      apiId,
    },
  };
}

async function executeListResources(context: AircallActionContext, request: AircallListRequest): Promise<unknown> {
  const payload = await requestAircallJson(context, {
    path: request.path,
    query: request.query,
    phase: "execute",
  });
  const record = requireRecord(payload, `Aircall ${request.resourceName} response`);
  return {
    [request.resourceName]: requireArray(record[request.resourceName], `Aircall ${request.resourceName}`),
    pagination: normalizePagination(record.meta),
    raw: record,
  };
}

async function executeGetResource(
  input: Record<string, unknown>,
  context: AircallActionContext,
  collectionPath: string,
  resourceName: string,
  query?: Record<string, string | undefined>,
): Promise<unknown> {
  const id = requirePositiveInteger(input.id, "id");
  const payload = await requestAircallJson(context, {
    path: `${collectionPath}/${encodePathSegment(id)}`,
    query,
    phase: "execute",
  });
  const record = requireRecord(payload, `Aircall ${resourceName} response`);
  return {
    [resourceName]: record[resourceName] == null ? null : requireRecord(record[resourceName], resourceName),
    raw: record,
  };
}

async function requestAircallJson(context: AircallActionContext, input: AircallRequestInput): Promise<unknown> {
  const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(path, aircallRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: buildAircallHeaders(context.apiId, context.apiKey),
      signal: timeout.signal,
    });
    const payload = await readAircallPayload(response);
    if (!response.ok) {
      throw createAircallError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Aircall request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Aircall request failed: ${error.message}` : "Aircall request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return queryParams({
    page: pickOptionalInteger(input, "page"),
    per_page: pickOptionalInteger(input, "perPage"),
  });
}

function normalizePagination(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Aircall meta");
  return {
    count: readRequiredInteger(record.count, "meta.count"),
    total: readRequiredInteger(record.total, "meta.total"),
    currentPage: readRequiredInteger(record.current_page, "meta.current_page"),
    perPage: readRequiredInteger(record.per_page, "meta.per_page"),
    nextPageLink: nullableTrimmedString(record.next_page_link),
    previousPageLink: nullableTrimmedString(record.previous_page_link),
    raw: record,
  };
}

export function buildAircallHeaders(apiId: string, apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(apiId, apiKey),
    "user-agent": providerUserAgent,
  };
}

async function readAircallPayload(response: Response): Promise<unknown> {
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

function createAircallError(status: number, payload: unknown, phase: AircallRequestPhase): ProviderRequestError {
  const message = extractAircallErrorMessage(payload) ?? `Aircall request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && [400, 401, 402, 403].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && [401, 403].includes(status)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && [400, 404, 405, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAircallErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.troubleshoot);
}

export function requiredAircallApiId(value: unknown): string {
  const apiId = optionalString(value);
  if (!apiId) {
    throw new ProviderRequestError(400, "apiId is required");
  }
  return apiId;
}

export function resolveStoredAircallApiId(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const apiId = optionalString(values.apiId) ?? optionalString(metadata.apiId);
  if (!apiId) {
    throw new ProviderRequestError(500, "stored apiId is missing for aircall credential");
  }
  return apiId;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`, value);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return record;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `${fieldName} is missing`, value);
  }
  return parsed;
}

function readOptionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? (value ? "true" : "false") : undefined;
}

function nullableTrimmedString(value: unknown): string | null {
  return value == null ? null : (optionalString(value) ?? null);
}

function buildBasicAuthorizationHeader(apiId: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${apiId}:${apiKey}`, "utf8").toString("base64")}`;
}
