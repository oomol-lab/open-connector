import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FrontActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "front";
const frontApiBaseUrl = "https://api2.frontapp.com";
const frontRequestTimeoutMs = 15_000;

type FrontRequestPhase = "validate" | "execute";
type FrontActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type FrontActionHandler = (input: Record<string, unknown>, context: FrontActionContext) => Promise<unknown>;

interface FrontContactList {
  id: string;
  name: string;
  isPrivate: boolean;
}

interface FrontContactHandle {
  handle: string;
  source: string;
}

interface FrontContact {
  id: string;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  links: string[];
  lists: FrontContactList[];
  handles: FrontContactHandle[];
  customFields: Record<string, unknown>;
  isPrivate: boolean;
}

interface FrontTeammate {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  isAvailable: boolean;
  isBlocked: boolean;
  type: string;
  customFields: Record<string, unknown>;
}

export const frontActionHandlers: Record<FrontActionName, FrontActionHandler> = {
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  create_contact(input, context) {
    return createContact(input, context);
  },
  update_contact(input, context) {
    return updateContact(input, context);
  },
  list_teammates(_input, context) {
    return listTeammates(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, frontActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await frontFetch(buildFrontUrl("/teammates"), {
      method: "GET",
      headers: frontHeaders(input.apiKey),
      fetcher,
      signal,
    });
    const payload = await readFrontPayload(response);
    if (!response.ok) {
      throw createFrontError(response, payload, "validate");
    }

    const teammates = readResults(payload);
    const firstTeammate = teammates.length > 0 ? normalizeTeammate(teammates[0]) : undefined;
    const accountLabel = firstTeammate && [firstTeammate.firstName, firstTeammate.lastName].join(" ").trim();

    return {
      profile: {
        accountId: firstTeammate?.id ?? "front-api-token",
        displayName: accountLabel || firstTeammate?.email || "Front API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: frontApiBaseUrl,
        validationEndpoint: "/teammates",
        validationTeammateId: firstTeammate?.id,
        validationTeammateEmail: firstTeammate?.email,
      }),
    };
  },
};

async function listContacts(input: Record<string, unknown>, context: FrontActionContext): Promise<unknown> {
  const url = buildFrontUrl("/contacts");
  setOptionalSearchParam(url, "q", input.query);
  setOptionalSearchParam(url, "limit", input.limit);
  setOptionalSearchParam(url, "page_token", input.pageToken);
  setOptionalSearchParam(url, "sort_by", input.sortBy);
  setOptionalSearchParam(url, "sort_order", input.sortOrder);

  const payload = await executeFrontJsonRequest(url, "GET", context);
  return {
    contacts: readResults(payload).map((item) => normalizeContact(item)),
    pagination: normalizePagination(payload),
  };
}

async function getContact(input: Record<string, unknown>, context: FrontActionContext): Promise<unknown> {
  const contactId = readInputString(input.contactId, "contactId");
  const payload = await executeFrontJsonRequest(
    buildFrontUrl(`/contacts/${encodeURIComponent(contactId)}`),
    "GET",
    context,
  );
  return {
    contact: normalizeContact(payload),
  };
}

async function createContact(input: Record<string, unknown>, context: FrontActionContext): Promise<unknown> {
  const body = buildContactBody(input.contact, input.handles);
  const payload = await executeFrontJsonRequest(buildFrontUrl("/contacts"), "POST", context, body);
  return {
    contact: normalizeContact(payload),
  };
}

