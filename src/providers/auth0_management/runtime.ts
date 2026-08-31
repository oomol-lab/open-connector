import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalIntegerLike,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { providerInputError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const auth0ApiSegment = "api/v2";
const auth0CredentialHelpUrl = "https://auth0.com/docs/api/management/v2";
const auth0ManagementRequestTimeoutMs = 30_000;

type Auth0ManagementPhase = "validate" | "execute";
type Auth0QueryValue = string | number | boolean | undefined;
type Auth0ActionHandler = (input: Record<string, unknown>, context: Auth0ActionContext) => Promise<unknown>;

interface Auth0ActionContext {
  apiKey: string;
  domain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface Auth0ManagementRequest {
  apiKey: string;
  domain: string;
  path: string;
  query?: Record<string, Auth0QueryValue>;
  method?: string;
  body?: unknown;
  fetcher: typeof fetch;
  phase: Auth0ManagementPhase;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}

export const auth0ManagementActionHandlers: ProviderActionHandlers<"auth0_management", Auth0ActionHandler> = {
  list_users(input, context) {
    return listUsers(input, context);
  },
  search_users_by_email(input, context) {
    return searchUsersByEmail(input, context);
  },
  get_user(input, context) {
    return getUser(input, context);
  },
  list_roles(input, context) {
    return listRoles(input, context);
  },
  get_role(input, context) {
    return getRole(input, context);
  },
  list_user_roles(input, context) {
    return listUserRoles(input, context);
  },
  list_user_permissions(input, context) {
    return listUserPermissions(input, context);
  },
  list_user_effective_permissions(input, context) {
    return listUserEffectivePermissions(input, context);
  },
  list_user_effective_roles(input, context) {
    return listUserEffectiveRoles(input, context);
  },
  assign_roles_to_user(input, context) {
    return updateUserRoles(input, context, "POST");
  },
  remove_roles_from_user(input, context) {
    return updateUserRoles(input, context, "DELETE");
  },
  list_role_permissions(input, context) {
    return listRolePermissions(input, context);
  },
  add_permissions_to_role(input, context) {
    return updateRolePermissions(input, context, "POST");
  },
  remove_permissions_from_role(input, context) {
    return updateRolePermissions(input, context, "DELETE");
  },
  list_role_users(input, context) {
    return listRoleUsers(input, context);
  },
};

export async function validateAuth0ManagementCredential(
  apiKey: string,
  domainValue: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const domain = normalizeAuth0ManagementDomain(domainValue);
  const payload = await requestAuth0ManagementJson({
    apiKey,
    domain,
    path: "/users",
    query: {
      page: 0,
      per_page: 1,
    },
    fetcher,
    phase: "validate",
    signal,
  });
  const users = normalizeListPayload(payload, "users");
  const sampleUserId = users.map((user) => optionalString(user.user_id)).find(Boolean);

  return {
    profile: {
      accountId: `auth0_management:${domain}`,
      displayName: `Auth0 ${domain}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      domain,
      apiBaseUrl: buildAuth0ManagementBaseUrl(domain),
      validationEndpoint: `/${auth0ApiSegment}/users?page=0&per_page=1`,
      credentialHelpUrl: auth0CredentialHelpUrl,
      sampleUserId,
    }),
  };
}

export function buildAuth0ManagementBaseUrl(domainValue: string): string {
  const domain = normalizeAuth0ManagementDomain(domainValue);
  return `https://${domain}/${auth0ApiSegment}`;
}

function normalizeAuth0ManagementDomain(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "domain is required");
  }

  let url: URL;
  try {
    url =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? new URL(trimmed)
        : new URL(`https://${trimmed}`);
  } catch {
    throw new ProviderRequestError(400, "domain must be an Auth0 tenant domain");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "domain must use HTTPS");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new ProviderRequestError(400, "domain must be an Auth0 tenant domain, not an API path");
  }

  const domain = url.hostname.toLowerCase();
  if (!isValidAuth0Domain(domain)) {
    throw new ProviderRequestError(400, "domain must be an Auth0 tenant domain");
  }
  return domain;
}

function isValidAuth0Domain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 253) {
    return false;
  }
  return domain.endsWith(".auth0.com") || domain.endsWith(".auth0app.com");
}

async function listUsers(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: "/users",
    query: buildUsersQuery(input),
    phase: "execute",
  });

  return {
    users: normalizeListPayload(payload, "users"),
    raw: normalizeRawListPayload(payload),
  };
}

