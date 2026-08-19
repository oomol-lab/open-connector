import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const brevoApiBaseUrl = "https://api.brevo.com";
const brevoValidationPath = "/v3/account";

type BrevoRequestMode = "validate" | "execute";
type BrevoMethod = "GET" | "POST" | "PUT" | "DELETE";
type BrevoQueryValue = string | number | undefined;
type BrevoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BrevoActionHandler = (input: Record<string, unknown>, context: BrevoActionContext) => Promise<unknown>;

interface BrevoRequestOptions {
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  mode: BrevoRequestMode;
  signal?: AbortSignal;
  method?: BrevoMethod;
  query?: Record<string, BrevoQueryValue>;
  body?: unknown;
}

export const brevoActionHandlers: ProviderActionHandlers<"brevo", BrevoActionHandler> = {
  get_account(_input, context) {
    return getAccount(context);
  },
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  create_contact(input, context) {
    return createContact(input, context);
  },
  delete_contact(input, context) {
    return deleteContact(input, context);
  },
  list_contact_folders(input, context) {
    return listContactFolders(input, context);
  },
  list_contact_lists(input, context) {
    return listContactLists(input, context);
  },
  create_contact_list(input, context) {
    return createContactList(input, context);
  },
  update_contact_list(input, context) {
    return updateContactList(input, context);
  },
  list_contacts_in_list(input, context) {
    return listContactsInList(input, context);
  },
  add_contacts_to_list(input, context) {
    return mutateListMembers(input, context, "add");
  },
  remove_contacts_from_list(input, context) {
    return mutateListMembers(input, context, "remove");
  },
};

export async function validateBrevoCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const payload = await requestBrevoJson({
    apiKey: trimmedApiKey,
    path: brevoValidationPath,
    fetcher,
    signal,
    mode: "validate",
  });

  const email = optionalString(payload.email);
  const companyName = optionalString(payload.companyName);
  const organizationId = optionalInteger(payload.organization_id);

  return {
    profile: {
      accountId: organizationId !== undefined ? `brevo:account:${organizationId}` : "brevo:api_key",
      displayName: email ?? companyName ?? "Brevo API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: brevoValidationPath,
      email,
      companyName,
      organizationId,
    }),
  };
}

async function getAccount(context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: brevoValidationPath,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function listContacts(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: "/v3/contacts",
    query: compactObject({
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      sort: optionalString(input.sort),
      modifiedSince: optionalString(input.modifiedSince),
      createdSince: optionalString(input.createdSince),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function getContact(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: `/v3/contacts/${encodeURIComponent(readRequiredString(input.identifier, "identifier"))}`,
    query: compactObject({
      identifierType: optionalString(input.identifierType),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function createContact(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: "/v3/contacts",
    method: "POST",
    body: compactObject({
      email: readRequiredString(input.email, "email"),
      ext_id: optionalString(input.extId),
      listIds: optionalIntegerArray(input.listIds),
      emailBlacklisted: optionalBoolean(input.emailBlacklisted),
      smsBlacklisted: optionalBoolean(input.smsBlacklisted),
      attributes: optionalRecord(input.attributes),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function deleteContact(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  await requestBrevoNoContent({
    apiKey: context.apiKey,
    path: `/v3/contacts/${encodeURIComponent(readRequiredString(input.identifier, "identifier"))}`,
    method: "DELETE",
    query: compactObject({
      identifierType: optionalString(input.identifierType),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return { success: true };
}

async function listContactFolders(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: "/v3/contacts/folders",
    query: buildPaginationQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function listContactLists(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: "/v3/contacts/lists",
    query: buildPaginationQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function createContactList(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: "/v3/contacts/lists",
    method: "POST",
    body: {
      name: readRequiredString(input.name, "name"),
      folderId: readRequiredInteger(input.folderId, "folderId"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function updateContactList(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  await requestBrevoNoContent({
    apiKey: context.apiKey,
    path: `/v3/contacts/lists/${String(readRequiredInteger(input.listId, "listId"))}`,
    method: "PUT",
    body: compactObject({
      name: optionalString(input.name),
      folderId: optionalInteger(input.folderId),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return { success: true };
}

async function listContactsInList(input: Record<string, unknown>, context: BrevoActionContext): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: `/v3/contacts/lists/${String(readRequiredInteger(input.listId, "listId"))}/contacts`,
    query: compactObject({
      ...buildPaginationQuery(input),
      modifiedSince: optionalString(input.modifiedSince),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function mutateListMembers(
  input: Record<string, unknown>,
  context: BrevoActionContext,
  mode: "add" | "remove",
): Promise<unknown> {
  return requestBrevoJson({
    apiKey: context.apiKey,
    path: `/v3/contacts/lists/${String(readRequiredInteger(input.listId, "listId"))}/contacts/${mode}`,
    method: "POST",
    body: buildListSelectorPayload(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, BrevoQueryValue> {
  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    sort: optionalString(input.sort),
  });
}

function buildListSelectorPayload(input: Record<string, unknown>): Record<string, string[] | number[]> {
  const emails = optionalStringArray(input.emails);
  if (emails) {
    return { emails };
  }

  const ids = optionalIntegerArray(input.ids);
  if (ids) {
    return { ids };
  }

  const extIds = optionalStringArray(input.extIds);
  if (extIds) {
    return { extIds };
  }

  throw new ProviderRequestError(400, "exactly one of emails, ids, or extIds is required");
}

async function requestBrevoJson(input: BrevoRequestOptions): Promise<Record<string, unknown>> {
  const response = await brevoFetch(input);
  const payload = await readBrevoPayload(response);
  if (!response.ok) {
    throw createBrevoError(response, payload, input.mode);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Brevo response must be an object");
  }

  return payload as Record<string, unknown>;
}

async function requestBrevoNoContent(input: BrevoRequestOptions): Promise<void> {
  const response = await brevoFetch(input);
  const payload = await readBrevoPayload(response);
  if (!response.ok) {
    throw createBrevoError(response, payload, input.mode);
  }
}

async function brevoFetch(input: BrevoRequestOptions): Promise<Response> {
  const url = buildBrevoUrl(input.path, input.query);

  try {
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildBrevoHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Brevo request failed: ${error.message}` : "Brevo request failed",
    );
  }
}

function buildBrevoUrl(path: string, query?: Record<string, BrevoQueryValue>): URL {
  const url = new URL(path, brevoApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildBrevoHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "api-key": apiKey,
    "user-agent": providerUserAgent,
  };

  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function readBrevoPayload(response: Response): Promise<unknown> {
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

function createBrevoError(response: Response, payload: unknown, mode: BrevoRequestMode): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ??
    optionalString(body?.code) ??
    response.statusText ??
    `Brevo request failed with ${response.status}`;

  if (mode === "validate" && response.status === 401) {
    return new ProviderRequestError(400, message, payload);
  }

  if (mode === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  return integer(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const parsed = value
    .map((item) => (typeof item === "string" ? item.trim() : undefined))
    .filter((item): item is string => Boolean(item));
  return parsed.length > 0 ? parsed : undefined;
}

function optionalIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const parsed = value.map((item) => optionalInteger(item)).filter((item): item is number => item !== undefined);
  return parsed.length > 0 ? parsed : undefined;
}
