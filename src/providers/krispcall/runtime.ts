import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBooleanOrNull,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalScalarString,
  optionalString,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const krispcallApiBaseUrl = "https://api.krispcall.com";
export const krispcallTokenUrl = "https://app-login.krispcall.com/api/login/oauth/access_token";

const krispcallRequestTimeoutMs = 30_000;

export interface KrispCallCredential {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface KrispCallActionContext {
  readonly accessToken: string;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
}

interface KrispCallRequestInput {
  readonly accessToken: string;
  readonly path: string;
  readonly fetcher: typeof fetch;
  readonly operation: string;
  readonly signal?: AbortSignal;
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly query?: Record<string, string | number | undefined>;
  readonly body?: Record<string, unknown>;
}

interface KrispCallEnvelope {
  readonly data: unknown;
  readonly metadata: Record<string, unknown> | null;
  readonly raw: Record<string, unknown>;
}

export const krispcallActionHandlers: ProviderActionHandlers<
  "krispcall",
  ProviderRuntimeHandler<KrispCallActionContext>
> = {
  async get_workspace(_input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: "/api/v1/workspace",
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "get workspace",
      }),
      "workspace",
    );
    return {
      workspace: normalizeWorkspace(readResponseObject(payload.data, "KrispCall workspace response is missing data")),
      raw: payload.raw,
    };
  },
  async list_contacts(input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: "/api/v1/contacts",
        query: listQuery(input),
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "list contacts",
      }),
      "contact list",
    );
    return {
      contacts: readObjectList(payload.data, "KrispCall contact list response is missing data").map(normalizeContact),
      metadata: normalizeMetadata(payload.metadata),
      raw: payload.raw,
    };
  },
  async get_contact(input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: `/api/v1/contacts/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "get contact",
      }),
      "contact detail",
    );
    return {
      contact: normalizeContact(readResponseObject(payload.data, "KrispCall contact response is missing data")),
      raw: payload.raw,
    };
  },
  async create_contact(input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: "/api/v1/contacts",
        method: "POST",
        body: buildContactBody(input, true),
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "create contact",
      }),
      "create contact",
    );
    return {
      contact: normalizeContact(readResponseObject(payload.data, "KrispCall create contact response is missing data")),
      raw: payload.raw,
    };
  },
  async update_contact(input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: `/api/v1/contacts/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        method: "PUT",
        body: buildContactBody(input, false),
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "update contact",
      }),
      "update contact",
    );
    return {
      contact: normalizeContact(readResponseObject(payload.data, "KrispCall update contact response is missing data")),
      raw: payload.raw,
    };
  },
  async delete_contact(input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: `/api/v1/contacts/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        method: "DELETE",
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "delete contact",
      }),
      "delete contact",
    );
    return {
      result: payload.data ?? null,
      raw: payload.raw,
    };
  },
  async list_members(input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: "/api/v1/workspace/members",
        query: listQuery(input),
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "list members",
      }),
      "member list",
    );
    return {
      members: readObjectList(payload.data, "KrispCall member list response is missing data").map(normalizeMember),
      metadata: normalizeMetadata(payload.metadata),
      raw: payload.raw,
    };
  },
  async get_member(input, context) {
    const payload = readEnvelope(
      await requestKrispCallJson({
        accessToken: context.accessToken,
        path: `/api/v1/workspace/members/${encodeURIComponent(requiredString(input.id, "id", providerInputError))}`,
        fetcher: context.fetcher,
        signal: context.signal,
        operation: "get member",
      }),
      "member detail",
    );
    return {
      member: normalizeMember(readResponseObject(payload.data, "KrispCall member response is missing data")),
      raw: payload.raw,
    };
  },
};

export async function validateKrispCallCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readKrispCallCredential(input);
  const accessToken = await exchangeKrispCallAccessToken(credential, fetcher, signal);
  const payload = readEnvelope(
    await requestKrispCallJson({
      accessToken,
      path: "/api/v1/workspace",
      fetcher,
      signal,
      operation: "get workspace",
    }),
    "workspace",
  );
  const workspace = normalizeWorkspace(
    readResponseObject(payload.data, "KrispCall workspace response is missing data"),
  );
  const accountLabel = workspace.title ?? workspace.name ?? "KrispCall Workspace";
  return {
    profile: {
      accountId: workspace.id ? `krispcall:${workspace.id}` : `krispcall:${credential.clientId}`,
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: krispcallApiBaseUrl,
      tokenEndpoint: krispcallTokenUrl,
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      workspaceName: workspace.name,
    },
  };
}

export async function exchangeKrispCallAccessToken(
  credential: KrispCallCredential,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  const form = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credential.clientId,
    client_secret: credential.clientSecret,
  });
  const response = await fetchKrispCallResponse({
    fetcher,
    url: krispcallTokenUrl,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: form.toString(),
      signal,
    },
    operation: "exchange access token",
  });
  const payload = await readKrispCallPayload(response, "access token");
  if (!response.ok) {
    throw createKrispCallError(response.status, payload, "access token exchange");
  }
  const tokenResponse = optionalRecord(payload);
  const accessToken = optionalString(tokenResponse?.access_token);
  if (!accessToken) {
    throw new ProviderRequestError(502, "KrispCall access token is missing");
  }
  return accessToken;
}

function readKrispCallCredential(input: Record<string, string>): KrispCallCredential {
  return {
    clientId: requiredString(input.clientId, "clientId", providerInputError),
    clientSecret: requiredString(input.clientSecret, "clientSecret", providerInputError),
  };
}

async function requestKrispCallJson(input: KrispCallRequestInput) {
  const url = new URL(`${krispcallApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    authorization: `JWT ${input.accessToken}`,
    "user-agent": providerUserAgent,
  });
  if (input.body != null) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  const response = await fetchKrispCallResponse({
    fetcher: input.fetcher,
    url,
    init: {
      method: input.method ?? "GET",
      headers,
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    },
    operation: input.operation,
  });
  const payload = await readKrispCallPayload(response, input.operation);
  if (!response.ok) {
    throw createKrispCallError(response.status, payload, input.operation);
  }
  return payload;
}

