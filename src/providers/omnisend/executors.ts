import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "omnisend";
const omnisendApiBaseUrl = "https://api.omnisend.com/api";
const omnisendApiVersion = "2026-03-15";
const omnisendValidationPath = "/contacts";

const contactBodyKeys = [
  "address",
  "birthdate",
  "city",
  "country",
  "countryCode",
  "createdAt",
  "customProperties",
  "firstName",
  "gender",
  "identifiers",
  "lastName",
  "postalCode",
  "state",
  "tags",
];

type OmnisendRequestMode = "validate" | "execute";
type OmnisendJsonObject = Record<string, unknown>;
type OmnisendActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface OmnisendRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: OmnisendRequestMode;
  method?: string;
  query?: Record<string, boolean | number | string | undefined>;
  body?: unknown;
}

export const omnisendActionHandlers: ProviderActionHandlers<"omnisend", OmnisendActionHandler> = {
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  upsert_contact(input, context) {
    return upsertContact(input, context);
  },
  update_contact_by_id(input, context) {
    return updateContactById(input, context);
  },
  update_contact_by_email(input, context) {
    return updateContactByEmail(input, context);
  },
  add_tags(input, context) {
    return addTags(input, context);
  },
  remove_tags(input, context) {
    return removeTags(input, context);
  },
  list_segments(input, context) {
    return listSegments(input, context);
  },
  get_segment(input, context) {
    return getSegment(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, omnisendActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestOmnisendJson({
      apiKey: input.apiKey,
      path: omnisendValidationPath,
      query: { limit: 1 },
      fetcher,
      signal,
      mode: "validate",
    });

    const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
    const firstContact = optionalRecord(contacts[0]);
    const paging = optionalRecord(payload.paging);

    return {
      profile: {
        accountId: "omnisend",
        displayName: "Omnisend API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: omnisendApiBaseUrl,
        apiVersion: omnisendApiVersion,
        validationEndpoint: omnisendValidationPath,
        firstContactID: optionalString(firstContact?.id),
        hasMoreContacts: optionalBoolean(paging?.hasMore),
      }),
    };
  },
};

