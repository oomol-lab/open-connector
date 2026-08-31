import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

type PlunkActionContext = ApiKeyProviderContext;
type PlunkActionHandler = (input: Record<string, unknown>, context: PlunkActionContext) => Promise<unknown>;
type PlunkRequestMode = "validate" | "execute";

interface PlunkRequestInput {
  method: string;
  path: string;
  apiKey: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

export const plunkApiBaseUrl = "https://next-api.useplunk.com";

export const plunkActionHandlers: ProviderActionHandlers<"plunk", PlunkActionHandler> = {
  send_email(input, context) {
    return sendEmail(input, context);
  },
  track_event(input, context) {
    return trackEvent(input, context);
  },
  verify_email(input, context) {
    return verifyEmail(input, context);
  },
  create_contact(input, context) {
    return createContact(input, context);
  },
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  update_contact(input, context) {
    return updateContact(input, context);
  },
  delete_contact(input, context) {
    return deleteContact(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("plunk", plunkActionHandlers);

export async function validatePlunkCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPlunkJson(
    { method: "GET", path: "/contacts", apiKey, query: { limit: 1 } },
    fetcher,
    "validate",
  );
  const object = readObject(payload, "Plunk returned invalid contacts payload");
  const items = Array.isArray(object.data) ? object.data : [];
  const firstContactId = optionalString(optionalRecord(items[0])?.id);

  return {
    profile: {
      accountId: "plunk-api-key",
      displayName: "Plunk API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: plunkApiBaseUrl,
      validationEndpoint: "/contacts",
      contactCount: typeof object.total === "number" ? object.total : undefined,
      firstContactId,
    }),
  };
}

async function sendEmail(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  if (!input.template && (!input.subject || !input.body)) {
    throw new ProviderRequestError(400, "template or both subject and body are required");
  }

  const payload = await requestPlunkJson(
    {
      method: "POST",
      path: "/v1/send",
      apiKey: context.apiKey,
      body: compactObject({
        to: input.to,
        subject: input.subject,
        body: input.body,
        template: input.template,
        from: input.from,
        subscribed: input.subscribed,
        data: input.data,
        headers: input.headers,
        reply: input.reply,
      }),
    },
    context.fetcher,
    "execute",
  );
  const data = readObject(
    readEnvelopeData(payload, "Plunk returned invalid send email payload"),
    "Plunk returned invalid send email data",
  );
  return {
    emails: Array.isArray(data.emails) ? data.emails : [],
    timestamp: readRequiredProviderString(data.timestamp, "Plunk returned invalid send email timestamp"),
    raw: readObject(payload, "Plunk returned invalid send email payload"),
  };
}

async function trackEvent(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  const payload = await requestPlunkJson(
    {
      method: "POST",
      path: "/v1/track",
      apiKey: context.apiKey,
      body: compactObject({
        email: input.email,
        event: input.event,
        subscribed: input.subscribed,
        data: input.data,
      }),
    },
    context.fetcher,
    "execute",
  );
  const data = readObject(
    readEnvelopeData(payload, "Plunk returned invalid track event payload"),
    "Plunk returned invalid track event data",
  );
  return {
    contact: readRequiredProviderString(data.contact, "Plunk returned invalid track event contact"),
    event: readRequiredProviderString(data.event, "Plunk returned invalid track event id"),
    timestamp: readRequiredProviderString(data.timestamp, "Plunk returned invalid track event timestamp"),
    raw: readObject(payload, "Plunk returned invalid track event payload"),
  };
}

async function verifyEmail(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  const payload = await requestPlunkJson(
    {
      method: "POST",
      path: "/v1/verify",
      apiKey: context.apiKey,
      body: { email: input.email },
    },
    context.fetcher,
    "execute",
  );
  const data = readObject(
    readEnvelopeData(payload, "Plunk returned invalid verify email payload"),
    "Plunk returned invalid verify email data",
  );
  return {
    email: readRequiredProviderString(data.email, "Plunk returned invalid verify email result"),
    valid: data.valid === true,
    isDisposable: data.isDisposable === true,
    isAlias: data.isAlias === true,
    isTypo: data.isTypo === true,
    isPlusAddressed: data.isPlusAddressed === true,
    isPersonalEmail: data.isPersonalEmail === true,
    domainExists: data.domainExists === true,
    hasWebsite: data.hasWebsite === true,
    hasMxRecords: data.hasMxRecords === true,
    suggestedEmail: optionalString(data.suggestedEmail) ?? null,
    reasons: Array.isArray(data.reasons) ? data.reasons.map(String) : [],
    raw: readObject(payload, "Plunk returned invalid verify email payload"),
  };
}

async function createContact(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  const payload = await requestPlunkJson(
    {
      method: "POST",
      path: "/contacts",
      apiKey: context.apiKey,
      body: compactObject({
        email: input.email,
        subscribed: input.subscribed,
        data: input.data,
      }),
    },
    context.fetcher,
    "execute",
  );
  const contact = readObject(payload, "Plunk returned invalid contact payload");
  return { contact, raw: contact };
}

async function listContacts(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  const payload = await requestPlunkJson(
    {
      method: "GET",
      path: "/contacts",
      apiKey: context.apiKey,
      query: compactObject({
        limit: input.limit,
        cursor: input.cursor,
        search: input.search,
      }),
    },
    context.fetcher,
    "execute",
  );
  const object = readObject(payload, "Plunk returned invalid contacts payload");
  return {
    items: Array.isArray(object.data) ? object.data : [],
    cursor: optionalString(object.cursor) ?? null,
    hasMore: object.hasMore === true,
    total: typeof object.total === "number" ? object.total : 0,
    raw: object,
  };
}

async function getContact(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  const payload = await requestPlunkJson(
    {
      method: "GET",
      path: `/contacts/${encodeURIComponent(requiredInputString(input.contactId, "contactId"))}`,
      apiKey: context.apiKey,
    },
    context.fetcher,
    "execute",
  );
  const contact = readObject(payload, "Plunk returned invalid contact payload");
  return { contact, raw: contact };
}

async function updateContact(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  const payload = await requestPlunkJson(
    {
      method: "PATCH",
      path: `/contacts/${encodeURIComponent(requiredInputString(input.contactId, "contactId"))}`,
      apiKey: context.apiKey,
      body: compactObject({
        email: input.email,
        subscribed: input.subscribed,
        data: input.data,
      }),
    },
    context.fetcher,
    "execute",
  );
  const contact = readObject(payload, "Plunk returned invalid contact payload");
  return { contact, raw: contact };
}

async function deleteContact(input: Record<string, unknown>, context: PlunkActionContext): Promise<unknown> {
  await requestPlunkJson(
    {
      method: "DELETE",
      path: `/contacts/${encodeURIComponent(requiredInputString(input.contactId, "contactId"))}`,
      apiKey: context.apiKey,
    },
    context.fetcher,
    "execute",
  );
  return { deleted: true };
}

async function requestPlunkJson(
  input: PlunkRequestInput,
  fetcher: typeof fetch,
  mode: PlunkRequestMode,
): Promise<unknown> {
  const url = new URL(input.path, plunkApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method: input.method,
      headers: plunkHeaders(input.apiKey, input.body !== undefined),
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Plunk request failed: ${error.message}` : "Plunk request failed",
    );
  }

  if (response.status === 204) {
    return {};
  }
  if (response.ok) {
    return readJson(response, false);
  }

  const error = await readPlunkError(response);
  if (response.status === 401) {
    throw new ProviderRequestError(mode === "validate" ? 400 : 401, error.message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409 || response.status === 422) {
    throw new ProviderRequestError(400, error.message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, error.message);
}

function plunkHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readJson(response: Response, tolerateInvalidJson: boolean): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    if (tolerateInvalidJson) {
      return {};
    }
    throw new ProviderRequestError(502, "Plunk returned invalid JSON");
  }
}

async function readPlunkError(response: Response): Promise<{ message: string }> {
  const payload = await readJson(response, true);
  const object = optionalRecord(payload);
  const nestedError = optionalRecord(object?.error);
  const message =
    optionalString(nestedError?.message) ??
    optionalString(object?.message) ??
    optionalString(object?.error) ??
    `Plunk request failed with ${response.status}`;
  return { message };
}

function readEnvelopeData(value: unknown, message: string): unknown {
  const object = readObject(value, message);
  if (!object.data || typeof object.data !== "object" || Array.isArray(object.data)) {
    throw new ProviderRequestError(502, message, value);
  }
  return object.data;
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message, value);
  }
  return object;
}

function readRequiredProviderString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}