async function fetchKrispCallResponse(input: {
  readonly fetcher: typeof fetch;
  readonly url: string | URL;
  readonly init: RequestInit;
  readonly operation: string;
}) {
  const timeout = createProviderTimeout(input.init.signal ?? undefined, krispcallRequestTimeoutMs);
  try {
    return await input.fetcher(input.url, { ...input.init, signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `KrispCall ${input.operation} request timed out`);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `KrispCall ${input.operation} request failed: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readKrispCallPayload(response: Response, operation: string) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, `KrispCall ${operation} returned malformed JSON`);
    }
    return text;
  }
}

function readEnvelope(payload: unknown, operation: string): KrispCallEnvelope {
  const envelope = optionalRecord(payload);
  if (!envelope || !("data" in envelope)) {
    throw new ProviderRequestError(502, `KrispCall ${operation} response is missing data`);
  }
  return {
    data: envelope.data,
    metadata: optionalRecord(envelope.metadata) ?? null,
    raw: envelope,
  };
}

function normalizeWorkspace(input: Record<string, unknown>) {
  return {
    id: nullableString(input.id),
    title: nullableString(input.title),
    name: nullableString(input.name),
    status: nullableString(input.status),
    kycVerified: nullableBoolean(input.kyc_verified),
    raw: input,
  };
}

function normalizeContact(input: Record<string, unknown>) {
  return {
    id: nullableString(input.id),
    contact: nullableString(input.contact),
    name: nullableString(input.name),
    email: nullableString(input.email),
    company: nullableString(input.company),
    address: nullableString(input.address),
    country: nullableString(input.country),
    status: nullableString(input.status),
    visibility: nullableString(input.visibility),
    blocked: nullableBoolean(input.blocked),
    favourite: nullableBoolean(input.favourite),
    secondaryPhone: stringList(input.secondary_phone),
    secondaryEmail: stringList(input.secondary_email),
    tags: stringList(input.tags),
    raw: input,
  };
}

function normalizeMember(input: Record<string, unknown>) {
  return {
    id: nullableString(input.id),
    email: nullableString(input.email),
    firstName: nullableString(input.first_name),
    lastName: nullableString(input.last_name),
    dateOfBirth: nullableString(input.date_of_birth),
    gender: nullableString(input.gender),
    workspace: optionalRecord(input.workspace) ?? {},
    raw: input,
  };
}

function normalizeMetadata(input: Record<string, unknown> | null) {
  if (!input) {
    return null;
  }
  return {
    size: nullableInteger(input.size),
    page: nullableInteger(input.page),
    totalCount: nullableInteger(input.total_count),
    raw: input,
  };
}

function buildContactBody(input: Record<string, unknown>, requireContact: boolean) {
  const body = compactObject({
    contact: requireContact
      ? requiredString(input.contact, "contact", providerInputError)
      : optionalRawString(input.contact),
    country: optionalRawString(input.country),
    name: optionalRawString(input.name),
    email: optionalRawString(input.email),
    company: optionalRawString(input.company),
    address: optionalRawString(input.address),
    tags: optionalStringArray(input.tags),
    secondary_phone: optionalStringArray(input.secondaryPhone),
    secondary_email: optionalStringArray(input.secondaryEmail),
  });
  return body;
}

function listQuery(input: Record<string, unknown>) {
  return {
    page: optionalInteger(input.page),
    size: optionalInteger(input.size),
  };
}

function readObjectList(value: unknown, message: string) {
  return objectArray(value, "KrispCall list response item", () => new ProviderRequestError(502, message));
}

function readResponseObject(value: unknown, message: string) {
  return requiredRecord(value, "KrispCall response", () => new ProviderRequestError(502, message));
}

function nullableString(value: unknown) {
  return value === "" ? null : (optionalScalarString(value) ?? null);
}

function nullableInteger(value: unknown) {
  const parsed = optionalInteger(value);
  return parsed ?? null;
}

function nullableBoolean(value: unknown) {
  return optionalBooleanOrNull(value);
}

function stringList(value: unknown) {
  return Array.isArray(value) ? stringArray(value, "KrispCall string list") : [];
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value) ? stringArray(value, "KrispCall string list") : undefined;
}

function createKrispCallError(status: number, payload: unknown, operation: string) {
  const message = readErrorMessage(payload) ?? `KrispCall ${operation} failed`;
  if (status == 401 || status == 403) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload == "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  const detail = optionalString(object?.detail);
  if (detail) {
    return detail;
  }
  const message = optionalString(object?.message);
  if (message) {
    return message;
  }
  const error = optionalString(object?.error);
  if (error) {
    return error;
  }
  return undefined;
}
