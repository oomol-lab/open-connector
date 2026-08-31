import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  pickOptionalString,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const oktaApiTokenHelpUrl = "https://developer.okta.com/docs/guides/create-an-api-token/main/";
const oktaLifecycleOperations: Set<string> = new Set([
  "activate",
  "reactivate",
  "deactivate",
  "suspend",
  "unsuspend",
  "unlock",
  "expire_password",
]);

type OktaMethod = "GET" | "POST" | "PUT" | "DELETE";
type OktaPhase = "validate" | "execute";
type OktaLifecycleOperation =
  | "activate"
  | "reactivate"
  | "deactivate"
  | "suspend"
  | "unsuspend"
  | "unlock"
  | "expire_password";

export interface OktaContext {
  orgUrl: string;
  authorization: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export interface OktaCredentialValidationInput {
  orgUrl: unknown;
  authorization: string;
  grantedScopes?: string[];
  credentialHelpUrl?: string;
}

interface OktaRequestInput extends OktaContext {
  path: string;
  method: OktaMethod;
  phase: OktaPhase;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}

interface OktaResponse {
  data: unknown;
  headers: Headers;
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

export const oktaActionHandlers: ProviderActionHandlers<"okta", ProviderRuntimeHandler<OktaContext>> = {
  async list_users(input, context) {
    const response = await requestOkta({
      ...context,
      path: "/api/v1/users",
      method: "GET",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit) ?? 200,
        after: optionalString(input.after),
        search: optionalString(input.search),
        filter: optionalString(input.filter),
        q: optionalString(input.q),
        sortBy: optionalString(input.sortBy),
        sortOrder: optionalString(input.sortOrder) ?? "asc",
        fields: optionalString(input.fields),
      },
    });
    const raw = responseObjectArray(response.data, "users");
    return {
      users: raw.map(normalizeOktaUser),
      nextAfter: readNextAfter(response.headers),
      raw,
    };
  },

  async get_user(input, context) {
    const userId = requiredString(input.userId, "userId", providerInputError);
    const raw = await requestOktaObject(context, `/api/v1/users/${encodeURIComponent(userId)}`, "GET", "user");
    return { user: normalizeOktaUser(raw), raw };
  },

  async create_user(input, context) {
    const response = await requestOkta({
      ...context,
      path: "/api/v1/users",
      method: "POST",
      phase: "execute",
      query: {
        activate: optionalBoolean(input.activate) ?? true,
        provider: optionalBoolean(input.provider) ?? false,
        nextLogin: optionalString(input.nextLogin),
      },
      body: compactObject({
        profile: requiredRecord(input.profile, "profile", providerInputError),
        credentials: optionalRecord(input.credentials),
        groupIds:
          input.groupIds == null
            ? undefined
            : stringArray(input.groupIds, "groupIds", providerInputError).map((item, index) =>
                requiredString(item, `groupIds[${index}]`, providerInputError),
              ),
      }),
    });
    const raw = responseObject(response.data, "user");
    return { user: normalizeOktaUser(raw), raw };
  },

