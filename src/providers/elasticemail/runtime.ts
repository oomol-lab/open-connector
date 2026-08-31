import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const elasticemailApiBaseUrl = "https://api.elasticemail.com/v4";

interface ElasticemailRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, string | number | readonly string[] | undefined>;
  body?: unknown;
}

export const elasticemailActionHandlers: ProviderActionHandlers<
  "elasticemail",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_contacts: listContacts,
  get_contact: getContact,
  add_contacts: addContacts,
  update_contact: updateContact,
  delete_contact: deleteContact,
  list_lists: listLists,
  get_list: getList,
  create_list: createList,
  update_list: updateList,
  delete_list: deleteList,
  list_contacts_in_list: listContactsInList,
  add_contacts_to_list: addContactsToList,
  remove_contacts_from_list: removeContactsFromList,
};

export async function validateElasticemailCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<number> {
  const payload = await requestElasticemailJson({
    apiKey,
    path: "/contacts",
    query: { limit: 1 },
    fetcher,
    signal,
    mode: "validate",
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Elastic Email contacts response must be an array");
  }
  return payload.length;
}

async function listContacts(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: "/contacts",
    query: pageQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function getContact(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: `/contacts/${encodeURIComponent(requiredString(input.email, "email", providerInputError))}`,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function addContacts(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: "/contacts",
    method: "POST",
    query: compactObject({
      listnames: optionalStringArray(input.listNames),
    }),
    body: asContactPayloadArray(input.contacts),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function updateContact(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: `/contacts/${encodeURIComponent(requiredString(input.email, "email", providerInputError))}`,
    method: "PUT",
    body: contactUpdateBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function deleteContact(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  await requestElasticemailNoContent({
    apiKey: context.apiKey,
    path: `/contacts/${encodeURIComponent(requiredString(input.email, "email", providerInputError))}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return { success: true };
}

async function listLists(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: "/lists",
    query: pageQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function getList(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: `/lists/${encodeURIComponent(requiredString(input.listName, "listName", providerInputError))}`,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function createList(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: "/lists",
    method: "POST",
    body: compactObject({
      ListName: requiredString(input.listName, "listName", providerInputError),
      AllowUnsubscribe: optionalBoolean(input.allowUnsubscribe),
      Emails: optionalStringArray(input.emails),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function updateList(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: `/lists/${encodeURIComponent(requiredString(input.listName, "listName", providerInputError))}`,
    method: "PUT",
    body: compactObject({
      NewListName: optionalString(input.newListName),
      AllowUnsubscribe: optionalBoolean(input.allowUnsubscribe),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function deleteList(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  await requestElasticemailNoContent({
    apiKey: context.apiKey,
    path: `/lists/${encodeURIComponent(requiredString(input.listName, "listName", providerInputError))}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return { success: true };
}

async function listContactsInList(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: `/lists/${encodeURIComponent(requiredString(input.listName, "listName", providerInputError))}/contacts`,
    query: pageQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function addContactsToList(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return requestElasticemailJson({
    apiKey: context.apiKey,
    path: `/lists/${encodeURIComponent(requiredString(input.listName, "listName", providerInputError))}/contacts`,
    method: "POST",
    body: {
      Emails: nonEmptyStringArray(input.emails, "emails"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function removeContactsFromList(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  await requestElasticemailNoContent({
    apiKey: context.apiKey,
    path: `/lists/${encodeURIComponent(requiredString(input.listName, "listName", providerInputError))}/contacts/remove`,
    method: "POST",
    body: {
      Emails: nonEmptyStringArray(input.emails, "emails"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return { success: true };
}

async function requestElasticemailJson(input: ElasticemailRequestOptions) {
  const response = await elasticemailFetch(input);
  const raw = await readResponseBody(response);
  const payload = raw.trim() === "" ? undefined : parseElasticemailBody(raw, response.ok);
  if (!response.ok) {
    throw toElasticemailError(response, payload, input.mode);
  }
  if (payload === undefined) {
    throw new ProviderRequestError(502, "Elastic Email returned an empty response body");
  }
  return payload;
}

async function requestElasticemailNoContent(input: ElasticemailRequestOptions) {
  const response = await elasticemailFetch(input);
  const raw = await readResponseBody(response);
  const payload = raw.trim() === "" ? undefined : parseElasticemailBody(raw, response.ok);
  if (!response.ok) {
    throw toElasticemailError(response, payload, input.mode);
  }
  return response;
}

async function elasticemailFetch(input: ElasticemailRequestOptions) {
  const url = new URL(
    input.path.startsWith("/") ? `${elasticemailApiBaseUrl}${input.path}` : `${elasticemailApiBaseUrl}/${input.path}`,
  );
  const method = input.method ?? "GET";
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.fetcher(url, {
      method,
      headers: elasticemailHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Elastic Email request failed for ${method} ${url.toString()}: ${message}`);
  }
}

function elasticemailHeaders(apiKey: string, hasBody: boolean) {
  return {
    accept: "application/json",
    "X-ElasticEmail-ApiKey": apiKey,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readResponseBody(response: Response) {
  try {
    return await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read Elastic Email response body: ${error.message}`
        : "Failed to read Elastic Email response body",
    );
  }
}

function parseElasticemailBody(raw: string, responseOk: boolean) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    if (!responseOk) {
      return raw;
    }
    throw new ProviderRequestError(502, "Elastic Email returned invalid JSON");
  }
}

function toElasticemailError(response: Response, payload: unknown, mode: ElasticemailRequestOptions["mode"]) {
  const message =
    extractElasticemailErrorMessage(payload) ?? `Elastic Email request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status === 404 ? 404 : 400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractElasticemailErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.Error) ??
    optionalString(record.Message) ??
    optionalString(record.message) ??
    optionalString(record.error)
  );
}

function pageQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  });
}

function contactCreateBody(input: Record<string, unknown>) {
  return compactObject({
    Email: requiredString(input.email, "email", providerInputError),
    Status: optionalString(input.status),
    FirstName: optionalString(input.firstName),
    LastName: optionalString(input.lastName),
    CustomFields: optionalRecord(input.customFields),
    Consent: consentBody(input.consent),
  });
}

function contactUpdateBody(input: Record<string, unknown>) {
  return compactObject({
    FirstName: optionalString(input.firstName),
    LastName: optionalString(input.lastName),
    CustomFields: optionalRecord(input.customFields),
  });
}

function consentBody(value: unknown) {
  const input = optionalRecord(value);
  if (!input) {
    return undefined;
  }

  return compactObject({
    ConsentIP: optionalString(input.consentIp),
    ConsentDate: optionalString(input.consentDate),
    ConsentTracking: optionalString(input.consentTracking),
  });
}

function asContactPayloadArray(value: unknown) {
  return objectArray(value, "contacts item", providerInputError).map(contactCreateBody);
}

function nonEmptyStringArray(value: unknown, fieldName: string) {
  const items = requiredStringArray(value, fieldName, providerInputError);
  if (items.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string array`);
  }
  return items;
}
