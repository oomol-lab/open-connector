import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BlazeMeterPerformanceActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalScalarString, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const blazeMeterPerformanceApiBaseUrl = "https://a.blazemeter.com/api/v4";
const blazeMeterPerformanceRequestBaseUrl = "https://a.blazemeter.com/api/v4/";
const blazeMeterPerformanceValidationPath = "/user";
const blazeMeterPerformanceDefaultTimeoutMs = 30_000;

type BlazeMeterPerformancePhase = "validate" | "execute";
type BlazeMeterPerformanceQuery = Record<string, boolean | number | string | string[] | undefined>;
type BlazeMeterPerformanceActionHandler = ProviderRuntimeHandler<BlazeMeterPerformanceContext>;

interface BlazeMeterPerformanceContext {
  apiKeyId: string;
  apiSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BlazeMeterPerformanceRequestInput {
  path: string;
  phase: BlazeMeterPerformancePhase;
  query?: BlazeMeterPerformanceQuery;
}

export const blazeMeterPerformanceActionHandlers: Record<
  BlazeMeterPerformanceActionName,
  BlazeMeterPerformanceActionHandler
> = {
  get_user(_input, context) {
    return requestBlazeMeterPerformanceJson(context, {
      path: blazeMeterPerformanceValidationPath,
      phase: "execute",
    });
  },
  list_accounts(input, context) {
    return requestBlazeMeterPerformanceJson(context, {
      path: "/accounts",
      query: buildPaginationQuery(input),
      phase: "execute",
    });
  },
  list_workspaces(input, context) {
    return requestBlazeMeterPerformanceJson(context, {
      path: "/workspaces",
      query: buildQuery({
        accountId: input.accountId,
        enabled: input.enabled,
        textFilter: optionalString(input.textFilter),
      }),
      phase: "execute",
    });
  },
  list_projects(input, context) {
    return requestBlazeMeterPerformanceJson(context, {
      path: "/projects",
      query: buildQuery({
        workspaceId: input.workspaceId,
        ...buildPaginationQuery(input),
      }),
      phase: "execute",
    });
  },
  list_tests(input, context) {
    return requestBlazeMeterPerformanceJson(context, {
      path: "/tests",
      query: buildQuery({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        ...buildPaginationQuery(input),
      }),
      phase: "execute",
    });
  },
  get_test(input, context) {
    return requestBlazeMeterPerformanceJson(context, {
      path: `/tests/${input.testId}`,
      phase: "execute",
    });
  },
};

export type { BlazeMeterPerformanceContext };

export async function validateBlazeMeterPerformanceCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKeyId = requireApiKeyId(input.values.apiKeyId);
  const payload = await requestBlazeMeterPerformanceJson(
    {
      apiKeyId,
      apiSecret: input.apiKey,
      fetcher,
      signal,
    },
    {
      path: blazeMeterPerformanceValidationPath,
      phase: "validate",
    },
  );
  const envelope = optionalRecord(payload);
  const user = optionalRecord(envelope?.result);
  const userId = readOptionalString(user?.id);
  const email = readOptionalString(user?.email);
  const displayName = readOptionalString(user?.displayName);
  const name = readOptionalString(user?.name);

  return {
    profile: {
      accountId: userId,
      displayName: email ?? displayName ?? name ?? "BlazeMeter API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: blazeMeterPerformanceApiBaseUrl,
      validationEndpoint: blazeMeterPerformanceValidationPath,
      apiKeyId,
      userId,
      email,
      displayName,
    }),
  };
}

