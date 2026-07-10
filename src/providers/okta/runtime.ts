import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { OktaActionName } from "./actions.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, compactJson, queryParams } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type OktaActionHandler = (input: Record<string, unknown>, context: OktaActionContext) => Promise<unknown>;
type OktaLifecycleOperation =
  | "activate"
  | "reactivate"
  | "deactivate"
  | "suspend"
  | "unsuspend"
  | "unlock"
  | "expire_password";
type OktaPhase = "validate" | "execute";

interface OktaRequestInput {
  context: OktaActionContext;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  phase: OktaPhase;
  query?: Record<string, QueryValue>;
  body?: unknown;
}

interface OktaResponse {
  data: unknown;
  headers: Headers;
  status: number;
}

interface NormalizedOktaUser {
  id: string;
  status: string | null;
  created: string | null;
  activated: string | null;
  statusChanged: string | null;
  lastLogin: string | null;
  lastUpdated: string | null;
  passwordChanged: string | null;
  profile: Record<string, unknown>;
  raw: Record<string, unknown>;
}

interface NormalizedOktaGroup {
  id: string;
  type: string | null;
  created: string | null;
  lastUpdated: string | null;
  lastMembershipUpdated: string | null;
  objectClass: string[];
  profile: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface OktaActionContext {
  orgUrl: string;
  apiToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const defaultListLimit = 100;
const lifecyclePaths: Record<OktaLifecycleOperation, string> = {
  activate: "activate",
  reactivate: "reactivate",
  deactivate: "deactivate",
  suspend: "suspend",
  unsuspend: "unsuspend",
  unlock: "unlock",
  expire_password: "expire_password",
};

export const oktaActionHandlers: Record<OktaActionName, OktaActionHandler> = {
  list_users(input, context) {
    return listUsers(input, context);
  },
  get_user(input, context) {
    return getUser(input, context);
  },
  create_user(input, context) {
    return createUser(input, context);
  },
  update_user(input, context) {
    return updateUser(input, context);
  },
  delete_user(input, context) {
    return deleteUser(input, context);
  },
  lifecycle_user(input, context) {
    return lifecycleUser(input, context);
  },
  list_groups(input, context) {
    return listGroups(input, context);
  },
  get_group(input, context) {
    return getGroup(input, context);
  },
  create_group(input, context) {
    return createGroup(input, context);
  },
  update_group(input, context) {
    return updateGroup(input, context);
  },
  delete_group(input, context) {
    return deleteGroup(input, context);
  },
  list_group_users(input, context) {
    return listGroupUsers(input, context);
  },
  add_user_to_group(input, context) {
    return addUserToGroup(input, context);
  },
  remove_user_from_group(input, context) {
    return removeUserFromGroup(input, context);
  },
};

export function createOktaContext(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): OktaActionContext {
  return {
    orgUrl: normalizeOktaOrgUrl(input.orgUrl),
    apiToken: requireCredentialString(input.apiToken, "apiToken"),
    fetcher,
    signal,
  };
}

export async function validateOktaCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createOktaContext(input, fetcher, signal);
  await requestOkta({
    context,
    method: "GET",
    path: "/api/v1/users",
    phase: "validate",
    query: { limit: 1 },
  });

  return {
    profile: {
      accountId: context.orgUrl,
      displayName: new URL(context.orgUrl).host,
    },
    grantedScopes: [],
    metadata: {
      orgUrl: context.orgUrl,
    },
  };
}

export function normalizeOktaOrgUrl(value: unknown): string {
  const raw = requireCredentialString(value, "orgUrl");
  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  const url = assertPublicHttpUrl(withProtocol, {
    fieldName: "orgUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "orgUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "orgUrl must not include credentials");
  }
  return url.origin;
}

async function listUsers(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const response = await requestOkta({
    context,
    method: "GET",
    path: "/api/v1/users",
    phase: "execute",
    query: readListQuery(input),
  });
  const users = readResponseObjectArray(response.data, "users").map(normalizeOktaUser);
  return {
    users,
    nextAfter: readNextAfter(response.headers),
    raw: response.data,
  };
}

async function getUser(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const userId = requireInputString(input.userId, "userId");
  const response = await requestOkta({
    context,
    method: "GET",
    path: `/api/v1/users/${encodeURIComponent(userId)}`,
    phase: "execute",
  });
  const raw = readResponseObject(response.data, "user");
  return {
    user: normalizeOktaUser(raw),
    raw,
  };
}

async function createUser(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const response = await requestOkta({
    context,
    method: "POST",
    path: "/api/v1/users",
    phase: "execute",
    query: {
      activate: optionalBoolean(input.activate),
    },
    body: compactBody({
      profile: readInputRecord(input.profile, "profile"),
      credentials: readOptionalInputRecord(input.credentials, "credentials"),
      groupIds: readOptionalStringArray(input.groupIds, "groupIds"),
    }),
  });
  const raw = readResponseObject(response.data, "user");
  return {
    user: normalizeOktaUser(raw),
    raw,
  };
}

async function updateUser(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const userId = requireInputString(input.userId, "userId");
  const body = compactBody({
    profile: readOptionalInputRecord(input.profile, "profile"),
    credentials: readOptionalInputRecord(input.credentials, "credentials"),
  });
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "profile or credentials is required");
  }

  const response = await requestOkta({
    context,
    method: "POST",
    path: `/api/v1/users/${encodeURIComponent(userId)}`,
    phase: "execute",
    body,
  });
  const raw = readResponseObject(response.data, "user");
  return {
    user: normalizeOktaUser(raw),
    raw,
  };
}

