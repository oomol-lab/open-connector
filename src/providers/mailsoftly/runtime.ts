import type { MailsoftlyActionName } from "./actions.ts";

import { optionalRecord, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface MailsoftlyCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const mailsoftlyApiBaseUrl = "https://app.mailsoftly.com/api/v3";

type MailsoftlyRequestDefinition = {
  method: "GET" | "POST";
  path: string;
  queryFields?: readonly string[];
};
type MailsoftlyRequestPhase = "validate" | "execute";

const mailsoftlyRequestByAction: Record<MailsoftlyActionName, MailsoftlyRequestDefinition> = {
  get_contacts: { method: "GET", path: "/get_contacts" },
  get_contact: {
    method: "GET",
    path: "/get_contact",
    queryFields: ["contact_id", "type"],
  },
  create_contact: { method: "POST", path: "/create_contact" },
  update_contact: { method: "POST", path: "/update_contact" },
  search_contacts: {
    method: "GET",
    path: "/search_contacts",
    queryFields: ["email", "first_name", "last_name"],
  },
  get_contact_lists: { method: "GET", path: "/get_contact_lists" },
  get_contact_list: {
    method: "GET",
    path: "/get_contact_list",
    queryFields: ["contact_list_id"],
  },
  get_contact_list_contacts: {
    method: "GET",
    path: "/get_contact_list_contacts",
    queryFields: ["contact_list_id"],
  },
  create_contact_list: { method: "POST", path: "/create_contact_list" },
  add_contact_to_contact_list: {
    method: "POST",
    path: "/add_contact_to_contact_list",
  },
  add_contacts_to_contact_list: {
    method: "POST",
    path: "/add_contacts_to_contact_list",
  },
};

export async function validateMailsoftlyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<MailsoftlyCredentialCheck> {
  const payload = await requestMailsoftly({
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    fetcher,
    method: "POST",
    path: "/authentication",
    phase: "validate",
  });
  const account = requireObject(payload, "mailsoftly authentication response");
  if (account.status !== "success") {
    throw new ProviderRequestError(502, "mailsoftly authentication status must be success");
  }
  const firmId = requireInteger(account.firm_id, "firm_id");
  const firmName = requireString(account.firm_name, "firm_name");

  return {
    providerAccountId: String(firmId),
    accountLabel: firmName,
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: mailsoftlyApiBaseUrl,
      validationEndpoint: "/authentication",
      firmId,
    },
  };
}

export function executeMailsoftlyAction(
  actionName: MailsoftlyActionName,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  if (typeof input.email === "string") input = { ...input, email: input.email.trim() };
  if (actionName === "add_contacts_to_contact_list" && Array.isArray(input.contacts)) {
    input = {
      ...input,
      contacts: input.contacts.map((value) => {
        const contact = optionalRecord(value);
        return contact && typeof contact.email === "string" ? { ...contact, email: contact.email.trim() } : value;
      }),
    };
  }
  const definition = mailsoftlyRequestByAction[actionName];
  const query = Object.fromEntries(
    (definition.queryFields ?? []).filter((field) => input[field] !== undefined).map((field) => [field, input[field]]),
  );

  return requestMailsoftly({
    apiKey,
    fetcher,
    method: definition.method,
    path: definition.path,
    phase: "execute",
    ...(definition.queryFields ? { query } : {}),
    ...(definition.method === "POST" ? { json: input } : {}),
  });
}

async function requestMailsoftly(input: {
  apiKey: string;
  fetcher: typeof fetch;
  method: "GET" | "POST";
  path: string;
  phase: MailsoftlyRequestPhase;
  query?: Record<string, unknown>;
  json?: Record<string, unknown>;
}) {
  const url = new URL(`${mailsoftlyApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: input.apiKey,
        ...(input.json ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(input.json ? { body: JSON.stringify(input.json) } : {}),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `mailsoftly request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(502, "mailsoftly returned malformed JSON");
    }
  }

  if (!response.ok) {
    throw mapMailsoftlyError(response.status, readErrorMessage(payload), input.phase);
  }
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).status === "error"
  ) {
    throw mapMailsoftlyError(response.status, readErrorMessage(payload), input.phase);
  }

  return payload;
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "mailsoftly request failed";
  }
  const object = payload as Record<string, unknown>;
  if (typeof object.error === "string") {
    return object.error;
  }
  if (typeof object.message === "string") {
    return object.message;
  }
  return "mailsoftly request failed";
}

function mapMailsoftlyError(status: number, message: string, phase: MailsoftlyRequestPhase) {
  if (status === 401 || status === 403) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function requireObject(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return value;
}

function requireInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value as number;
}
