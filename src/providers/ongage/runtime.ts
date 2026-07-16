import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { OngageActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredStringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const ongageApiBaseUrl = "https://api.ongage.com";

const ongageRequestTimeoutMs = 30_000;

type OngageRequestPhase = "validate" | "execute";
type OngageRequestMethod = "GET" | "POST" | "PUT";
type OngageQuery = Record<string, boolean | number | string | undefined>;
type OngageActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface OngageRequestOptions {
  apiKey: string;
  fetcher: ProviderFetch;
  method: OngageRequestMethod;
  path: string;
  phase: OngageRequestPhase;
  signal?: AbortSignal;
  query?: OngageQuery;
  body?: unknown;
}

interface OngageResponseEnvelope {
  metadata: Record<string, unknown>;
  payload: unknown;
}

export const ongageActionHandlers: Record<OngageActionName, OngageActionHandler> = {
  list_lists: listLists,
  get_list: getList,
  get_contact_by_email: getContactByEmail,
  get_contact_by_id: getContactById,
  upsert_contacts: upsertContacts,
  update_contacts: updateContacts,
  change_contact_status: changeContactStatus,
};

export async function validateOngageCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const envelope = await requestOngage({
    apiKey,
    fetcher,
    method: "GET",
    path: "/api/lists",
    phase: "validate",
    signal,
    query: { limit: 1 },
  });
  const lists = Array.isArray(envelope.payload) ? envelope.payload : [];
  const firstList = optionalRecord(lists[0]);
  const accountId = optionalInteger(firstList?.account_id);
  const firstListId = optionalInteger(firstList?.id);
  const firstListName = optionalString(firstList?.name);

  return {
    profile: {
      accountId: accountId === undefined ? "ongage" : String(accountId),
      displayName: accountId === undefined ? "Ongage API Key" : `Ongage Account ${accountId}`,
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: ongageApiBaseUrl,
      validationEndpoint: "/api/lists",
      accountId,
      firstListId,
      firstListName,
    }),
  };
}

async function listLists(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const envelope = await requestOngage({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    path: "/api/lists",
    phase: "execute",
    signal: context.signal,
    query: compactObject({
      name: optionalString(input.name),
      type: optionalString(input.type),
      sort: optionalString(input.sort),
      order: optionalString(input.order),
      offset: optionalNumber(input.offset),
      limit: optionalNumber(input.limit),
    }),
  });
  if (!Array.isArray(envelope.payload)) {
    throw new ProviderRequestError(502, "Ongage returned an invalid list payload");
  }

  return {
    lists: envelope.payload,
    total: optionalInteger(envelope.metadata.total) ?? envelope.payload.length,
  };
}

async function getList(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const envelope = await requestOngage({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    path: `/api/lists/${requiredPositiveInteger(input.listId, "listId")}`,
    phase: "execute",
    signal: context.signal,
  });
  return {
    list: requiredPayloadObject(envelope.payload, "Ongage returned an invalid list payload"),
  };
}

async function getContactByEmail(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const listId = requiredPositiveInteger(input.listId, "listId");
  const email = requiredString(input.email, "email");
  const envelope = await requestOngage({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    path: `/${listId}/api/contacts/by_email/${encodePathSegment(email)}`,
    phase: "execute",
    signal: context.signal,
  });
  return {
    contact: requiredPayloadObject(envelope.payload, "Ongage returned an invalid contact payload"),
  };
}

async function getContactById(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const listId = requiredPositiveInteger(input.listId, "listId");
  const contactId = requiredString(input.contactId, "contactId");
  const envelope = await requestOngage({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "GET",
    path: `/${listId}/api/contacts/by_id/${encodePathSegment(contactId)}`,
    phase: "execute",
    signal: context.signal,
  });
  return {
    contact: requiredPayloadObject(envelope.payload, "Ongage returned an invalid contact payload"),
  };
}

async function upsertContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return mutateContacts(input, context, "POST");
}

async function updateContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return mutateContacts(input, context, "PUT");
}