async function deleteUser(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const userId = requireInputString(input.userId, "userId");
  await requestOkta({
    context,
    method: "DELETE",
    path: `/api/v1/users/${encodeURIComponent(userId)}`,
    phase: "execute",
    query: {
      sendEmail: optionalBoolean(input.sendEmail),
    },
  });
  return {
    userId,
    deleted: true,
  };
}

async function lifecycleUser(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const userId = requireInputString(input.userId, "userId");
  const operation = readLifecycleOperation(input.operation);
  const response = await requestOkta({
    context,
    method: "POST",
    path: `/api/v1/users/${encodeURIComponent(userId)}/lifecycle/${lifecyclePaths[operation]}`,
    phase: "execute",
    query: lifecycleQuery(operation, input),
  });
  const result = response.data == null ? null : readResponseObject(response.data, "lifecycle result");
  return {
    userId,
    operation,
    result,
    raw: result,
  };
}

async function listGroups(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const response = await requestOkta({
    context,
    method: "GET",
    path: "/api/v1/groups",
    phase: "execute",
    query: readListQuery(input),
  });
  const groups = readResponseObjectArray(response.data, "groups").map(normalizeOktaGroup);
  return {
    groups,
    nextAfter: readNextAfter(response.headers),
    raw: response.data,
  };
}

async function getGroup(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const groupId = requireInputString(input.groupId, "groupId");
  const response = await requestOkta({
    context,
    method: "GET",
    path: `/api/v1/groups/${encodeURIComponent(groupId)}`,
    phase: "execute",
  });
  const raw = readResponseObject(response.data, "group");
  return {
    group: normalizeOktaGroup(raw),
    raw,
  };
}

async function createGroup(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const response = await requestOkta({
    context,
    method: "POST",
    path: "/api/v1/groups",
    phase: "execute",
    body: {
      profile: readGroupProfile(input.profile),
    },
  });
  const raw = readResponseObject(response.data, "group");
  return {
    group: normalizeOktaGroup(raw),
    raw,
  };
}

async function updateGroup(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const groupId = requireInputString(input.groupId, "groupId");
  const response = await requestOkta({
    context,
    method: "PUT",
    path: `/api/v1/groups/${encodeURIComponent(groupId)}`,
    phase: "execute",
    body: {
      profile: readGroupProfile(input.profile),
    },
  });
  const raw = readResponseObject(response.data, "group");
  return {
    group: normalizeOktaGroup(raw),
    raw,
  };
}

async function deleteGroup(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const groupId = requireInputString(input.groupId, "groupId");
  await requestOkta({
    context,
    method: "DELETE",
    path: `/api/v1/groups/${encodeURIComponent(groupId)}`,
    phase: "execute",
  });
  return {
    groupId,
    deleted: true,
  };
}

async function listGroupUsers(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const groupId = requireInputString(input.groupId, "groupId");
  const response = await requestOkta({
    context,
    method: "GET",
    path: `/api/v1/groups/${encodeURIComponent(groupId)}/users`,
    phase: "execute",
    query: {
      limit: readLimit(input.limit),
      after: optionalString(input.after),
    },
  });
  const users = readResponseObjectArray(response.data, "users").map(normalizeOktaUser);
  return {
    users,
    nextAfter: readNextAfter(response.headers),
    raw: response.data,
  };
}

async function addUserToGroup(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const groupId = requireInputString(input.groupId, "groupId");
  const userId = requireInputString(input.userId, "userId");
  await requestOkta({
    context,
    method: "PUT",
    path: `/api/v1/groups/${encodeURIComponent(groupId)}/users/${encodeURIComponent(userId)}`,
    phase: "execute",
  });
  return {
    groupId,
    userId,
    added: true,
  };
}

async function removeUserFromGroup(input: Record<string, unknown>, context: OktaActionContext): Promise<unknown> {
  const groupId = requireInputString(input.groupId, "groupId");
  const userId = requireInputString(input.userId, "userId");
  await requestOkta({
    context,
    method: "DELETE",
    path: `/api/v1/groups/${encodeURIComponent(groupId)}/users/${encodeURIComponent(userId)}`,
    phase: "execute",
  });
  return {
    groupId,
    userId,
    removed: true,
  };
}

