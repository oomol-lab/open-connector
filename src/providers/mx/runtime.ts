import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalBooleanOrNull,
  optionalInteger,
  optionalIntegerOrNull,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const mxApiBaseUrl = "https://api.mx.com";

const mxRequestBaseUrl = "https://api.mx.com/";
const mxVersion = "v20250224";
const mxValidationPath = "/users";

type MxPhase = "validate" | "execute";
export interface MxContext {
  apiKey: string;
  clientId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type MxRequestInput = MxContext & {
  method: "DELETE" | "GET" | "POST" | "PUT";
  path: string;
  phase: MxPhase;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
};

export async function validateMxCredential(
  apiKey: string,
  clientId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestMxJson({
    method: "GET",
    path: mxValidationPath,
    query: {
      records_per_page: "10",
      page: "1",
    },
    apiKey,
    clientId,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: clientId,
      displayName: `MX ${clientId}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: mxApiBaseUrl,
      apiVersion: mxVersion,
      validationEndpoint: mxValidationPath,
      clientId,
    },
  };
}

export const mxActionHandlers: ProviderActionHandlers<"mx", ProviderRuntimeHandler<MxContext>> = {
  list_users: listUsers,
  create_user(input, context) {
    return writeUser({
      method: "POST",
      path: "/users",
      user: readUserPatch(input.user),
      context,
    });
  },
  read_user: readUser,
  update_user(input, context) {
    return writeUser({
      method: "PUT",
      path: `/users/${encodeURIComponent(requiredString(input.userIdentifier, "userIdentifier", providerInputError))}`,
      user: readUserPatch(input.user),
      context,
    });
  },
  delete_user: deleteUser,
};

async function listUsers(input: Record<string, unknown>, context: MxContext) {
  const payload = await requestMxJson({
    method: "GET",
    path: "/users",
    query: compactObject({
      page: stringifyOptionalInteger(optionalInteger(input.page)),
      records_per_page: stringifyOptionalInteger(optionalInteger(input.recordsPerPage)),
      id: optionalString(input.id),
      email: optionalString(input.email),
      is_disabled: stringifyOptionalBoolean(optionalBoolean(input.isDisabled)),
    }),
    ...context,
    phase: "execute",
  });

  return normalizeUsersResponse(payload);
}

async function readUser(input: Record<string, unknown>, context: MxContext) {
  const userIdentifier = requiredString(input.userIdentifier, "userIdentifier", providerInputError);
  const payload = await requestMxJson({
    method: "GET",
    path: `/users/${encodeURIComponent(userIdentifier)}`,
    ...context,
    phase: "execute",
  });

  return normalizeUserResponse(payload);
}

async function writeUser(input: {
  method: "POST" | "PUT";
  path: string;
  user: Record<string, unknown>;
  context: MxContext;
}) {
  const payload = await requestMxJson({
    method: input.method,
    path: input.path,
    body: {
      user: input.user,
    },
    ...input.context,
    phase: "execute",
  });

  return normalizeUserResponse(payload);
}

async function deleteUser(input: Record<string, unknown>, context: MxContext) {
  const userIdentifier = requiredString(input.userIdentifier, "userIdentifier", providerInputError);
  const payload = await requestMxJson({
    method: "DELETE",
    path: `/users/${encodeURIComponent(userIdentifier)}`,
    ...context,
    phase: "execute",
  });

  return {
    deleted: true,
    status: payload === null ? 204 : 200,
  };
}

async function requestMxJson(input: MxRequestInput) {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, mxRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: mxHeaders(input.clientId, input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "MX request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MX request failed: ${error.message}` : "MX request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readMxPayload(response);
  if (!response.ok) {
    throw createMxError(response, payload, input.phase);
  }
  return payload;
}

function mxHeaders(clientId: string, apiKey: string, includeContentType: boolean) {
  return {
    accept: "application/vnd.mx.api.v1+json",
    "accept-version": mxVersion,
    authorization: buildBasicAuthorizationHeader(clientId, apiKey),
    ...(includeContentType ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

function buildBasicAuthorizationHeader(clientId: string, apiKey: string) {
  return `Basic ${Buffer.from(`${clientId}:${apiKey}`).toString("base64")}`;
}

async function readMxPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMxError(response: Response, payload: unknown, phase: MxPhase) {
  const message = extractMxErrorMessage(payload) ?? response.statusText ?? "MX request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" || response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function extractMxErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return (
    optionalString(error?.message) ??
    optionalString(error?.type) ??
    optionalString(record?.message) ??
    optionalString(payload)
  );
}

function normalizeUsersResponse(payload: unknown) {
  const record = requiredRecord(payload, "MX list users response", providerResponseError);
  const usersValue = record.users;
  if (!Array.isArray(usersValue)) {
    throw new ProviderRequestError(502, "MX list users response missing users array");
  }
  return {
    users: usersValue.map(normalizeUser),
    pagination: normalizePagination(record.pagination),
    raw: record,
  };
}

function normalizeUserResponse(payload: unknown) {
  const record = requiredRecord(payload, "MX user response", providerResponseError);
  return {
    user: normalizeUser(record.user),
  };
}

function normalizeUser(value: unknown) {
  const record = requiredRecord(value, "MX user", providerResponseError);
  return {
    guid: optionalStringOrNull(record.guid),
    id: optionalStringOrNull(record.id),
    email: optionalStringOrNull(record.email),
    isDisabled: optionalBooleanOrNull(record.is_disabled),
    metadata: optionalStringOrNull(record.metadata),
    raw: record,
  };
}

function normalizePagination(value: unknown) {
  const record = optionalRecord(value);
  return {
    currentPage: optionalIntegerOrNull(record?.current_page),
    perPage: optionalIntegerOrNull(record?.per_page),
    totalEntries: optionalIntegerOrNull(record?.total_entries),
    totalPages: optionalIntegerOrNull(record?.total_pages),
    raw: record ?? null,
  };
}

function readUserPatch(value: unknown) {
  const record = requiredRecord(value, "user", providerInputError);
  const patch = compactObject({
    id: optionalString(record.id),
    email: optionalString(record.email),
    is_disabled: optionalBoolean(record.isDisabled),
    metadata: optionalString(record.metadata),
  });
  if (Object.keys(patch).length === 0) {
    throw new ProviderRequestError(400, "At least one user field is required.");
  }
  return patch;
}

function stringifyOptionalInteger(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function stringifyOptionalBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : String(value);
}
