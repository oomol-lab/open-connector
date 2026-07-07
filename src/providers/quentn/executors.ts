import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { QuentnActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalIntegerLike,
  optionalRawString,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "quentn";
const quentnBaseDomain = "quentn.com";
const quentnApiPathPrefix = "/public/api/V1";
const quentnDefaultTimeoutMs = 20_000;

type QuentnHttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type QuentnQueryValue = string | number | boolean | undefined;
type QuentnRequestPhase = "validation" | "execution";
type QuentnActionHandler = (input: Record<string, unknown>, context: QuentnActionContext) => Promise<unknown>;

interface QuentnActionContext {
  apiKey: string;
  systemId: string;
  serverId: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface QuentnCredentialInput {
  apiKey: string;
  values: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export const quentnActionHandlers: Record<QuentnActionName, QuentnActionHandler> = {
  list_users(input, context) {
    return requestQuentnObjectAction({
      context,
      path: "/users",
      method: "GET",
      query: buildListUsersQuery(input),
      normalize: normalizeUserListResponse,
    });
  },
  async get_user(input, context) {
    const userId = positiveInteger(input.user_id, "user_id", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/user/${userId}`,
      method: "GET",
    });
    return { user: normalizeUser(requirePayloadObject(payload, "Quentn user")) };
  },
  get_contact_by_id(input, context) {
    const contactId = positiveInteger(input.contact_id, "contact_id", invalidInputError);
    return requestContact(input, context, `/contact/${contactId}`);
  },
  async find_contacts_by_email(input, context) {
    const email = requiredString(input.email, "email", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/contact/${encodeURIComponent(email)}`,
      method: "GET",
      query: buildFieldsQuery(input),
    });
    const raw = Array.isArray(payload)
      ? objectArray(payload, "Quentn contacts", providerError)
      : [requirePayloadObject(payload, "Quentn contact")];
    return {
      contacts: raw.map(normalizeContact),
      raw,
    };
  },
  async create_contact(input, context) {
    const contact = requiredRecord(input.contact, "contact", invalidInputError);
    assertCreateContactHasRequiredFields(contact);
    const payload = await requestQuentnJson({
      context,
      path: "/contact",
      method: "POST",
      body: compactObject({
        contact,
        duplicate_check_method: optionalString(input.duplicate_check_method),
        duplicate_merge_method: optionalString(input.duplicate_merge_method),
        return_fields: readStringArray(input.return_fields),
        flood_limit: optionalIntegerLike(input.flood_limit, "flood_limit", invalidInputError),
        spam_protection: optionalBoolean(input.spam_protection),
      }),
    });
    return { contact: normalizeContact(requirePayloadObject(payload, "Quentn contact")) };
  },
  async update_contact(input, context) {
    const contactId = positiveInteger(input.contact_id, "contact_id", invalidInputError);
    const updates = requiredRecord(input.updates, "updates", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/contact/${contactId}`,
      method: "PUT",
      body: compactObject({
        ...updates,
        return_fields: readStringArray(input.return_fields),
      }),
    });
    const payloadObject = requirePayloadObject(payload, "Quentn contact update");
    const contact = "id" in payloadObject ? normalizeContact(payloadObject) : null;
    return {
      success: contact !== null || payloadObject.success === true,
      contact,
      raw: payloadObject,
    };
  },
  async delete_contact(input, context) {
    const contactId = positiveInteger(input.contact_id, "contact_id", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/contact/${contactId}`,
      method: "DELETE",
    });
    return normalizeSuccess(requirePayloadObject(payload, "Quentn delete contact"));
  },
  async list_terms(input, context) {
    const payload = await requestQuentnJson({
      context,
      path: "/terms",
      method: "GET",
      query: compactObject({
        offset: optionalIntegerLike(input.offset, "offset", invalidInputError),
        limit: optionalIntegerLike(input.limit, "limit", invalidInputError),
      }),
    });
    const raw = objectArray(payload, "Quentn terms", providerError);
    return {
      terms: raw.map(normalizeTerm),
      raw,
    };
  },
  async get_term(input, context) {
    const termId = positiveInteger(input.term_id, "term_id", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/terms/${termId}`,
      method: "GET",
    });
    return { term: normalizeTerm(requirePayloadObject(payload, "Quentn term")) };
  },
  async create_term(input, context) {
    const payload = await requestQuentnJson({
      context,
      path: "/terms",
      method: "POST",
      body: compactObject({
        name: requiredString(input.name, "name", invalidInputError),
        description: optionalRawString(input.description),
      }),
    });
    const payloadObject = requirePayloadObject(payload, "Quentn create term");
    return {
      id: readNullableInteger(payloadObject.id),
      raw: payloadObject,
    };
  },
  async update_term(input, context) {
    const termId = positiveInteger(input.term_id, "term_id", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/terms/${termId}`,
      method: "PUT",
      body: compactObject({
        name: optionalString(input.name),
        description: optionalRawString(input.description),
      }),
    });
    return normalizeSuccess(requirePayloadObject(payload, "Quentn update term"));
  },
  async delete_term(input, context) {
    const termId = positiveInteger(input.term_id, "term_id", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/terms/${termId}`,
      method: "DELETE",
    });
    return normalizeSuccess(requirePayloadObject(payload, "Quentn delete term"));
  },
  async list_contact_terms(input, context) {
    const contactId = positiveInteger(input.contact_id, "contact_id", invalidInputError);
    const payload = await requestQuentnJson({
      context,
      path: `/contact/${contactId}/terms`,
      method: "GET",
    });
    const raw = objectArray(payload, "Quentn contact terms", providerError);
    return {
      terms: raw.map(normalizeTerm),
      raw,
    };
  },
  async set_contact_terms(input, context) {
    const contactId = positiveInteger(input.contact_id, "contact_id", invalidInputError);
    const termIds = readPositiveIntegerArray(input.term_ids, "term_ids");
    const payload = await requestQuentnJson({
      context,
      path: `/contact/${contactId}/terms`,
      method: "PUT",
      body: termIds,
    });
    return normalizeSuccess(requirePayloadObject(payload, "Quentn set contact terms"));
  },
  async remove_contact_terms(input, context) {
    const contactId = positiveInteger(input.contact_id, "contact_id", invalidInputError);
    const termIds = readPositiveIntegerArray(input.term_ids, "term_ids");
    const payload = await requestQuentnJson({
      context,
      path: `/contact/${contactId}/terms`,
      method: "DELETE",
      query: { ids: termIds.join("|") },
    });
    return normalizeSuccess(requirePayloadObject(payload, "Quentn remove contact terms"));
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<QuentnActionContext>({
  service,
  handlers: quentnActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<QuentnActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      ...readStoredCredential({
        apiKey: credential.apiKey,
        values: credential.values,
        metadata: credential.metadata,
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: quentnProxyBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

async function quentnProxyBaseUrl(context: ExecutionContext): Promise<string> {
  const credential = await requireApiKeyCredential(context, service);
  return readStoredCredential({
    apiKey: credential.apiKey,
    values: credential.values,
    metadata: credential.metadata,
  }).apiBaseUrl;
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credential = readValidationCredential(input);
    const payload = await requestQuentnJson({
      context: {
        ...credential,
        fetcher,
        signal,
      },
      path: "/users",
      method: "GET",
      query: { limit: 1 },
      phase: "validation",
    });
    const userList = normalizeUserListResponse(requirePayloadObject(payload, "Quentn users"));
    const firstUser = userList.users[0];
    const accountLabel = buildUserLabel(firstUser) ?? `Quentn ${credential.systemId}.${credential.serverId}`;

    return {
      profile: {
        accountId: `quentn:${credential.systemId}.${credential.serverId}`,
        displayName: accountLabel,
      },
      grantedScopes: [],
      metadata: {
        systemId: credential.systemId,
        serverId: credential.serverId,
        apiBaseUrl: credential.apiBaseUrl,
        validationPath: "/users",
      },
    };
  },
};

async function requestContact(
  input: Record<string, unknown>,
  context: QuentnActionContext,
  path: string,
): Promise<Record<string, unknown>> {
  const payload = await requestQuentnJson({
    context,
    path,
    method: "GET",
    query: buildFieldsQuery(input),
  });
  return { contact: normalizeContact(requirePayloadObject(payload, "Quentn contact")) };
}

async function requestQuentnObjectAction(input: {
  context: QuentnActionContext;
  path: string;
  method: QuentnHttpMethod;
  query?: Record<string, QuentnQueryValue>;
  normalize: (payload: Record<string, unknown>) => unknown;
}): Promise<unknown> {
  const payload = await requestQuentnJson({
    context: input.context,
    path: input.path,
    method: input.method,
    query: input.query,
  });
  return input.normalize(requirePayloadObject(payload, `Quentn ${input.path}`));
}

async function requestQuentnJson(input: {
  context: QuentnActionContext;
  path: string;
  method: QuentnHttpMethod;
  query?: Record<string, QuentnQueryValue>;
  body?: unknown;
  phase?: QuentnRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, quentnDefaultTimeoutMs);
  try {
    const response = await input.context.fetcher(buildQuentnUrl(input), {
      method: input.method,
      headers: buildQuentnHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload =
      response.status === 204 && input.method !== "GET" ? { success: true } : await readQuentnPayload(response);
    if (!response.ok || payloadHasError(payload)) {
      throw mapQuentnHttpError(response.status, payload, input.phase ?? "execution");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Quentn request timed out after ${Math.ceil(quentnDefaultTimeoutMs / 1000)} seconds`,
        error,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Quentn request failed: ${error.message}` : "Quentn request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildQuentnUrl(input: {
  context: Pick<QuentnActionContext, "apiBaseUrl">;
  path: string;
  query?: Record<string, QuentnQueryValue>;
}): URL {
  const baseUrl = input.context.apiBaseUrl.endsWith("/") ? input.context.apiBaseUrl : `${input.context.apiBaseUrl}/`;
  let path = input.path;
  while (path.startsWith("/")) {
    path = path.slice(1);
  }
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildQuentnHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readQuentnPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return {};
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    const detail = text.trim() ? `: ${text.trim()}` : "";
    throw new ProviderRequestError(502, `Quentn returned a non-JSON response${detail}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    const detail = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new ProviderRequestError(502, `Quentn returned invalid JSON${detail}`, error);
  }
}

function mapQuentnHttpError(status: number, payload: unknown, phase: QuentnRequestPhase): ProviderRequestError {
  const message = readQuentnErrorMessage(payload) ?? `Quentn request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return phase === "validation"
      ? new ProviderRequestError(400, message, payload)
      : new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404 || payloadHasError(payload)) {
    return new ProviderRequestError(status >= 400 ? status : 400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function payloadHasError(payload: unknown): boolean {
  return optionalRecord(payload)?.error === true;
}

function readQuentnErrorMessage(payload: unknown): string | undefined {
  return optionalString(optionalRecord(payload)?.message);
}

function readValidationCredential(input: { apiKey: string; values: Record<string, string> }): QuentnCredentialInput & {
  systemId: string;
  serverId: string;
  apiBaseUrl: string;
} {
  const systemId = normalizeQuentnLabel(requiredCredentialValue(input.values.systemId, "systemId"));
  const serverId = normalizeQuentnLabel(requiredCredentialValue(input.values.serverId, "serverId"));
  return {
    apiKey: input.apiKey,
    values: input.values,
    systemId,
    serverId,
    apiBaseUrl: buildQuentnApiBaseUrl(systemId, serverId),
  };
}

function readStoredCredential(
  input: QuentnCredentialInput,
): Pick<QuentnActionContext, "apiKey" | "systemId" | "serverId" | "apiBaseUrl"> {
  const systemId = normalizeQuentnLabel(
    optionalString(input.metadata?.systemId) ?? requiredCredentialValue(input.values.systemId, "systemId"),
  );
  const serverId = normalizeQuentnLabel(
    optionalString(input.metadata?.serverId) ?? requiredCredentialValue(input.values.serverId, "serverId"),
  );
  return {
    apiKey: input.apiKey,
    systemId,
    serverId,
    apiBaseUrl: readStoredApiBaseUrl(input.metadata, systemId, serverId),
  };
}

function readStoredApiBaseUrl(
  providerMetadata: Record<string, unknown> | undefined,
  normalizedSystemId: string,
  normalizedServerId: string,
): string {
  const apiBaseUrl = optionalString(providerMetadata?.apiBaseUrl);
  if (apiBaseUrl) {
    return normalizeQuentnApiBaseUrl(apiBaseUrl);
  }
  return buildQuentnApiBaseUrl(normalizedSystemId, normalizedServerId);
}

function requiredCredentialValue(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function normalizeQuentnLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!isQuentnDnsLabel(normalized)) {
    throw new ProviderRequestError(
      400,
      "Quentn systemId and serverId must be DNS labels containing only letters, numbers, and hyphens",
    );
  }
  return normalized;
}

function isQuentnDnsLabel(value: string): boolean {
  return value.length > 0 && value.length <= 63 && !value.startsWith("-") && !value.endsWith("-")
    ? [...value].every(isQuentnDnsLabelChar)
    : false;
}

function isQuentnDnsLabelChar(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-";
}

function buildQuentnApiBaseUrl(systemId: string, serverId: string): string {
  return `https://${systemId}.${serverId}.${quentnBaseDomain}${quentnApiPathPrefix}`;
}

function normalizeQuentnApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "Quentn apiBaseUrl must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Quentn apiBaseUrl must use https");
  }
  if (!url.hostname.endsWith(`.${quentnBaseDomain}`)) {
    throw new ProviderRequestError(400, "Quentn apiBaseUrl must be under quentn.com");
  }
  url.pathname = quentnApiPathPrefix;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function buildListUsersQuery(input: Record<string, unknown>): Record<string, QuentnQueryValue> {
  return compactObject({
    range: optionalIntegerLike(input.range, "range", invalidInputError),
    limit: optionalIntegerLike(input.limit, "limit", invalidInputError),
    sort: optionalString(input.sort),
  });
}

