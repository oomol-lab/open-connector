import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const sendfoxApiBaseUrl = "https://api.sendfox.com";

type SendfoxRequestPhase = "validate" | "execute";
type SendfoxActionContext = { apiKey: string; fetcher: typeof fetch };
type SendfoxActionHandler = (input: Record<string, unknown>, context: SendfoxActionContext) => Promise<unknown>;

export const sendfoxActionHandlers: ProviderActionHandlers<"sendfox", SendfoxActionHandler> = {
  list_contacts(input, context) {
    return executeListContacts(input, context);
  },
  create_contact(input, context) {
    return executeCreateContact(input, context);
  },
  get_contact(input, context) {
    return sendfoxRequestJson(`/contacts/${readPositiveInteger(input.contact_id, "contact_id")}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
    });
  },
  update_contact(input, context) {
    const contactId = readPositiveInteger(input.contact_id, "contact_id");
    return sendfoxRequestJson(`/contacts/${contactId}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PATCH",
      body: compactObject({
        first_name: optionalRawString(input.first_name),
        last_name: optionalRawString(input.last_name),
        lists: input.lists,
        contact_fields: input.contact_fields,
      }),
    });
  },
  delete_contact(input, context) {
    return sendfoxRequestJson(`/contacts/${readPositiveInteger(input.contact_id, "contact_id")}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "DELETE",
    });
  },
  unsubscribe_contact(input, context) {
    return sendfoxRequestJson("/unsubscribe", {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PATCH",
      body: { email: input.email },
    });
  },
  list_contact_lists(input, context) {
    return executeListContactLists(input, context);
  },
  create_contact_list(input, context) {
    return sendfoxRequestJson("/lists", {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      body: { name: input.name },
    });
  },
  get_contact_list(input, context) {
    return sendfoxRequestJson(`/lists/${readPositiveInteger(input.list_id, "list_id")}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
    });
  },
  update_contact_list(input, context) {
    return sendfoxRequestJson(`/lists/${readPositiveInteger(input.list_id, "list_id")}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "PATCH",
      body: { name: input.name },
    });
  },
  delete_contact_list(input, context) {
    return sendfoxRequestJson(`/lists/${readPositiveInteger(input.list_id, "list_id")}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "DELETE",
    });
  },
  list_contacts_in_list(input, context) {
    return executeListContactsInList(input, context);
  },
  add_contact_to_list(input, context) {
    const listId = readPositiveInteger(input.list_id, "list_id");
    return sendfoxRequestJson(`/lists/${listId}/contacts`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "POST",
      body: { contact_id: input.contact_id },
    });
  },
  remove_contact_from_list(input, context) {
    const listId = readPositiveInteger(input.list_id, "list_id");
    const contactId = readPositiveInteger(input.contact_id, "contact_id");
    return sendfoxRequestJson(`/lists/${listId}/contacts/${contactId}`, {
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      method: "DELETE",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("sendfox", sendfoxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const payload = await sendfoxRequestJson("/me", {
      apiKey: input.apiKey,
      fetcher,
      phase: "validate",
    });
    const user = optionalRecord(payload);

    return {
      profile: {
        accountId: readOptionalIntegerString(user?.id) ?? "api_key",
        displayName: pickAccountLabel(user),
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: sendfoxApiBaseUrl,
        validationEndpoint: "/me",
        userId: user?.id,
        userEmail: optionalRawString(user?.email),
        contactsCount: optionalNumber(user?.contacts_count),
        contactLimit: optionalNumber(user?.contact_limit),
      }),
    };
  },
};

async function executeListContacts(input: Record<string, unknown>, context: SendfoxActionContext): Promise<unknown> {
  const payload = await sendfoxRequestJson("/contacts", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    query: compactObject({
      query: optionalRawString(input.query),
      page: optionalNumber(input.page),
      unsubscribed: optionalBoolean(input.unsubscribed),
      email: optionalRawString(input.email),
    }),
  });

  return normalizePaginatedPayload(payload, "contacts");
}

async function executeCreateContact(input: Record<string, unknown>, context: SendfoxActionContext): Promise<unknown> {
  return sendfoxRequestJson("/contacts", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    method: "POST",
    body: compactObject({
      email: input.email,
      first_name: optionalRawString(input.first_name),
      last_name: optionalRawString(input.last_name),
      ip_address: optionalRawString(input.ip_address),
      lists: input.lists,
      contact_fields: input.contact_fields,
    }),
  });
}

async function executeListContactLists(
  input: Record<string, unknown>,
  context: SendfoxActionContext,
): Promise<unknown> {
  const payload = await sendfoxRequestJson("/lists", {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    query: compactObject({
      query: optionalRawString(input.query),
      page: optionalNumber(input.page),
    }),
  });

  return normalizePaginatedPayload(payload, "lists");
}

async function executeListContactsInList(
  input: Record<string, unknown>,
  context: SendfoxActionContext,
): Promise<unknown> {
  const listId = readPositiveInteger(input.list_id, "list_id");
  const payload = await sendfoxRequestJson(`/lists/${listId}/contacts`, {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    query: compactObject({
      query: optionalRawString(input.query),
      page: optionalNumber(input.page),
    }),
  });

  return normalizePaginatedPayload(payload, "contacts");
}

async function sendfoxRequestJson(
  path: string,
  input: {
    apiKey: string;
    fetcher: typeof fetch;
    method?: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    phase?: SendfoxRequestPhase;
  },
): Promise<unknown> {
  const url = new URL(path, sendfoxApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: sendfoxHeaders(input.apiKey, input.body ? { "content-type": "application/json" } : {}),
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    payload = await readSendfoxPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `sendfox request failed: ${error.message}` : "sendfox request failed",
    );
  }

  if (!response.ok) {
    throw createSendfoxError(response, payload, input.phase ?? "execute");
  }

  return payload;
}

function sendfoxHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readSendfoxPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createSendfoxError(response: Response, payload: unknown, phase: SendfoxRequestPhase): ProviderRequestError {
  const message = extractSendfoxErrorMessage(payload) ?? response.statusText ?? "sendfox request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 404 || response.status === 400 || response.status === 409 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

function extractSendfoxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  const message = optionalRawString(object?.message);
  if (message) {
    return message;
  }

  const errors = optionalRecord(object?.errors);
  const firstError = errors ? Object.values(errors)[0] : undefined;
  if (Array.isArray(firstError)) {
    const firstMessage = firstError.find((item) => typeof item === "string");
    if (firstMessage) {
      return firstMessage;
    }
  }

  return undefined;
}

function normalizePaginatedPayload(payload: unknown, dataKey: "contacts" | "lists"): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object || !Array.isArray(object.data)) {
    return {
      [dataKey]: [],
      meta: {
        current_page: 1,
        total: 0,
        per_page: 0,
      },
    };
  }

  return {
    [dataKey]: object.data,
    meta: {
      current_page: readNumberOrDefault(object.current_page, 1),
      total: readNumberOrDefault(object.total, object.data.length),
      per_page: readNumberOrDefault(object.per_page, object.data.length),
    },
  };
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readNumberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function pickAccountLabel(user: Record<string, unknown> | undefined): string {
  return optionalRawString(user?.email) ?? optionalRawString(user?.name) ?? "SendFox Account";
}
