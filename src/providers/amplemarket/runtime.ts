import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const amplemarketApiBaseUrl = "https://api.amplemarket.com";

interface AmplemarketContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AmplemarketActionHandler = (input: Record<string, unknown>, context: AmplemarketContext) => Promise<unknown>;

export const amplemarketActionHandlers: Record<string, AmplemarketActionHandler> = {
  get_account_details(_input, context) {
    return requestAmplemarket({ path: "/account-info" }, context).then((account) => ({ account }));
  },
  get_contact(input, context) {
    return requestAmplemarket(
      { path: `/contacts/${encodeURIComponent(String(input.id))}` },
      context,
    ).then((contact) => ({ contact }));
  },
  get_contact_by_email(input, context) {
    return requestAmplemarket(
      { path: `/contacts/email/${encodeURIComponent(String(input.email))}` },
      context,
    ).then((contact) => ({ contact }));
  },
  async list_contacts(input, context) {
    const payload = await requestAmplemarket(
      {
        path: "/contacts",
        query: buildRepeatedQuery("ids[]", input.ids),
      },
      context,
    );
    const record = optionalRecord(payload);
    return {
      contacts: record
        ? Array.isArray(record.contacts)
          ? record.contacts
          : Array.isArray(record.data)
            ? record.data
            : []
        : Array.isArray(payload)
          ? payload
          : [],
    };
  },
  list_lead_lists(input, context) {
    return requestAmplemarket(
      {
        path: "/lead-lists",
        query: buildCursorQuery(input, {
          status: "status",
          owner_id: "owner_id",
          owner_email: "owner_email",
        }),
      },
      context,
    ).then((payload) => normalizePaginatedResponse(payload, "lead_lists"));
  },
  get_lead_list(input, context) {
    return requestAmplemarket(
      { path: `/lead-lists/${encodeURIComponent(String(input.id))}` },
      context,
    ).then((leadList) => ({ lead_list: unwrapNamedObject(leadList, "lead_list") }));
  },
  list_tasks(input, context) {
    return requestAmplemarket(
      {
        path: "/tasks",
        query: buildCursorQuery(input, {
          status: "status",
          type: "type",
          user_id: "user_id",
          user_email: "user_email",
        }),
      },
      context,
    ).then((payload) => normalizePaginatedResponse(payload, "tasks"));
  },
  complete_task(input, context) {
    return requestAmplemarket(
      {
        path: `/tasks/${encodeURIComponent(String(input.id))}/complete`,
        method: "PATCH",
      },
      context,
    ).then((task) => ({ task: unwrapNamedObject(task, "task") }));
  },
  skip_task(input, context) {
    return requestAmplemarket(
      {
        path: `/tasks/${encodeURIComponent(String(input.id))}/skip`,
        method: "PATCH",
      },
      context,
    ).then((task) => ({ task: unwrapNamedObject(task, "task") }));
  },
  list_task_statuses(_input, context) {
    return requestAmplemarket({ path: "/tasks/statuses" }, context);
  },
  list_task_types(_input, context) {
    return requestAmplemarket({ path: "/tasks/types" }, context);
  },
};

export async function validateAmplemarketCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = {
    apiKey: requireInputString(input.apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const account = requiredRecord(
    await requestAmplemarket({ path: "/account-info", mode: "validate" }, context),
    "account",
    () => new ProviderRequestError(502, "Amplemarket account response must be an object"),
  );
  const accountId = optionalString(account.id);
  const accountName = optionalString(account.name);

  return {
    profile: {
      accountId: accountId ?? "amplemarket_api_key",
      displayName: accountName ?? accountId ?? "Amplemarket API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: amplemarketApiBaseUrl,
      validationEndpoint: "/account-info",
      accountId,
      accountName,
    }),
  };
}

function buildCursorQuery(input: Record<string, unknown>, fields: Record<string, string>) {
  const query = new URLSearchParams();
  if (input.page_size !== undefined) {
    query.set("page[size]", String(input.page_size));
  }
  if (input.page_after !== undefined) {
    query.set("page[after]", String(input.page_after));
  }
  if (input.page_before !== undefined) {
    query.set("page[before]", String(input.page_before));
  }
  for (const [inputKey, queryKey] of Object.entries(fields)) {
    if (input[inputKey] !== undefined) {
      query.set(queryKey, String(input[inputKey]));
    }
  }
  return query;
}

function buildRepeatedQuery(name: string, values: unknown) {
  const query = new URLSearchParams();
  if (Array.isArray(values)) {
    for (const value of values) {
      query.append(name, String(value));
    }
  }
  return query;
}

function normalizePaginatedResponse(payload: unknown, collectionKey: "lead_lists" | "tasks") {
  const record = requireRecord(payload, "Amplemarket paginated response");
  const links = optionalRecord(record._links) ?? {};
  return {
    [collectionKey]: Array.isArray(record[collectionKey]) ? record[collectionKey] : [],
    _links: links,
    nextCursor: readCursorFromLink(links.next),
    previousCursor: readCursorFromLink(links.prev),
  };
}

function unwrapNamedObject(payload: unknown, key: string) {
  const record = requireRecord(payload, "Amplemarket response");
  return optionalRecord(record[key]) ?? record;
}

function readCursorFromLink(link: unknown) {
  const href = optionalString(optionalRecord(link)?.href);
  if (!href) {
    return null;
  }

  const url = new URL(href, amplemarketApiBaseUrl);
  return url.searchParams.get("page[after]") ?? url.searchParams.get("page[before]");
}

async function requestAmplemarket(
  input: {
    path: string;
    query?: URLSearchParams;
    method?: "GET" | "PATCH";
    mode?: "validate" | "execute";
  },
  context: AmplemarketContext,
) {
  const url = new URL(input.path, amplemarketApiBaseUrl);
  for (const [key, value] of input.query ?? new URLSearchParams()) {
    url.searchParams.append(key, value);
  }

  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: amplemarketHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Amplemarket request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  }

  const payload = await readAmplemarketJson(response);
  if (!response.ok) {
    throw mapAmplemarketError(response.status, payload, input.mode ?? "execute");
  }

  return payload;
}

function amplemarketHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readAmplemarketJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Amplemarket returned malformed JSON");
    }
    return { message: text };
  }
}

function mapAmplemarketError(status: number, payload: unknown, mode: "validate" | "execute") {
  const message = readAmplemarketErrorMessage(payload) ?? `Amplemarket request failed with ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : status, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500 && mode === "execute") {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function readAmplemarketErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  if (Array.isArray(record._errors)) {
    const firstError = optionalRecord(record._errors[0]);
    return (
      optionalString(firstError?.detail) ??
      optionalString(firstError?.title) ??
      optionalString(firstError?.code)
    );
  }
  return undefined;
}

function requireInputString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, providerInputError);
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function requireRecord(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }

  return value as Record<string, unknown>;
}