async function listContacts(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<OmnisendJsonObject> {
  validateListContactsInput(input);
  return requestOmnisendJson({
    apiKey: context.apiKey,
    path: "/contacts",
    query: compactObject({
      limit: optionalNumber(input.limit),
      after: optionalString(input.after),
      before: optionalString(input.before),
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
      email: optionalString(input.email),
      phone: optionalString(input.phone),
      status: optionalString(input.status),
      segmentID: optionalString(input.segmentID),
      tag: optionalString(input.tag),
      updatedAtFrom: optionalString(input.updatedAtFrom),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function getContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<OmnisendJsonObject> {
  return requestOmnisendJson({
    apiKey: context.apiKey,
    path: `/contacts/${encodeURIComponent(requiredInputString(input.contactID, "contactID"))}`,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function upsertContact(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<OmnisendJsonObject> {
  return requestOmnisendJson({
    apiKey: context.apiKey,
    path: "/contacts",
    method: "POST",
    body: buildContactBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function updateContactById(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<OmnisendJsonObject> {
  requireAtLeastOneContactBodyField(input);
  return requestOmnisendJson({
    apiKey: context.apiKey,
    path: `/contacts/${encodeURIComponent(requiredInputString(input.contactID, "contactID"))}`,
    method: "PATCH",
    body: buildContactBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function updateContactByEmail(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<OmnisendJsonObject> {
  requireAtLeastOneContactBodyField(input);
  return requestOmnisendJson({
    apiKey: context.apiKey,
    path: "/contacts",
    query: {
      email: requiredInputString(input.email, "email"),
    },
    method: "PATCH",
    body: buildContactBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function addTags(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, boolean>> {
  await requestOmnisendNoContent({
    apiKey: context.apiKey,
    path: "/contacts/tags",
    method: "POST",
    body: buildTagBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return { success: true };
}

async function removeTags(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, boolean>> {
  await requestOmnisendNoContent({
    apiKey: context.apiKey,
    path: "/contacts/tags",
    method: "DELETE",
    body: buildTagBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return { success: true };
}

async function listSegments(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<OmnisendJsonObject> {
  validateCursorInput(input);
  return requestOmnisendJson({
    apiKey: context.apiKey,
    path: "/segments",
    query: compactObject({
      limit: optionalNumber(input.limit),
      after: optionalString(input.after),
      before: optionalString(input.before),
      sort: optionalString(input.sort),
      direction: optionalString(input.direction),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

async function getSegment(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<OmnisendJsonObject> {
  return requestOmnisendJson({
    apiKey: context.apiKey,
    path: `/segments/${encodeURIComponent(requiredInputString(input.segmentID, "segmentID"))}`,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

function buildContactBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of contactBodyKeys) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  return body;
}

function buildTagBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    contactIDs: input.contactIDs,
    tags: input.tags,
  };
}

async function requestOmnisendJson(input: OmnisendRequestOptions): Promise<OmnisendJsonObject> {
  const response = await omnisendFetch(input);
  const raw = await readResponseBody(response);
  const payload = raw.trim() === "" ? {} : parseOmnisendBody(raw);

  if (!response.ok) {
    throw toOmnisendError(response, payload, input.mode);
  }

  const output = optionalRecord(payload);
  if (!output) {
    throw new ProviderRequestError(502, "Omnisend returned a non-object JSON payload", payload);
  }
  if (raw.trim() === "") {
    throw new ProviderRequestError(502, "Omnisend returned an empty response body", payload);
  }

  return output;
}

async function requestOmnisendNoContent(input: OmnisendRequestOptions): Promise<Response> {
  const response = await omnisendFetch(input);
  const raw = await readResponseBody(response);
  const payload = raw.trim() === "" ? {} : parseOmnisendBody(raw);

  if (!response.ok) {
    throw toOmnisendError(response, payload, input.mode);
  }

  return response;
}

async function omnisendFetch(input: OmnisendRequestOptions): Promise<Response> {
  const url = new URL(
    input.path.startsWith("/") ? `${omnisendApiBaseUrl}${input.path}` : `${omnisendApiBaseUrl}/${input.path}`,
  );
  const method = input.method ?? "GET";
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.fetcher(url, {
      method,
      headers: omnisendHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Omnisend request failed for ${method} ${url.toString()}: ${message}`);
  }
}

function omnisendHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Omnisend-API-Key ${apiKey}`,
    "omnisend-version": omnisendApiVersion,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read Omnisend response body: ${error.message}`
        : "Failed to read Omnisend response body",
    );
  }
}

function parseOmnisendBody(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Omnisend returned invalid JSON");
  }
}

function toOmnisendError(response: Response, payload: unknown, mode: OmnisendRequestMode): ProviderRequestError {
  const message = extractOmnisendErrorMessage(payload) ?? `Omnisend request failed with ${response.status}`;

  if ((response.status === 401 || response.status === 403) && mode === "validate") {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function extractOmnisendErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const detail = optionalString(object.detail);
  if (detail) {
    return detail;
  }

  const title = optionalString(object.title);
  if (title) {
    return title;
  }

  const message = optionalString(object.message);
  if (message) {
    return message;
  }

  if (Array.isArray(object.errors)) {
    for (const item of object.errors) {
      const error = optionalRecord(item);
      const errorMessage = optionalString(error?.message);
      if (errorMessage) {
        return errorMessage;
      }
    }
  }

  const errors = optionalRecord(object.errors);
  if (!errors) {
    return undefined;
  }

  for (const value of Object.values(errors)) {
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "string" && first) {
        return first;
      }
      const firstObject = optionalRecord(first);
      const firstMessage = optionalString(firstObject?.message);
      if (firstMessage) {
        return firstMessage;
      }
    }
  }

  return undefined;
}

function validateListContactsInput(input: Record<string, unknown>): void {
  validateCursorInput(input);
  if (input.tag !== undefined && input.status !== undefined) {
    throw new ProviderRequestError(400, "tag and status cannot be used together");
  }
  if (
    input.updatedAtFrom !== undefined &&
    ["email", "phone", "status", "segmentID", "tag"].some((key) => input[key] !== undefined)
  ) {
    throw new ProviderRequestError(
      400,
      "updatedAtFrom cannot be combined with email, phone, status, segmentID, or tag",
    );
  }
}

function validateCursorInput(input: Record<string, unknown>): void {
  if (input.after !== undefined && input.before !== undefined) {
    throw new ProviderRequestError(400, "after and before cannot be used together");
  }
}

function requireAtLeastOneContactBodyField(input: Record<string, unknown>): void {
  if (!contactBodyKeys.some((key) => input[key] !== undefined)) {
    throw new ProviderRequestError(400, "at least one contact field is required");
  }
}