async function requestOkta(input: OktaRequestInput): Promise<OktaResponse> {
  const url = new URL(input.path, `${input.context.orgUrl}/`);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `SSWS ${input.context.apiToken}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error && error.message ? `Okta request failed: ${error.message}` : "Okta request failed",
    );
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw createOktaError(response.status, text, input.phase);
  }
  if (response.status === 204 || text.trim() === "") {
    return {
      data: null,
      headers: response.headers,
      status: response.status,
    };
  }

  try {
    return {
      data: JSON.parse(text) as unknown,
      headers: response.headers,
      status: response.status,
    };
  } catch {
    throw new ProviderRequestError(502, "Okta returned invalid JSON");
  }
}

function readListQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    limit: readLimit(input.limit),
    after: optionalString(input.after),
    search: optionalString(input.search),
    filter: optionalString(input.filter),
    q: optionalString(input.q),
  };
}

function readLimit(value: unknown): number {
  const limit = optionalInteger(value) ?? defaultListLimit;
  if (limit < 1 || limit > 200) {
    throw new ProviderRequestError(400, "limit must be between 1 and 200");
  }
  return limit;
}

function lifecycleQuery(operation: OktaLifecycleOperation, input: Record<string, unknown>): Record<string, QueryValue> {
  switch (operation) {
    case "activate":
    case "reactivate":
    case "deactivate":
      return {
        sendEmail: optionalBoolean(input.sendEmail),
      };
    case "expire_password":
      return {
        tempPassword: optionalBoolean(input.tempPassword),
      };
    case "suspend":
    case "unsuspend":
    case "unlock":
      return {};
  }
}

function readLifecycleOperation(value: unknown): OktaLifecycleOperation {
  const operation = requireInputString(value, "operation");
  if (operation in lifecyclePaths) {
    return operation as OktaLifecycleOperation;
  }
  throw new ProviderRequestError(400, "operation is not supported");
}

function normalizeOktaUser(raw: Record<string, unknown>): NormalizedOktaUser {
  return {
    id: requireResponseString(raw.id, "user.id"),
    status: optionalString(raw.status) ?? null,
    created: optionalString(raw.created) ?? null,
    activated: optionalString(raw.activated) ?? null,
    statusChanged: optionalString(raw.statusChanged) ?? null,
    lastLogin: optionalString(raw.lastLogin) ?? null,
    lastUpdated: optionalString(raw.lastUpdated) ?? null,
    passwordChanged: optionalString(raw.passwordChanged) ?? null,
    profile: optionalRecord(raw.profile) ?? {},
    raw,
  };
}

function normalizeOktaGroup(raw: Record<string, unknown>): NormalizedOktaGroup {
  return {
    id: requireResponseString(raw.id, "group.id"),
    type: optionalString(raw.type) ?? null,
    created: optionalString(raw.created) ?? null,
    lastUpdated: optionalString(raw.lastUpdated) ?? null,
    lastMembershipUpdated: optionalString(raw.lastMembershipUpdated) ?? null,
    objectClass: readStringValues(raw.objectClass),
    profile: optionalRecord(raw.profile) ?? {},
    raw,
  };
}

function readGroupProfile(value: unknown): Record<string, unknown> {
  const profile = readInputRecord(value, "profile");
  const name = requireInputString(profile.name, "profile.name");
  return compactBody({
    name,
    description: optionalString(profile.description),
  });
}

function compactBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactJson(input) as Record<string, unknown>;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a string array`);
  }
  return value.map((item, index) => requireInputString(item, `${fieldName}[${index}]`));
}

function readStringValues(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
}

function readInputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalInputRecord(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  return value == null ? undefined : readInputRecord(value, fieldName);
}

function readResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, () => new ProviderRequestError(502, `Okta returned invalid ${fieldName}`));
}

function readResponseObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Okta returned invalid ${fieldName}`);
  }
  return value.map((item, index) => readResponseObject(item, `${fieldName}[${index}]`));
}

function readNextAfter(headers: Headers): string | null {
  const link = headers.get("link");
  if (!link) {
    return null;
  }
  for (const part of link.split(",")) {
    if (!/;\s*rel="?next"?/u.test(part)) {
      continue;
    }
    const match = /<([^>]+)>/u.exec(part);
    if (!match) {
      continue;
    }
    try {
      return new URL(match[1]!).searchParams.get("after");
    } catch {
      return null;
    }
  }
  return null;
}

function createOktaError(status: number, responseText: string, phase: OktaPhase): ProviderRequestError {
  const message = readOktaErrorMessage(responseText) ?? `Okta request failed with HTTP ${status}`;
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function readOktaErrorMessage(responseText: string): string | undefined {
  const text = responseText.trim();
  if (!text) {
    return undefined;
  }
  try {
    const payload = optionalRecord(JSON.parse(text) as unknown);
    return optionalString(payload?.errorSummary) ?? optionalString(payload?.message) ?? text;
  } catch {
    return text;
  }
}

function requireCredentialString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireResponseString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, () => new ProviderRequestError(502, `Okta field ${fieldName} is missing`));
}

export type { OktaActionName };