async function requestBlazeMeterPerformanceJson(
  context: BlazeMeterPerformanceContext,
  input: BlazeMeterPerformanceRequestInput,
): Promise<Record<string, unknown>> {
  const url = new URL(
    input.path.startsWith("/") ? input.path.slice(1) : input.path,
    blazeMeterPerformanceRequestBaseUrl,
  );
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const timeout = createProviderTimeout(context.signal, blazeMeterPerformanceDefaultTimeoutMs);
  try {
    const response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: blazeMeterPerformanceHeaders(context),
      signal: timeout.signal,
    });
    const payload = await readBlazeMeterPerformancePayload(response);
    if (!response.ok) {
      throw createBlazeMeterPerformanceError(response, payload, input.phase);
    }
    return normalizeBlazeMeterPerformanceEnvelope(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "BlazeMeter request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BlazeMeter request failed: ${error.message}` : "BlazeMeter request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function blazeMeterPerformanceHeaders(
  context: Pick<BlazeMeterPerformanceContext, "apiKeyId" | "apiSecret">,
): Record<string, string> {
  return {
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(context.apiKeyId, context.apiSecret),
    "user-agent": providerUserAgent,
  };
}

async function readBlazeMeterPerformancePayload(response: Response): Promise<unknown> {
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

function createBlazeMeterPerformanceError(
  response: Response,
  payload: unknown,
  phase: BlazeMeterPerformancePhase,
): ProviderRequestError {
  const message =
    extractBlazeMeterPerformanceErrorMessage(payload) ?? response.statusText ?? "BlazeMeter request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractBlazeMeterPerformanceErrorMessage(payload: unknown): string | undefined {
  const envelope = optionalRecord(payload);
  const error = optionalRecord(envelope?.error);
  return (
    readOptionalString(error?.message) ?? readOptionalString(envelope?.message) ?? readOptionalString(envelope?.error)
  );
}

function normalizeBlazeMeterPerformanceEnvelope(payload: unknown): Record<string, unknown> {
  const envelope = optionalRecord(payload);
  if (!envelope) {
    return {
      apiVersion: null,
      requestId: null,
      error: null,
      result: payload,
      total: null,
      limit: null,
      skip: null,
      hidden: null,
      raw: {},
    };
  }

  return {
    apiVersion: readNullableInteger(envelope.api_version),
    requestId: readNullableString(envelope.request_id),
    error: normalizeBlazeMeterPerformanceError(envelope.error),
    result: envelope.result,
    total: readNullableInteger(envelope.total),
    limit: readNullableInteger(envelope.limit),
    skip: readNullableInteger(envelope.skip),
    hidden: readNullableInteger(envelope.hidden),
    raw: envelope,
  };
}

function normalizeBlazeMeterPerformanceError(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  const error = optionalRecord(value);
  if (!error) {
    return {
      code: null,
      message: readNullableString(value),
    };
  }

  return {
    code: readNullableInteger(error.code),
    message: readNullableString(error.message),
  };
}

function buildPaginationQuery(input: Record<string, unknown>): BlazeMeterPerformanceQuery {
  return buildQuery({
    skip: readOptionalQueryValue(input.skip),
    limit: readOptionalQueryValue(input.limit),
    sort: Array.isArray(input.sort) ? input.sort.map((value) => String(value).trim()) : undefined,
  });
}

function buildQuery(input: Record<string, unknown>): BlazeMeterPerformanceQuery {
  return compactObject(
    Object.fromEntries(Object.entries(input).map(([key, value]) => [key, readOptionalQueryValue(value)])),
  ) as BlazeMeterPerformanceQuery;
}

function readOptionalQueryValue(value: unknown): boolean | number | string | string[] | undefined {
  if (value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return undefined;
}

function appendQueryValue(url: URL, key: string, value: boolean | number | string | string[] | undefined): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      url.searchParams.append(key, child);
    }
    return;
  }

  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

function requireApiKeyId(value: unknown): string {
  const apiKeyId = optionalString(value);
  if (!apiKeyId) {
    throw new ProviderRequestError(400, "apiKeyId is required");
  }
  return apiKeyId;
}

function readOptionalString(value: unknown): string | undefined {
  return value == null ? undefined : optionalScalarString(value);
}

function readNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

function readNullableInteger(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

export function requireBlazeMeterPerformanceApiKeyId(value: unknown): string {
  const apiKeyId = optionalString(value);
  if (!apiKeyId) {
    throw new ProviderRequestError(500, "BlazeMeter apiKeyId is missing");
  }
  return apiKeyId;
}

function buildBasicAuthorizationHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