async function updateContact(input: Record<string, unknown>, context: FrontActionContext): Promise<unknown> {
  const contactId = readInputString(input.contactId, "contactId");
  const response = await frontFetch(buildFrontUrl(`/contacts/${encodeURIComponent(contactId)}`), {
    method: "PATCH",
    headers: frontJsonHeaders(context.apiKey),
    body: JSON.stringify(buildContactBody(input.contact)),
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const payload = await readFrontPayload(response);
  if (!response.ok) {
    throw createFrontError(response, payload, "execute");
  }

  return { success: true };
}

async function listTeammates(context: FrontActionContext): Promise<unknown> {
  const payload = await executeFrontJsonRequest(buildFrontUrl("/teammates"), "GET", context);
  return {
    teammates: readResults(payload).map((item) => normalizeTeammate(item)),
  };
}

async function executeFrontJsonRequest(
  url: URL,
  method: "GET" | "POST",
  context: FrontActionContext,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const response = await frontFetch(url, {
    method,
    headers: body ? frontJsonHeaders(context.apiKey) : frontHeaders(context.apiKey),
    body: body ? JSON.stringify(body) : undefined,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const payload = await readFrontPayload(response);
  if (!response.ok) {
    throw createFrontError(response, payload, "execute");
  }
  return payload;
}

function frontHeaders(apiKey: string, extraHeaders: Record<string, string | undefined> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (value !== undefined) {
      headers[key] = value;
    }
  }
  return headers;
}

function frontJsonHeaders(apiKey: string): Record<string, string> {
  return frontHeaders(apiKey, {
    "content-type": "application/json",
  });
}

function buildFrontUrl(path: string): URL {
  return new URL(path, frontApiBaseUrl);
}

function setOptionalSearchParam(url: URL, name: string, value: unknown): void {
  if (typeof value === "string" && value) {
    url.searchParams.set(name, value);
    return;
  }
  if (typeof value === "number") {
    url.searchParams.set(name, String(value));
  }
}

async function frontFetch(
  url: URL,
  input: {
    method: "GET" | "POST" | "PATCH";
    headers: HeadersInit;
    fetcher: typeof fetch;
    signal?: AbortSignal;
    body?: BodyInit;
  },
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(frontRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    return await input.fetcher(url, {
      method: input.method,
      headers: input.headers,
      signal,
      body: input.body,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !input.signal?.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "front request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      `front request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
      error,
    );
  }
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

async function readFrontPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createFrontError(response: Response, payload: unknown, phase: FrontRequestPhase): ProviderRequestError {
  const message = extractFrontMessage(payload, `front request failed with status ${response.status}`);
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractFrontMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return fallback;
  }

  const nested = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record._error) ??
    optionalString(record.error) ??
    optionalString(nested?.message) ??
    fallback
  );
}

function readResults(payload: unknown): unknown[] {
  const record = readObject(payload, "front response");
  const results = record._results;
  if (!Array.isArray(results)) {
    throw new ProviderRequestError(502, "front response is missing _results", payload);
  }
  return results;
}

function normalizePagination(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "front list response");
  const pagination = optionalRecord(record._pagination);
  const next = optionalString(pagination?.next) ?? null;
  return {
    next,
    nextPageToken: extractPageToken(next),
  };
}

function extractPageToken(next: string | null): string | null {
  if (!next) {
    return null;
  }

  try {
    return new URL(next).searchParams.get("page_token");
  } catch {
    return null;
  }
}

function normalizeContact(value: unknown): FrontContact {
  const record = readObject(value, "front contact");
  return {
    id: readRequiredString(record.id, "contact.id"),
    name: readNullableString(record.name),
    description: readNullableString(record.description),
    avatarUrl: readNullableString(record.avatar_url),
    links: readStringArray(record.links),
    lists: readArray(record.lists).map((item) => normalizeContactList(item)),
    handles: readArray(record.handles).map((item) => normalizeContactHandle(item)),
    customFields: optionalRecord(record.custom_fields) ?? {},
    isPrivate: readBoolean(record.is_private, "contact.is_private"),
  };
}

function normalizeContactList(value: unknown): FrontContactList {
  const record = readObject(value, "front contact list");
  return {
    id: readRequiredString(record.id, "contactList.id"),
    name: readRequiredString(record.name, "contactList.name"),
    isPrivate: readBoolean(record.is_private, "contactList.is_private"),
  };
}

function normalizeContactHandle(value: unknown): FrontContactHandle {
  const record = readObject(value, "front contact handle");
  return {
    handle: readRequiredString(record.handle, "contactHandle.handle"),
    source: readRequiredString(record.source, "contactHandle.source"),
  };
}

function normalizeTeammate(value: unknown): FrontTeammate {
  const record = readObject(value, "front teammate");
  return {
    id: readRequiredString(record.id, "teammate.id"),
    email: readRequiredString(record.email, "teammate.email"),
    username: readRequiredString(record.username, "teammate.username"),
    firstName: readRequiredString(record.first_name, "teammate.first_name"),
    lastName: readRequiredString(record.last_name, "teammate.last_name"),
    isAdmin: readBoolean(record.is_admin, "teammate.is_admin"),
    isAvailable: readBoolean(record.is_available, "teammate.is_available"),
    isBlocked: readBoolean(record.is_blocked, "teammate.is_blocked"),
    type: readRequiredString(record.type, "teammate.type"),
    customFields: optionalRecord(record.custom_fields) ?? {},
  };
}

function buildContactBody(contact: unknown, handles?: unknown): Record<string, unknown> {
  const contactRecord = requiredRecord(contact, "contact", (message) => new ProviderRequestError(400, message));
  const normalizedHandles =
    handles === undefined ? undefined : readArray(handles).map((item) => normalizeContactHandle(item));
  return compactObject({
    name: optionalString(contactRecord.name),
    description: optionalString(contactRecord.description),
    links: readOptionalStringArray(contactRecord.links),
    list_names: readOptionalStringArray(contactRecord.listNames),
    custom_fields: optionalRecord(contactRecord.customFields),
    handles: normalizedHandles,
  });
}

function readObject(value: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${name} must be an object`, value);
  }
  return record;
}

function readInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `${fieldName} is required`);
  }
  return text;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} must be a boolean`, value);
  }
  return value;
}

function readArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "front array field has invalid shape", value);
  }
  return value;
}

function readStringArray(value: unknown): string[] {
  return readArray(value).map((item) => readRequiredString(item, "array item"));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readStringArray(value);
}