  async update_user(input, context) {
    const userId = requiredString(input.userId, "userId", providerInputError);
    const body = compactObject({
      profile: optionalRecord(input.profile),
      credentials: optionalRecord(input.credentials),
    });
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "profile or credentials is required");
    }
    const response = await requestOkta({
      ...context,
      path: `/api/v1/users/${encodeURIComponent(userId)}`,
      method: "POST",
      phase: "execute",
      query: { strict: optionalBoolean(input.strict) },
      body,
    });
    const raw = responseObject(response.data, "user");
    return { user: normalizeOktaUser(raw), raw };
  },

  async delete_user(input, context) {
    const userId = requiredString(input.userId, "userId", providerInputError);
    const current = await requestOktaObject(context, `/api/v1/users/${encodeURIComponent(userId)}`, "GET", "user");
    const wasDeactivated = optionalString(current.status) === "DEPROVISIONED";
    await requestOkta({
      ...context,
      path: `/api/v1/users/${encodeURIComponent(userId)}`,
      method: "DELETE",
      phase: "execute",
      query: { sendEmail: optionalBoolean(input.sendEmail) },
    });
    return {
      userId,
      result: wasDeactivated ? "deleted" : "deactivated",
      deleted: wasDeactivated,
    };
  },

  async lifecycle_user(input, context) {
    const userId = requiredString(input.userId, "userId", providerInputError);
    const operation = lifecycleOperation(input.operation);
    const useTemporaryPassword = operation === "expire_password" && input.tempPassword === true;
    const pathOperation = useTemporaryPassword ? "expire_password_with_temp_password" : operation;
    const response = await requestOkta({
      ...context,
      path: `/api/v1/users/${encodeURIComponent(userId)}/lifecycle/${pathOperation}`,
      method: "POST",
      phase: "execute",
      query: lifecycleQuery(operation, useTemporaryPassword, input),
    });
    const result = response.data == null ? null : responseObject(response.data, "lifecycle response");
    return { userId, operation, result, raw: result };
  },

  async list_groups(input, context) {
    const response = await requestOkta({
      ...context,
      path: "/api/v1/groups",
      method: "GET",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit),
        after: optionalString(input.after),
        search: optionalString(input.search),
        filter: optionalString(input.filter),
        q: optionalString(input.q),
        expand: optionalString(input.expand),
        sortBy: optionalString(input.sortBy),
        sortOrder: optionalString(input.sortOrder) ?? "asc",
      },
    });
    const raw = responseObjectArray(response.data, "groups");
    return {
      groups: raw.map(normalizeOktaGroup),
      nextAfter: readNextAfter(response.headers),
      raw,
    };
  },

  async get_group(input, context) {
    const groupId = requiredString(input.groupId, "groupId", providerInputError);
    const raw = await requestOktaObject(context, `/api/v1/groups/${encodeURIComponent(groupId)}`, "GET", "group");
    return { group: normalizeOktaGroup(raw), raw };
  },

  async create_group(input, context) {
    const response = await requestOkta({
      ...context,
      path: "/api/v1/groups",
      method: "POST",
      phase: "execute",
      body: { profile: inputGroupProfile(input.profile) },
    });
    const raw = responseObject(response.data, "group");
    return { group: normalizeOktaGroup(raw), raw };
  },

  async update_group(input, context) {
    const groupId = requiredString(input.groupId, "groupId", providerInputError);
    const response = await requestOkta({
      ...context,
      path: `/api/v1/groups/${encodeURIComponent(groupId)}`,
      method: "PUT",
      phase: "execute",
      body: { profile: inputGroupProfile(input.profile) },
    });
    const raw = responseObject(response.data, "group");
    return { group: normalizeOktaGroup(raw), raw };
  },

  async delete_group(input, context) {
    const groupId = requiredString(input.groupId, "groupId", providerInputError);
    await requestOkta({
      ...context,
      path: `/api/v1/groups/${encodeURIComponent(groupId)}`,
      method: "DELETE",
      phase: "execute",
    });
    return { groupId, deleted: true };
  },

  async list_group_users(input, context) {
    const groupId = requiredString(input.groupId, "groupId", providerInputError);
    const response = await requestOkta({
      ...context,
      path: `/api/v1/groups/${encodeURIComponent(groupId)}/users`,
      method: "GET",
      phase: "execute",
      query: {
        limit: optionalInteger(input.limit) ?? 1000,
        after: optionalString(input.after),
      },
    });
    const raw = responseObjectArray(response.data, "users");
    return {
      users: raw.map(normalizeOktaUser),
      nextAfter: readNextAfter(response.headers),
      raw,
    };
  },

  async add_user_to_group(input, context) {
    const groupId = requiredString(input.groupId, "groupId", providerInputError);
    const userId = requiredString(input.userId, "userId", providerInputError);
    await requestOkta({
      ...context,
      path: `/api/v1/groups/${encodeURIComponent(groupId)}/users/${encodeURIComponent(userId)}`,
      method: "PUT",
      phase: "execute",
    });
    return { groupId, userId, added: true };
  },

  async remove_user_from_group(input, context) {
    const groupId = requiredString(input.groupId, "groupId", providerInputError);
    const userId = requiredString(input.userId, "userId", providerInputError);
    await requestOkta({
      ...context,
      path: `/api/v1/groups/${encodeURIComponent(groupId)}/users/${encodeURIComponent(userId)}`,
      method: "DELETE",
      phase: "execute",
    });
    return { groupId, userId, removed: true };
  },
};

export async function validateOktaCredential(
  input: OktaCredentialValidationInput,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const orgUrl = normalizeOktaOrgUrl(input.orgUrl);
  const response = await requestOkta({
    orgUrl,
    authorization: input.authorization,
    path: "/api/v1/users/me",
    method: "GET",
    phase: "validate",
    fetcher,
    signal,
  });
  const user = normalizeOktaUser(responseObject(response.data, "user"));
  const login = pickOptionalString(user.profile, "email", "login");
  const host = new URL(orgUrl).host;

  return {
    profile: {
      accountId: `okta:${host}:${user.id}`,
      displayName: login ?? host,
    },
    grantedScopes: input.grantedScopes ?? [],
    metadata: compactObject({
      orgUrl,
      validationEndpoint: "/api/v1/users/me",
      credentialHelpUrl: input.credentialHelpUrl,
      userId: user.id,
      userLogin: login,
    }),
  };
}