async function searchUsersByEmail(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: "/users-by-email",
    query: {
      email: readRequiredString(input.email, "email"),
    },
    phase: "execute",
  });

  return {
    users: normalizeListPayload(payload, "users"),
    raw: normalizeRawListPayload(payload),
  };
}

async function getUser(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const userId = readRequiredString(input.userId, "userId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/users/${encodeURIComponent(userId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return { user: normalizeRawObject(payload) };
}

async function listRoles(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: "/roles",
    query: compactObject({
      ...buildPaginationQuery(input),
      name_filter: optionalString(input.nameFilter),
    }),
    phase: "execute",
  });

  return {
    roles: normalizeListPayload(payload, "roles"),
    raw: normalizeRawListPayload(payload),
  };
}

async function getRole(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const roleId = readRequiredString(input.roleId, "roleId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/roles/${encodeURIComponent(roleId)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return { role: normalizeRawObject(payload) };
}

async function listUserRoles(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const userId = readRequiredString(input.userId, "userId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/users/${encodeURIComponent(userId)}/roles`,
    query: buildPaginationQuery(input),
    phase: "execute",
  });

  return {
    roles: normalizeListPayload(payload, "roles"),
    raw: normalizeRawListPayload(payload),
  };
}

async function listUserPermissions(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const userId = readRequiredString(input.userId, "userId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/users/${encodeURIComponent(userId)}/permissions`,
    query: buildPaginationQuery(input),
    phase: "execute",
  });

  return {
    permissions: normalizeListPayload(payload, "permissions"),
    raw: normalizeRawListPayload(payload),
  };
}

async function listUserEffectivePermissions(
  input: Record<string, unknown>,
  context: Auth0ActionContext,
): Promise<unknown> {
  const userId = readRequiredString(input.userId, "userId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/users/${encodeURIComponent(userId)}/effective-permissions`,
    query: buildPaginationQuery(input),
    phase: "execute",
  });

  return {
    permissions: normalizeListPayload(payload, "permissions"),
    raw: normalizeRawListPayload(payload),
  };
}

async function listUserEffectiveRoles(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const userId = readRequiredString(input.userId, "userId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/users/${encodeURIComponent(userId)}/effective-roles`,
    query: buildPaginationQuery(input),
    phase: "execute",
  });

  return {
    roles: normalizeListPayload(payload, "roles"),
    raw: normalizeRawListPayload(payload),
  };
}

async function updateUserRoles(
  input: Record<string, unknown>,
  context: Auth0ActionContext,
  method: "POST" | "DELETE",
): Promise<unknown> {
  const userId = readRequiredString(input.userId, "userId");
  await requestAuth0ManagementJson({
    ...context,
    path: `/users/${encodeURIComponent(userId)}/roles`,
    method,
    body: {
      roles: stringArray(input.roleIds, "roleIds", providerInputError),
    },
    phase: "execute",
  });

  return { success: true };
}

async function listRolePermissions(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const roleId = readRequiredString(input.roleId, "roleId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/roles/${encodeURIComponent(roleId)}/permissions`,
    query: buildPaginationQuery(input),
    phase: "execute",
  });

  return {
    permissions: normalizeListPayload(payload, "permissions"),
    raw: normalizeRawListPayload(payload),
  };
}

async function updateRolePermissions(
  input: Record<string, unknown>,
  context: Auth0ActionContext,
  method: "POST" | "DELETE",
): Promise<unknown> {
  const roleId = readRequiredString(input.roleId, "roleId");
  await requestAuth0ManagementJson({
    ...context,
    path: `/roles/${encodeURIComponent(roleId)}/permissions`,
    method,
    body: {
      permissions: normalizePermissionInputList(input.permissions),
    },
    phase: "execute",
  });

  return { success: true };
}

async function listRoleUsers(input: Record<string, unknown>, context: Auth0ActionContext): Promise<unknown> {
  const roleId = readRequiredString(input.roleId, "roleId");
  const payload = await requestAuth0ManagementJson({
    ...context,
    path: `/roles/${encodeURIComponent(roleId)}/users`,
    query: buildRoleUsersQuery(input),
    phase: "execute",
  });

  return {
    users: normalizeListPayload(payload, "users"),
    raw: normalizeRawListPayload(payload),
  };
}

