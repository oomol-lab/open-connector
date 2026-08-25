import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const mailjetApiBaseUrl = "https://api.mailjet.com/v3/REST";
const mailjetValidationPath = "/contact?Limit=1";

type MailjetRequestPhase = "validate" | "execute";
type MailjetQueryValue = string | number | boolean | undefined;
type MailjetActionHandler = (input: Record<string, unknown>, context: MailjetContext) => Promise<unknown>;

export interface MailjetContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const mailjetActionHandlers: ProviderActionHandlers<"mailjet", MailjetActionHandler> = {
  list_contacts(input, context) {
    return executeListContacts(input, context);
  },
  get_contact(input, context) {
    return executeGetContact(input, context);
  },
  create_contact(input, context) {
    return executeCreateContact(input, context);
  },
  update_contact(input, context) {
    return executeUpdateContact(input, context);
  },
};

export async function validateMailjetCredential(
  apiKey: string,
  apiSecret: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestMailjetJson({
    apiKey,
    apiSecret,
    method: "GET",
    path: mailjetValidationPath,
    phase: "validate",
    fetcher,
    signal,
  });

  return {
    profile: {
      accountId: "mailjet:api-key",
      displayName: "Mailjet API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: mailjetApiBaseUrl,
      validationEndpoint: mailjetValidationPath,
      validationMode: "contact_list_probe",
    },
  };
}

async function executeListContacts(input: Record<string, unknown>, context: MailjetContext): Promise<unknown> {
  const payload = await requestMailjetJson({
    ...context,
    method: "GET",
    path: "/contact",
    query: compactObject({
      Limit: optionalInteger(input.limit),
      Offset: optionalInteger(input.offset),
      Campaign: optionalInteger(input.campaign),
      ContactsList: optionalInteger(input.contactsList),
      IsExcludedFromCampaigns: optionalBoolean(input.isExcludedFromCampaigns),
      Sort: optionalString(input.sort),
    }),
    phase: "execute",
  });

  return normalizeContactListResponse(payload);
}

async function executeGetContact(input: Record<string, unknown>, context: MailjetContext): Promise<unknown> {
  const contactId = readRequiredInteger(input.contactId, "contactId");
  const payload = await requestMailjetJson({
    ...context,
    method: "GET",
    path: `/contact/${encodeURIComponent(String(contactId))}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return { contact: normalizeSingleContactResponse(payload) };
}

async function executeCreateContact(input: Record<string, unknown>, context: MailjetContext): Promise<unknown> {
  const payload = await requestMailjetJson({
    ...context,
    method: "POST",
    path: "/contact",
    body: compactObject({
      Email: optionalString(input.email),
      Name: optionalString(input.name),
      IsExcludedFromCampaigns: optionalBoolean(input.isExcludedFromCampaigns),
    }),
    phase: "execute",
  });

  return { contact: normalizeSingleContactResponse(payload) };
}

async function executeUpdateContact(input: Record<string, unknown>, context: MailjetContext): Promise<unknown> {
  const contactId = readRequiredInteger(input.contactId, "contactId");
  const payload = await requestMailjetJson({
    ...context,
    method: "PUT",
    path: `/contact/${encodeURIComponent(String(contactId))}`,
    body: compactObject({
      Name: optionalString(input.name),
      IsExcludedFromCampaigns: optionalBoolean(input.isExcludedFromCampaigns),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return { contact: normalizeSingleContactResponse(payload) };
}

async function requestMailjetJson(input: {
  apiKey: string;
  apiSecret: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, MailjetQueryValue>;
  body?: Record<string, unknown>;
  phase: MailjetRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const response = await requestMailjet(input);
  const payload = await readMailjetPayload(response);
  if (!response.ok) {
    throw createMailjetError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }
  return payload;
}

async function requestMailjet(input: {
  apiKey: string;
  apiSecret: string;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, MailjetQueryValue>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Response> {
  const url = new URL(trimLeadingSlashes(input.path), `${mailjetApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildBasicAuthorizationHeader(input.apiKey, input.apiSecret),
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  try {
    return await input.fetcher(url, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mailjet request failed: ${error.message}` : "Mailjet request failed",
    );
  }
}

async function readMailjetPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMailjetError(
  response: Response,
  payload: unknown,
  phase: MailjetRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractMailjetErrorMessage(payload) ?? `Mailjet request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 400 || (response.status === 404 && notFoundAsInvalidInput)) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function extractMailjetErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.ErrorMessage) ?? optionalString(record.ErrorInfo) ?? optionalString(record.message);
}

function normalizeContactListResponse(payload: unknown): Record<string, unknown> {
  const response = requireRecord(payload, "Mailjet contact list response");
  const contacts = readArray(response.Data, "Mailjet contact list Data").map((item) => normalizeContact(item));
  return {
    count: readOptionalInteger(response.Count) ?? contacts.length,
    total: readOptionalInteger(response.Total) ?? contacts.length,
    contacts,
  };
}

function normalizeSingleContactResponse(payload: unknown): Record<string, unknown> {
  const response = normalizeContactListResponse(payload);
  const contacts = response.contacts;
  if (!Array.isArray(contacts) || !contacts[0]) {
    throw new ProviderRequestError(502, "Mailjet response did not include a contact");
  }
  return contacts[0] as Record<string, unknown>;
}

function normalizeContact(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Mailjet contact");
  return {
    id: readRequiredInteger(record.ID, "Mailjet contact ID"),
    email: readRequiredString(record.Email, "Mailjet contact Email"),
    name: readNullableString(record.Name),
    isExcludedFromCampaigns: readNullableBoolean(record.IsExcludedFromCampaigns),
    createdAt: readNullableString(record.CreatedAt),
    lastActivityAt: readNullableString(record.LastActivityAt),
    lastUpdateAt: readNullableString(record.LastUpdateAt),
    raw: record,
  };
}

function buildBasicAuthorizationHeader(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`;
}

function trimLeadingSlashes(value: string): string {
  let result = value;
  while (result.startsWith("/")) {
    result = result.slice(1);
  }
  return result;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = typeof value === "string" && value !== "" ? value : undefined;
  if (!text) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return text;
}

function readNullableString(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === "string" ? value : String(value);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const number = readOptionalInteger(value);
  if (number === undefined) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return number;
}

function readOptionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  if (!/^-?\d+$/.test(text)) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function readNullableBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim().toLowerCase();
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  return null;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value;
}