export function normalizeOktaOrgUrl(value: unknown): string {
  const raw = requiredString(value, "orgUrl", providerInputError);
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  const url = assertPublicHttpUrl(candidate, { fieldName: "orgUrl", createError: providerInputError });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "orgUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "orgUrl must not include credentials");
  }
  return url.origin;
}

async function requestOktaObject(
  context: OktaContext,
  path: string,
  method: OktaMethod,
  fieldName: string,
): Promise<Record<string, unknown>> {
  const response = await requestOkta({ ...context, path, method, phase: "execute" });
  return responseObject(response.data, fieldName);
}

async function requestOkta(input: OktaRequestInput): Promise<OktaResponse> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(buildOktaUrl(input), {
      method: input.method,
      headers: buildOktaHeaders(input.authorization, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const data = await readOktaPayload(response);
    if (!response.ok) {
      throw mapOktaError(response.status, data, input.phase);
    }
    return { data, headers: response.headers };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Okta request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Okta request failed: ${error.message}` : "Okta request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOktaUrl(input: OktaRequestInput): URL {
  const url = new URL(input.path, `${input.orgUrl}/`);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }
  return url;
}

function buildOktaHeaders(authorization: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readOktaPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Okta returned invalid JSON");
  }
}

function mapOktaError(status: number, payload: unknown, phase: OktaPhase): ProviderRequestError {
  const message = oktaErrorMessage(payload) ?? `Okta request failed with HTTP ${status}`;
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 401 || status === 403 || status === 429 || status >= 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, { status, payload });
}

function oktaErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.errorSummary) ?? optionalString(record?.message);
}

function lifecycleQuery(
  operation: OktaLifecycleOperation,
  useTemporaryPassword: boolean,
  input: Record<string, unknown>,
): Record<string, boolean | undefined> {
  if (useTemporaryPassword) {
    return { revokeSessions: optionalBoolean(input.revokeSessions) };
  }
  if (operation === "activate" || operation === "reactivate" || operation === "deactivate") {
    return { sendEmail: optionalBoolean(input.sendEmail) };
  }
  return {};
}

function lifecycleOperation(value: unknown): OktaLifecycleOperation {
  const operation = requiredString(value, "operation", providerInputError);
  if (isOktaLifecycleOperation(operation)) {
    return operation;
  }
  throw new ProviderRequestError(400, "operation is not supported");
}

function isOktaLifecycleOperation(value: string): value is OktaLifecycleOperation {
  return oktaLifecycleOperations.has(value);
}

function normalizeOktaUser(raw: Record<string, unknown>): NormalizedOktaUser {
  return {
    id: responseString(raw.id, "user.id"),
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
    id: responseString(raw.id, "group.id"),
    type: optionalString(raw.type) ?? null,
    created: optionalString(raw.created) ?? null,
    lastUpdated: optionalString(raw.lastUpdated) ?? null,
    lastMembershipUpdated: optionalString(raw.lastMembershipUpdated) ?? null,
    objectClass: Array.isArray(raw.objectClass)
      ? raw.objectClass.filter((value): value is string => typeof value === "string")
      : [],
    profile: optionalRecord(raw.profile) ?? {},
    raw,
  };
}

function readNextAfter(headers: Headers): string | null {
  const link = headers.get("link");
  if (!link) {
    return null;
  }
  for (const part of link.split(",")) {
    const segments = part.split(";").map((value) => value.trim());
    const relation = segments.slice(1).find((value) => value === "rel=next" || value === 'rel="next"');
    const target = segments[0];
    if (!relation || !target?.startsWith("<") || !target.endsWith(">")) {
      continue;
    }
    try {
      return new URL(target.slice(1, -1)).searchParams.get("after");
    } catch {
      return null;
    }
  }
  return null;
}

function inputGroupProfile(value: unknown): Record<string, unknown> {
  const profile = requiredRecord(value, "profile", providerInputError);
  return {
    ...profile,
    name: requiredString(profile.name, "profile.name", providerInputError),
  };
}

function responseString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value) {
    return value;
  }
  throw new ProviderRequestError(502, `Okta field ${fieldName} is missing`);
}

function responseObject(value: unknown, fieldName: string): Record<string, unknown> {
  try {
    return requiredRecord(value, fieldName);
  } catch {
    throw new ProviderRequestError(502, `Okta returned invalid ${fieldName}`);
  }
}

function responseObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  try {
    return objectArray(value, fieldName);
  } catch {
    throw new ProviderRequestError(502, `Okta returned invalid ${fieldName}`);
  }
}