async function requestAuth0ManagementJson(input: Auth0ManagementRequest): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(auth0ManagementRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await input.fetcher(buildAuth0ManagementUrl(input), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey.trim()}`,
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
      signal,
    });
  } catch (error) {
    const timedOut = timeoutSignal.aborted && !input.signal?.aborted;
    throw new ProviderRequestError(
      timedOut ? 504 : 502,
      timedOut
        ? "Auth0 Management request timed out after 30 seconds"
        : error instanceof Error
          ? `Auth0 Management request failed: ${error.message}`
          : "Auth0 Management request failed",
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw createAuth0ManagementError(response.status, safeParseAuth0ManagementPayload(text), input.phase, {
      notFoundAsInvalidInput: input.notFoundAsInvalidInput,
    });
  }

  return parseAuth0ManagementPayload(text);
}

function buildAuth0ManagementUrl(input: {
  domain: string;
  path: string;
  query?: Record<string, Auth0QueryValue>;
}): string {
  const url = new URL(`${buildAuth0ManagementBaseUrl(input.domain)}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }
  return url.toString();
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, Auth0QueryValue> {
  const query: Record<string, Auth0QueryValue> = {};
  setQueryValue(query, "page", readOptionalInteger(input.page, "page"));
  setQueryValue(query, "per_page", readOptionalInteger(input.perPage, "perPage"));
  setQueryValue(query, "include_totals", optionalBoolean(input.includeTotals));
  return query;
}

function buildUsersQuery(input: Record<string, unknown>): Record<string, Auth0QueryValue> {
  const query: Record<string, Auth0QueryValue> = {};
  const searchQuery = optionalString(input.query);
  setQueryValue(query, "page", readOptionalInteger(input.page, "page"));
  setQueryValue(query, "per_page", readOptionalInteger(input.perPage, "perPage"));
  setQueryValue(query, "q", searchQuery);
  setQueryValue(query, "search_engine", searchQuery ? "v3" : undefined);
  setQueryValue(query, "include_totals", optionalBoolean(input.includeTotals));
  return query;
}

function buildRoleUsersQuery(input: Record<string, unknown>): Record<string, Auth0QueryValue> {
  const from = optionalString(input.from);
  const take = readOptionalInteger(input.take, "take");
  const usesCheckpointPagination = from !== undefined || take !== undefined;
  const usesOffsetPagination =
    input.page !== undefined || input.perPage !== undefined || input.includeTotals !== undefined;

  if (usesCheckpointPagination && usesOffsetPagination) {
    throw new ProviderRequestError(
      400,
      "list_role_users pagination must use either offset parameters or checkpoint parameters",
    );
  }

  if (!usesCheckpointPagination) {
    return buildPaginationQuery(input);
  }

  const query: Record<string, Auth0QueryValue> = {};
  setQueryValue(query, "from", from);
  setQueryValue(query, "take", take);
  return query;
}

function normalizePermissionInputList(value: unknown): Array<Record<string, string>> {
  return objectArray(value, "permissions", providerInputError).map((record, index) => ({
    permission_name: readRequiredString(record.permissionName, `permissions[${index}].permissionName`),
    resource_server_identifier: readRequiredString(
      record.resourceServerIdentifier,
      `permissions[${index}].resourceServerIdentifier`,
    ),
  }));
}

function setQueryValue(query: Record<string, Auth0QueryValue>, key: string, value: Auth0QueryValue): void {
  if (value !== undefined) {
    query[key] = value;
  }
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  return optionalIntegerLike(value, fieldName, providerInputError);
}

function safeParseAuth0ManagementPayload(text: string): unknown {
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseAuth0ManagementPayload(text: string): unknown {
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Auth0 Management returned invalid JSON");
  }
}

function normalizeListPayload(
  payload: unknown,
  wrapperKey: "users" | "roles" | "permissions",
): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map(normalizeRawObject);
  }

  const record = optionalRecord(payload);
  const wrapped = record?.[wrapperKey];
  if (Array.isArray(wrapped)) {
    return wrapped.map(normalizeRawObject);
  }

  throw new ProviderRequestError(502, `Auth0 Management ${wrapperKey} response was not a list`);
}

function normalizeRawObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Auth0 Management response was not an object");
  }
  return record;
}

function normalizeRawListPayload(payload: unknown): Array<Record<string, unknown>> | Record<string, unknown> {
  return Array.isArray(payload) ? payload.map(normalizeRawObject) : normalizeRawObject(payload);
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function createAuth0ManagementError(
  status: number,
  payload: unknown,
  phase: Auth0ManagementPhase,
  options: { notFoundAsInvalidInput?: boolean } = {},
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error_description) ??
    optionalString(record?.error) ??
    `Auth0 Management request failed with ${status}`;
  const invalidCredential = status === 401 || status === 403;
  const invalidInput = status === 400 || (status === 404 && options.notFoundAsInvalidInput);

  if (phase === "validate" && invalidCredential) {
    return new ProviderRequestError(400, message, payload);
  }
  if (invalidInput) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}