function buildFieldsQuery(input: Record<string, unknown>): Record<string, string> | undefined {
  const fields = readStringArray(input.fields);
  return fields ? { fields: fields.join(",") } : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }
  return value.map((item) => requiredString(item, "array item", invalidInputError));
}

function readPositiveIntegerArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty integer array`);
  }
  return value.map((item) => positiveInteger(item, fieldName, invalidInputError));
}

function requirePayloadObject(value: unknown, name: string): Record<string, unknown> {
  return requiredRecord(value, `${name} response`, providerError);
}

function assertCreateContactHasRequiredFields(contact: Record<string, unknown>): void {
  if (optionalString(contact.mail)) {
    return;
  }
  const requiredAddressFields = ["first_name", "family_name", "ba_street", "ba_city", "ba_postal_code"];
  if (requiredAddressFields.every((field) => optionalString(contact[field]))) {
    return;
  }
  throw new ProviderRequestError(
    400,
    "contact must include mail or a full billing address with first_name, family_name, ba_street, ba_city, and ba_postal_code",
  );
}

function normalizeUserListResponse(payload: Record<string, unknown>): {
  number_users: number | null;
  range: number | null;
  limit: number | null;
  sort: string | null;
  number_ranges: number | null;
  users: Array<ReturnType<typeof normalizeUser>>;
  raw: Record<string, unknown>;
} {
  return {
    number_users: readNullableInteger(payload.number_users),
    range: readNullableInteger(payload.range),
    limit: readNullableInteger(payload.limit),
    sort: readNullableString(payload.sort),
    number_ranges: readNullableInteger(payload.number_ranges),
    users: Array.isArray(payload.users)
      ? payload.users.map((user) => normalizeUser(requirePayloadObject(user, "Quentn user")))
      : [],
    raw: payload,
  };
}

function normalizeUser(payload: Record<string, unknown>): {
  uid: number | null;
  mail: string | null;
  first_name: string | null;
  last_name: string | null;
  timezone: string | null;
  language: string | null;
  created: number | null;
  changed: number | null;
  roles: Array<ReturnType<typeof normalizeRole>>;
  raw: Record<string, unknown>;
} {
  return {
    uid: readNullableInteger(payload.uid),
    mail: readNullableString(payload.mail),
    first_name: readNullableString(payload.first_name),
    last_name: readNullableString(payload.last_name),
    timezone: readNullableString(payload.timezone),
    language: readNullableString(payload.language),
    created: readNullableInteger(payload.created),
    changed: readNullableInteger(payload.changed),
    roles: Array.isArray(payload.roles)
      ? payload.roles.map((role) => normalizeRole(requirePayloadObject(role, "Quentn role")))
      : [],
    raw: payload,
  };
}

function normalizeRole(payload: Record<string, unknown>): {
  rid: number | null;
  name: string | null;
  raw: Record<string, unknown>;
} {
  return {
    rid: readNullableInteger(payload.rid),
    name: readNullableString(payload.name),
    raw: payload,
  };
}

function normalizeContact(payload: Record<string, unknown>): {
  id: number | null;
  first_name: string | null;
  family_name: string | null;
  mail: string | null;
  mail_status: number | null;
  raw: Record<string, unknown>;
} {
  return {
    id: readNullableInteger(payload.id),
    first_name: readNullableString(payload.first_name),
    family_name: readNullableString(payload.family_name),
    mail: readNullableString(payload.mail),
    mail_status: readNullableInteger(payload.mail_status),
    raw: payload,
  };
}

function normalizeTerm(payload: Record<string, unknown>): {
  id: number | null;
  name: string | null;
  description: string | null;
  deletion_blocked: boolean | null;
  raw: Record<string, unknown>;
} {
  return {
    id: readNullableInteger(payload.id),
    name: readNullableString(payload.name),
    description: readNullableString(payload.description),
    deletion_blocked: optionalBoolean(payload.deletion_blocked) ?? null,
    raw: payload,
  };
}

function normalizeSuccess(payload: Record<string, unknown>): {
  success: boolean;
  raw: Record<string, unknown>;
} {
  return {
    success: payload.success === true || payload.success === "true",
    raw: payload,
  };
}

function readNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalIntegerLike(value, "integer", providerError) ?? null;
}

function readNullableString(value: unknown): string | null {
  return value === null ? null : (optionalRawString(value) ?? null);
}

function buildUserLabel(user: ReturnType<typeof normalizeUser> | undefined): string | undefined {
  if (!user) {
    return undefined;
  }
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (name && user.mail) {
    return `${name} (${user.mail})`;
  }
  return name || user.mail || undefined;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
