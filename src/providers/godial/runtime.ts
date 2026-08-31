import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, requiredInputString } from "../provider-runtime.ts";

const godialApiBaseUrl = "https://enterprise.godial.cc";
const godialValidationPath = "/meta/api/externals/accounts/list";

type GodialMode = "validation" | "execution";
type GodialMethod = "GET" | "POST";
type GodialActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const godialActionHandlers: ProviderActionHandlers<"godial", GodialActionHandler> = {
  list_accounts(_input, context) {
    return listAccounts(context);
  },
  list_lists(_input, context) {
    return listLists(context);
  },
  list_contacts_in_list(input, context) {
    return listContactsInList(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  create_contact(input, context) {
    return createContact(input, context);
  },
};

export async function validateGodialCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await godialRequest({
    method: "GET",
    path: godialValidationPath,
    apiKey: input.apiKey,
    fetcher,
    signal,
    mode: "validation",
  });

  const items = readArrayPayload(payload, "accounts list");

  return {
    profile: {
      accountId: "godial",
      displayName: "GoDial API Access Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: godialApiBaseUrl,
      validationEndpoint: godialValidationPath,
      accountCount: items.length,
    },
  };
}

async function listAccounts(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await godialRequest({
    method: "GET",
    path: "/meta/api/externals/accounts/list",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execution",
  });

  const raw = readArrayPayload(payload, "accounts list");
  return {
    accounts: raw.map((item, index) => normalizeAccount(item, `accounts[${index}]`)),
    raw,
  };
}

async function listLists(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await godialRequest({
    method: "GET",
    path: "/meta/api/externals/lists/list",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execution",
  });

  const raw = readArrayPayload(payload, "lists list");
  return {
    lists: raw.map((item, index) => normalizeList(item, `lists[${index}]`)),
    raw,
  };
}

async function listContactsInList(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const listId = requiredInputString(input.listId, "listId");
  const payload = await godialRequest({
    method: "GET",
    path: `/meta/api/externals/contact/list/${encodeURIComponent(listId)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execution",
  });

  const raw = readArrayPayload(payload, "contact list");
  return {
    contacts: raw.map((item, index) => normalizeContactSummary(item, `contacts[${index}]`)),
    raw,
  };
}

async function getContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const contactId = requiredInputString(input.contactId, "contactId");
  const payload = await godialRequest({
    method: "GET",
    path: `/meta/api/externals/contact/${encodeURIComponent(contactId)}/view`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execution",
  });

  const raw = readObjectPayload(payload, "contact view");
  return {
    contact: {
      id: readIdentifier(raw, "contact view"),
      raw,
    },
  };
}

async function createContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = new URLSearchParams();

  setOptionalField(body, "name", input.name);
  setOptionalField(body, "email", input.email);
  body.set("phone", requiredInputString(input.phone, "phone"));
  setOptionalField(body, "secondPhone", input.secondPhone);
  setOptionalField(body, "companyName", input.companyName);
  setOptionalField(body, "note", input.note);
  setOptionalField(body, "remarks", input.remarks);
  setOptionalField(body, "extra", input.extra);
  setOptionalField(body, "assignmentMode", input.assignmentMode);
  setOptionalField(body, "listId", input.listId, true);
  setOptionalField(body, "accountsId", input.assignedAccountId);
  setOptionalField(body, "source", input.source);
  setOptionalField(body, "address", input.address);

  if (input.customFields !== undefined) {
    body.set("customFields", JSON.stringify(input.customFields));
  }

  if (input.sourceMarketing !== undefined) {
    body.set("source_marketing", JSON.stringify(input.sourceMarketing));
  }

  const payload = await godialRequest({
    method: "POST",
    path: "/meta/api/externals/contact/add",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execution",
    body,
  });

  return {
    raw: readLoosePayload(payload),
  };
}

interface GodialRequestInput {
  method: GodialMethod;
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  mode: GodialMode;
  signal?: AbortSignal;
  body?: URLSearchParams;
}

async function godialRequest(input: GodialRequestInput): Promise<unknown> {
  const url = new URL(input.path, godialApiBaseUrl);
  url.searchParams.set("access_token", input.apiKey);

  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: {
        accept: "application/json, multipart/form-data, application/x-www-form-urlencoded",
        ...(input.body
          ? {
              "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            }
          : {}),
        "user-agent": providerUserAgent,
      },
      ...(input.body ? { body: input.body.toString() } : {}),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GoDial request failed: ${error.message}` : "GoDial request failed",
    );
  }

  const payload = await readGodialPayload(response);
  if (!response.ok) {
    throw buildGodialError(response.status, payload, input.mode);
  }

  return payload;
}

async function readGodialPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function buildGodialError(status: number, payload: unknown, mode: GodialMode): ProviderRequestError {
  const message = readGodialMessage(payload) ?? `GoDial request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validation" ? 400 : status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function readGodialMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function setOptionalField(body: URLSearchParams, key: string, value: unknown, required = false): void {
  if (value === undefined) {
    if (required) {
      body.set(key, requiredInputString(value, key));
    }
    return;
  }

  body.set(key, requiredInputString(value, key));
}

function readArrayPayload(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid godial ${fieldName} response`);
  }
  return value.map((item, index) => readObjectPayload(item, `${fieldName}[${index}]`));
}

function readObjectPayload(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid godial ${fieldName} response`);
  }
  return value as Record<string, unknown>;
}

function readLoosePayload(value: unknown): Record<string, unknown> {
  return readObjectPayload(value, "response");
}

function readIdentifier(record: Record<string, unknown>, fieldName: string): string {
  const candidates = [
    optionalString(record.id),
    optionalString(record.contactId),
    optionalString(record.contact_id),
    optionalString(record.accountsId),
    optionalString(record.accounts_id),
    optionalString(record.listId),
    optionalString(record.list_id),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (candidates.length > 0) {
    return candidates[0]!;
  }

  throw new ProviderRequestError(502, `invalid godial ${fieldName} response`);
}

function readName(record: Record<string, unknown>): string {
  return (
    optionalString(record.name) ??
    optionalString(record.title) ??
    optionalString(record.fullName) ??
    optionalString(record.full_name) ??
    ""
  );
}

function readPhone(record: Record<string, unknown>): string {
  return (
    optionalString(record.phone) ??
    optionalString(record.mobile) ??
    optionalString(record.phoneNumber) ??
    optionalString(record.phone_number) ??
    ""
  );
}

function normalizeAccount(record: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  return {
    id: readIdentifier(record, fieldName),
    name: readName(record),
    raw: record,
  };
}

function normalizeList(record: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  return {
    id: readIdentifier(record, fieldName),
    name: readName(record),
    raw: record,
  };
}

function normalizeContactSummary(record: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  return {
    id: readIdentifier(record, fieldName),
    phone: readPhone(record),
    name: readName(record),
    raw: record,
  };
}