async function mutateContacts(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  method: "POST" | "PUT",
): Promise<unknown> {
  const listId = requiredPositiveInteger(input.listId, "listId");
  const contacts = requiredObjectArray(input.contacts, "contacts");
  const body = contacts.length === 1 ? contacts[0] : contacts;
  const envelope = await requestOngage({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method,
    path: `/${listId}/api/v2/contacts`,
    phase: "execute",
    signal: context.signal,
    body,
  });
  return requiredPayloadObject(envelope.payload, "Ongage returned an invalid contact mutation payload");
}

async function changeContactStatus(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const listId = requiredPositiveInteger(input.listId, "listId");
  const envelope = await requestOngage({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    path: `/${listId}/api/v2/contacts/change_status`,
    phase: "execute",
    signal: context.signal,
    body: compactObject({
      list_id: listId,
      change_to: requiredString(input.changeTo, "changeTo"),
      emails: requiredStringArray(input.emails, "emails", (message) => new ProviderRequestError(400, message)),
      ocx_child_id: optionalInteger(input.ocxChildId),
      ocx_connection_id: optionalInteger(input.ocxConnectionId),
    }),
  });
  return requiredPayloadObject(envelope.payload, "Ongage returned an invalid status mutation payload");
}

async function requestOngage(input: OngageRequestOptions): Promise<OngageResponseEnvelope> {
  const timeout = createProviderTimeout(input.signal, ongageRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildOngageUrl(input.path, input.query), {
      method: input.method,
      headers: buildOngageHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readOngageJson(response);
    const envelope = readOngageEnvelope(payload);
    const metadataError = optionalBoolean(envelope.metadata.error) === true;
    if (!response.ok || metadataError) {
      const payloadStatus = optionalInteger(optionalRecord(envelope.payload)?.code);
      throw createOngageError(response.ok ? (payloadStatus ?? 400) : response.status, envelope, input.phase);
    }
    return envelope;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, "Ongage request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Ongage request failed: ${error.message}` : "Ongage request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOngageUrl(path: string, query: OngageQuery = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${ongageApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildOngageHeaders(apiKey: string, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  });
  if (hasJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readOngageJson(response: Response): Promise<unknown> {
  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Ongage returned invalid JSON",
  });
  if (payload === null) {
    throw new ProviderRequestError(502, "Ongage returned an empty response");
  }
  return payload;
}

function readOngageEnvelope(payload: unknown): OngageResponseEnvelope {
  const envelope = optionalRecord(payload);
  const metadata = optionalRecord(envelope?.metadata);
  if (!envelope || !metadata || !("payload" in envelope)) {
    throw new ProviderRequestError(502, "Ongage returned an invalid response envelope");
  }
  return { metadata, payload: envelope.payload };
}

function createOngageError(
  status: number,
  envelope: OngageResponseEnvelope,
  phase: OngageRequestPhase,
): ProviderRequestError {
  const message = extractOngageErrorMessage(envelope) ?? `Ongage request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, envelope);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, envelope);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, envelope);
  }
  return new ProviderRequestError(status || 502, message, envelope);
}

function extractOngageErrorMessage(envelope: OngageResponseEnvelope): string | undefined {
  const payload = optionalRecord(envelope.payload);
  const directMessage = optionalString(payload?.message) ?? optionalString(payload?.error);
  if (directMessage) {
    return directMessage;
  }

  const errors = payload?.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((value) => typeof value === "string");
    return optionalString(first);
  }

  const errorsObject = optionalRecord(errors);
  if (errorsObject) {
    const first = Object.values(errorsObject).find((value) => typeof value === "string");
    return optionalString(first);
  }
  return optionalString(envelope.metadata.message);
}

function requiredPayloadObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function requiredPositiveInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined || integer <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return integer;
}

function requiredString(value: unknown, fieldName: string): string {
  const string = optionalString(value);
  if (!string) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return string;
}

function requiredObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(400, `${fieldName} must contain objects`);
    }
    return record;
  });
}
