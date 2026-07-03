import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BlazeMeterFunctionalActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalScalarString, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const blazeMeterFunctionalApiBaseUrl = "https://a.blazemeter.com/api/v4";
const blazeMeterFunctionalRequestBaseUrl = "https://a.blazemeter.com/api/v4/";
const blazeMeterFunctionalValidationPath = "/user";
const blazeMeterFunctionalDefaultTimeoutMs = 30_000;

type BlazeMeterFunctionalPhase = "validate" | "execute";
type BlazeMeterFunctionalQuery = Record<string, boolean | number | string | string[] | undefined>;
type BlazeMeterFunctionalActionHandler = ProviderRuntimeHandler<BlazeMeterFunctionalContext>;

interface BlazeMeterFunctionalContext {
  apiKeyId: string;
  apiSecret: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BlazeMeterFunctionalRequestInput {
  path: string;
  phase: BlazeMeterFunctionalPhase;
  query?: BlazeMeterFunctionalQuery;
}

export const blazeMeterFunctionalActionHandlers: Record<
  BlazeMeterFunctionalActionName,
  BlazeMeterFunctionalActionHandler
> = {
  list_multi_tests(input, context) {
    return requestBlazeMeterFunctionalJson(context, {
      path: "/multi-tests",
      query: buildQuery({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        ...buildPaginationQuery(input),
      }),
      phase: "execute",
    });
  },
  get_multi_test(input, context) {
    return requestBlazeMeterFunctionalJson(context, {
      path: `/multi-tests/${input.collectionId}`,
      query: buildQuery({
        populateTests: input.populateTests,
      }),
      phase: "execute",
    });
  },
  get_active_sessions(_input, context) {
    return requestBlazeMeterFunctionalJson(context, {
      path: "/user/active-sessions",
      phase: "execute",
    });
  },
};

export type { BlazeMeterFunctionalContext };

export async function validateBlazeMeterFunctionalCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKeyId = requireApiKeyId(input.values.apiKeyId);
  const payload = await requestBlazeMeterFunctionalJson(
    {
      apiKeyId,
      apiSecret: input.apiKey,
      fetcher,
      signal,
    },
    {
      path: blazeMeterFunctionalValidationPath,
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
      apiBaseUrl: blazeMeterFunctionalApiBaseUrl,
      validationEndpoint: blazeMeterFunctionalValidationPath,
      apiKeyId,
      userId,
      email,
      displayName,
    }),
  };
}

async function requestBlazeMeterFunctionalJson(
  context: BlazeMeterFunctionalContext,
  input: BlazeMeterFunctionalRequestInput,
): Promise<Record<string, unknown>> {
  const url = new URL(
    input.path.startsWith("/") ? input.path.slice(1) : input.path,
    blazeMeterFunctionalRequestBaseUrl,
  );
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const timeout = createProviderTimeout(context.signal, blazeMeterFunctionalDefaultTimeoutMs);
  try {
    const response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: blazeMeterFunctionalHeaders(context),
      signal: timeout.signal,
    });
    const payload = await readBlazeMeterFunctionalPayload(response);
    if (!response.ok) {
      throw createBlazeMeterFunctionalError(response, payload, input.phase);
    }
    return normalizeBlazeMeterFunctionalEnvelope(payload);
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

function blazeMeterFunctionalHeaders(
  context: Pick<BlazeMeterFunctionalContext, "apiKeyId" | "apiSecret">,
): Record<string, string> {
  return {
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(context.apiKeyId, context.apiSecret),
    "user-agent": providerUserAgent,
  };
}

async function readBlazeMeterFunctionalPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "BlazeMeter returned malformed JSON", text);
    }
    return text;
  }
}

function createBlazeMeterFunctionalError(
  response: Response,
  payload: unknown,
  phase: BlazeMeterFunctionalPhase,
): ProviderRequestError {
  const message =
    extractBlazeMeterFunctionalErrorMessage(payload) ?? response.statusText ?? "BlazeMeter request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractBlazeMeterFunctionalErrorMessage(payload: unknown): string | undefined {
  const envelope = optionalRecord(payload);
  const error = optionalRecord(envelope?.error);
  return (
    readOptionalString(error?.message) ?? readOptionalString(envelope?.message) ?? readOptionalString(envelope?.error)
  );
}

function normalizeBlazeMeterFunctionalEnvelope(payload: unknown): Record<string, unknown> {
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
    error: normalizeBlazeMeterFunctionalError(envelope.error),
    result: envelope.result,
    total: readNullableInteger(envelope.total),
    limit: readNullableInteger(envelope.limit),
    skip: readNullableInteger(envelope.skip),
    hidden: readNullableInteger(envelope.hidden),
    raw: envelope,
  };
}

function normalizeBlazeMeterFunctionalError(value: unknown): Record<string, unknown> | null {
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

function buildPaginationQuery(input: Record<string, unknown>): BlazeMeterFunctionalQuery {
  return buildQuery({
    skip: readOptionalQueryValue(input.skip),
    limit: readOptionalQueryValue(input.limit),
    sort: Array.isArray(input.sort) ? input.sort.map((value) => String(value).trim()) : undefined,
  });
}

function buildQuery(input: Record<string, unknown>): BlazeMeterFunctionalQuery {
  return compactObject(
    Object.fromEntries(Object.entries(input).map(([key, value]) => [key, readOptionalQueryValue(value)])),
  ) as BlazeMeterFunctionalQuery;
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

export function requireBlazeMeterFunctionalApiKeyId(value: unknown): string {
  const apiKeyId = optionalString(value);
  if (!apiKeyId) {
    throw new ProviderRequestError(500, "BlazeMeter apiKeyId is missing");
  }
  return apiKeyId;
}

function buildBasicAuthorizationHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}
