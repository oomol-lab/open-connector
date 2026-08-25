import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface MonicaCrmCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const monicaCrmApiBaseUrl = "https://app.monicahq.com/api";

interface MonicaCrmActionContext {
  apiKey: string;
  fetcher: typeof fetch;
}

type MonicaCrmActionHandler = (input: Record<string, unknown>, context: MonicaCrmActionContext) => Promise<unknown>;

export const monicaCrmActionHandlers: ProviderActionHandlers<"monica_crm", MonicaCrmActionHandler> = {
  list_contacts(input, context) {
    return requestMonicaCrmJson(
      {
        method: "GET",
        path: "/contacts",
        apiKey: context.apiKey,
        query: compactObject({
          page: input.page,
          limit: input.limit,
          query: input.query,
          sort: input.sort,
        }),
      },
      context.fetcher,
      "execute",
    );
  },
  get_contact(input, context) {
    return requestMonicaCrmJson(
      {
        method: "GET",
        path: `/contacts/${input.contactId}`,
        apiKey: context.apiKey,
      },
      context.fetcher,
      "execute",
    );
  },
  list_notes(input, context) {
    const path = input.contactId === undefined ? "/notes" : `/contacts/${input.contactId}/notes`;
    return requestMonicaCrmJson(
      {
        method: "GET",
        path,
        apiKey: context.apiKey,
        query: compactObject({ page: input.page, limit: input.limit }),
      },
      context.fetcher,
      "execute",
    );
  },
  get_note(input, context) {
    return requestMonicaCrmJson(
      {
        method: "GET",
        path: `/notes/${input.noteId}`,
        apiKey: context.apiKey,
      },
      context.fetcher,
      "execute",
    );
  },
  create_note(input, context) {
    return requestMonicaCrmJson(
      {
        method: "POST",
        path: "/notes",
        apiKey: context.apiKey,
        body: {
          body: input.body,
          contact_id: input.contactId,
          is_favorited: input.isFavorited ? 1 : 0,
        },
      },
      context.fetcher,
      "execute",
    );
  },
  update_note(input, context) {
    return requestMonicaCrmJson(
      {
        method: "PUT",
        path: `/notes/${input.noteId}`,
        apiKey: context.apiKey,
        body: {
          body: input.body,
          contact_id: input.contactId,
          is_favorited: input.isFavorited ? 1 : 0,
        },
      },
      context.fetcher,
      "execute",
    );
  },
  delete_note(input, context) {
    return requestMonicaCrmJson(
      {
        method: "DELETE",
        path: `/notes/${input.noteId}`,
        apiKey: context.apiKey,
      },
      context.fetcher,
      "execute",
    );
  },
};

export async function validateMonicaCrmCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<MonicaCrmCredentialCheck> {
  const payload = await requestMonicaCrmJson(
    { method: "GET", path: "/me", apiKey: requiredString(input.apiKey, "apiKey") },
    fetcher,
    "validate",
  );
  const user = readEnvelopeData(payload, "Monica returned an invalid user response");
  const id = readNumber(user.id, "Monica returned an invalid user ID");
  const displayName = [readOptionalString(user.first_name), readOptionalString(user.last_name)]
    .filter(Boolean)
    .join(" ");
  return {
    providerAccountId: String(id),
    accountLabel: displayName || readOptionalString(user.email) || "Monica CRM Account",
    providerScopes: [],
    providerMetadata: { apiBaseUrl: monicaCrmApiBaseUrl, validationEndpoint: "/me" },
  };
}

interface MonicaCrmRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  apiKey: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

async function requestMonicaCrmJson(input: MonicaCrmRequest, fetcher: typeof fetch, phase: "validate" | "execute") {
  const url = new URL(`${monicaCrmApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetcher(url, {
    method: input.method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      ...(input.body ? { "content-type": "application/json" } : {}),
      "user-agent": providerUserAgent,
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw createMonicaCrmError(response, payload, phase);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Monica returned an invalid JSON response");
  }
  return payload as Record<string, unknown>;
}

async function readResponsePayload(response: Response) {
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

function createMonicaCrmError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const message = readMonicaCrmErrorMessage(payload) ?? `Monica request failed (${response.status})`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status, message);
}

function readMonicaCrmErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return typeof payload === "string" && payload ? payload : undefined;
  }
  const object = payload as Record<string, unknown>;
  const message = readOptionalString(object.message);
  if (message) return message;

  const error = object.error;
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return undefined;
  }
  return readOptionalString((error as Record<string, unknown>).message);
}

function readEnvelopeData(payload: Record<string, unknown>, message: string) {
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ProviderRequestError(502, message);
  }
  return data as Record<string, unknown>;
}

function readNumber(value: unknown, message: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
