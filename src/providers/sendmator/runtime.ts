import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { SendmatorActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const sendmatorApiBaseUrl = "https://api.sendmator.com/api/v1";
const sendmatorDefaultRequestTimeoutMs = 30_000;

type SendmatorActionHandler = (input: Record<string, unknown>, context: SendmatorActionContext) => Promise<unknown>;

type SendmatorRequestPhase = "validate" | "execute";

export interface SendmatorActionContext extends ApiKeyProviderContext {
  teamId?: string;
  phase: SendmatorRequestPhase;
}

export const sendmatorActionHandlers: Record<SendmatorActionName, SendmatorActionHandler> = {
  list_contacts(input, context) {
    return executeListContacts(input, context);
  },
  create_contact(input, context) {
    return requestSendmatorJson({
      apiKey: context.apiKey,
      teamId: context.teamId,
      phase: context.phase,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "POST",
      path: "/contacts",
      body: contactMutationBody(input),
    });
  },
  get_contact(input, context) {
    return requestSendmatorJson({
      apiKey: context.apiKey,
      teamId: context.teamId,
      phase: context.phase,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "GET",
      path: `/contacts/${encodeURIComponent(readRequiredString(input.contact_id, "contact_id"))}`,
    });
  },
  update_contact(input, context) {
    return requestSendmatorJson({
      apiKey: context.apiKey,
      teamId: context.teamId,
      phase: context.phase,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "PUT",
      path: `/contacts/${encodeURIComponent(readRequiredString(input.contact_id, "contact_id"))}`,
      body: contactMutationBody(input),
    });
  },
  delete_contact(input, context) {
    return requestSendmatorJson({
      apiKey: context.apiKey,
      teamId: context.teamId,
      phase: context.phase,
      fetcher: context.fetcher,
      signal: context.signal,
      method: "DELETE",
      path: `/contacts/${encodeURIComponent(readRequiredString(input.contact_id, "contact_id"))}`,
    });
  },
};

export async function validateSendmatorCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readSendmatorApiKey(input);
  const teamId = readOptionalTeamId(input);
  const payload = await requestSendmatorJson({
    apiKey,
    teamId,
    phase: "validate",
    fetcher,
    signal,
    method: "GET",
    path: "/contacts",
    query: {
      limit: 1,
    },
  });
  const list = normalizeContactList(payload);
  const firstContact = optionalRecord(list.contacts[0]);

  return {
    profile: {
      accountId: teamId ? `team:${teamId}` : "sendmator",
      displayName: teamId ? `Sendmator ${teamId}` : "Sendmator API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: sendmatorApiBaseUrl,
      validationEndpoint: "/contacts",
      teamId,
      hasContacts: list.contacts.length > 0,
      firstContactId: firstContact ? optionalString(firstContact.id) : undefined,
      firstContactEmail: firstContact ? optionalString(firstContact.email) : undefined,
    }),
  };
}

async function executeListContacts(
  input: Record<string, unknown>,
  context: {
    apiKey: string;
    teamId?: string;
    phase: SendmatorRequestPhase;
    fetcher: typeof fetch;
    signal?: AbortSignal;
  },
) {
  const payload = await requestSendmatorJson({
    apiKey: context.apiKey,
    teamId: context.teamId,
    phase: context.phase,
    fetcher: context.fetcher,
    signal: context.signal,
    method: "GET",
    path: "/contacts",
    query: compactObject({
      limit: input.limit,
      starting_after: optionalString(input.starting_after),
      tag: optionalString(input.tag),
      is_active: optionalBoolean(input.is_active),
      search: optionalString(input.search),
      created_after: optionalString(input.created_after),
      created_before: optionalString(input.created_before),
    }),
  });

  return normalizeContactList(payload);
}

async function requestSendmatorJson(input: {
  apiKey: string;
  teamId?: string;
  phase: SendmatorRequestPhase;
  fetcher: typeof fetch;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(path, `${sendmatorApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-API-Key": input.apiKey,
  };
  if (input.teamId) {
    headers["X-Team-ID"] = input.teamId;
  }
  if (input.body) {
    headers["content-type"] = "application/json";
  }

  const timeout = createProviderTimeout(input.signal, sendmatorDefaultRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      timeout.didTimeout() || isAbortLikeError(error)
        ? `sendmator request timed out after ${sendmatorDefaultRequestTimeoutMs}ms`
        : `sendmator request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readSendmatorPayload(response);
  if (!response.ok) {
    throw mapSendmatorError(response.status, readSendmatorMessage(payload, response.statusText), input.phase);
  }

  return requireSendmatorObject(payload);
}

async function readSendmatorPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "sendmator returned malformed JSON");
    }
    return { message: text };
  }
}

function contactMutationBody(input: Record<string, unknown>) {
  return compactObject({
    external_id: optionalString(input.external_id),
    email: optionalString(input.email),
    first_name: optionalString(input.first_name),
    last_name: optionalString(input.last_name),
    tags: readOptionalStringArray(input.tags),
    is_active: optionalBoolean(input.is_active),
    custom_fields: optionalRecord(input.custom_fields),
    metadata: optionalRecord(input.metadata),
  });
}

function normalizeContactList(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, "sendmator /contacts returned invalid data");
  }

  return {
    contacts: payload.data,
    has_more: payload.has_more === true,
    next_cursor: payload.next_cursor === null ? null : (optionalString(payload.next_cursor) ?? null),
  };
}

function requireSendmatorObject(payload: unknown) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  throw new ProviderRequestError(502, "sendmator returned an invalid JSON object");
}

function mapSendmatorError(status: number, message: string, phase: SendmatorRequestPhase) {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message || "invalid sendmator api key");
  }
  if (status === 404) {
    return new ProviderRequestError(404, message || "sendmator resource not found");
  }
  if (status === 409) {
    return new ProviderRequestError(409, message || "sendmator resource already exists");
  }
  if (status === 429) {
    return new ProviderRequestError(429, message || "sendmator rate limit exceeded");
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message || "sendmator rejected the request");
  }

  return new ProviderRequestError(502, message || "sendmator request failed");
}

function readSendmatorMessage(payload: unknown, fallback: string) {
  const object = optionalRecord(payload);
  if (!object) {
    return fallback;
  }

  const directMessage = optionalString(object.message);
  if (directMessage) {
    return directMessage;
  }

  const error = object.error;
  if (typeof error === "string") {
    return error;
  }
  const nestedError = optionalRecord(error);
  return nestedError ? (optionalString(nestedError.message) ?? fallback) : fallback;
}

function readSendmatorApiKey(input: { apiKey?: string }): string {
  return requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
}

export function readOptionalTeamId(input: { values?: Record<string, string>; teamId?: string }): string | undefined {
  let teamId: string | undefined;
  if ("values" in input && input.values && typeof input.values === "object") {
    teamId = input.values.teamId;
  }
  if (!teamId && "teamId" in input && typeof input.teamId === "string") {
    teamId = input.teamId;
  }
  const trimmed = teamId?.trim();
  return trimmed || undefined;
}

function readRequiredString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value)?.trim();
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function readOptionalStringArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "string array input is required");
  }
  return value.map((item) => String(item));
}
