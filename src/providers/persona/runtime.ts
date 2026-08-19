import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { nullableString, optionalRecord, optionalString, stringArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const personaApiBaseUrl = "https://api.withpersona.com/api/v1";

const personaFilterParams: Record<string, string> = {
  inquiryId: "inquiry-id",
  accountId: "account-id",
  note: "note",
  referenceId: "reference-id",
  inquiryTemplateId: "inquiry-template-id",
  templateId: "template-id",
  status: "status",
  createdAtStart: "created-at-start",
  createdAtEnd: "created-at-end",
};

const personaAttributeParams: Record<string, string> = {
  inquiryTemplateId: "inquiry-template-id",
  referenceId: "reference-id",
  accountId: "account-id",
  note: "note",
  tags: "tags",
  fields: "fields",
};

type PersonaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const personaActionHandlers: ProviderActionHandlers<"persona", PersonaActionHandler> = {
  list_inquiries(input, context) {
    return listInquiries(input, context);
  },
  get_inquiry(input, context) {
    return getInquiry(input, context);
  },
  create_inquiry(input, context) {
    return createInquiry(input, context);
  },
  update_inquiry(input, context) {
    return updateInquiry(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("persona", personaActionHandlers);

export async function validatePersonaCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const response = await fetchPersona(fetcher, `${personaApiBaseUrl}/inquiries?page[size]=1`, {
    method: "GET",
    headers: personaHeaders(input.apiKey),
  });
  const payload = await readPersonaPayload(response);
  assertPersonaResponse(response, payload, "validate");
  const object = optionalRecord(payload) ?? {};

  return {
    profile: {
      accountId: "persona-api-key",
      displayName: "Persona API Key",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: personaApiBaseUrl,
      validationEndpoint: "/inquiries",
      inquiryCount: readArray(object.data).length,
    },
  };
}

async function listInquiries(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL("/api/v1/inquiries", personaApiBaseUrl);
  appendPagination(url, optionalRecord(input.page));
  appendFilter(url, optionalRecord(input.filter));
  appendSerialization(url, input, "fields");

  const payload = await personaRequest(url, context);
  const object = optionalRecord(payload) ?? {};
  const links = optionalRecord(object.links) ?? {};

  return {
    inquiries: readArray(object.data).map(normalizePersonaInquiry),
    links: {
      prev: nullableString(links.prev) ?? null,
      next: nullableString(links.next) ?? null,
    },
    included: readArray(object.included),
    raw: object,
  };
}

async function getInquiry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const inquiryId = readStringInput(input, "inquiryId");
  const url = new URL(`/api/v1/inquiries/${encodeURIComponent(inquiryId)}`, personaApiBaseUrl);
  appendSerialization(url, input, "fields");

  const payload = await personaRequest(url, context);
  return normalizeSingleInquiryResponse(payload);
}

async function createInquiry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const url = new URL("/api/v1/inquiries", personaApiBaseUrl);
  appendSerialization(url, input, "fieldsToSerialize");
  const payload = await personaRequest(url, context, {
    method: "POST",
    headers: idempotencyHeader(input),
    body: JSON.stringify({ data: buildInquiryPayload(input, true) }),
  });

  return normalizeSingleInquiryResponse(payload);
}

async function updateInquiry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const inquiryId = readStringInput(input, "inquiryId");
  const url = new URL(`/api/v1/inquiries/${encodeURIComponent(inquiryId)}`, personaApiBaseUrl);
  appendSerialization(url, input, "fieldsToSerialize");
  const payload = await personaRequest(url, context, {
    method: "PATCH",
    headers: idempotencyHeader(input),
    body: JSON.stringify({ data: buildInquiryPayload(input, false) }),
  });

  return normalizeSingleInquiryResponse(payload);
}

async function personaRequest(url: URL, context: ApiKeyProviderContext, init: RequestInit = {}): Promise<unknown> {
  const response = await fetchPersona(context.fetcher, url.toString(), {
    method: init.method ?? "GET",
    ...init,
    headers: personaHeaders(context.apiKey, init.headers),
  });
  const payload = await readPersonaPayload(response);
  assertPersonaResponse(response, payload, "execute");
  return payload;
}

function personaHeaders(apiKey: string, extraHeaders?: HeadersInit): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    ...(extraHeaders as Record<string, string> | undefined),
  };
}

function appendPagination(url: URL, page: Record<string, unknown> | undefined): void {
  if (!page) {
    return;
  }

  for (const key of ["after", "before", "size"]) {
    const value = page[key];
    if (value !== undefined) {
      url.searchParams.set(`page[${key}]`, String(value));
    }
  }
}

function appendFilter(url: URL, filter: Record<string, unknown> | undefined): void {
  if (!filter) {
    return;
  }

  if (filter.note !== undefined) {
    const conflictingFilter = Object.keys(personaFilterParams).find(
      (key) => key !== "note" && filter[key] !== undefined,
    );
    if (conflictingFilter) {
      throw new ProviderRequestError(400, "persona filter.note must be the only inquiry filter");
    }
  }

  for (const [inputKey, queryKey] of Object.entries(personaFilterParams)) {
    const value = filter[inputKey];
    if (value !== undefined) {
      url.searchParams.set(`filter[${queryKey}]`, String(value));
    }
  }
}

function appendSerialization(url: URL, input: Record<string, unknown>, fieldsKey: string): void {
  const include = optionalString(input.include);
  if (include) {
    url.searchParams.set("include", include);
  }

  const fields = optionalRecord(input[fieldsKey]);
  if (!fields) {
    return;
  }

  for (const [resourceType, value] of Object.entries(fields)) {
    if (value !== undefined) {
      url.searchParams.set(`fields[${resourceType}]`, String(value));
    }
  }
}

function buildInquiryPayload(input: Record<string, unknown>, requireTemplate: boolean): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const [inputKey, attributeKey] of Object.entries(personaAttributeParams)) {
    const value = input[inputKey];
    if (value !== undefined) {
      attributes[attributeKey] = value;
    }
  }

  if (requireTemplate && !attributes["inquiry-template-id"]) {
    throw new ProviderRequestError(400, "inquiryTemplateId is required");
  }

  const payload: Record<string, unknown> = {
    type: "inquiry",
    attributes,
  };
  const relationships = optionalRecord(input.relationships);
  if (relationships) {
    payload.relationships = relationships;
  }

  return payload;
}

function idempotencyHeader(input: Record<string, unknown>): Record<string, string> | undefined {
  const idempotencyKey = optionalString(input.idempotencyKey);
  return idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined;
}

function normalizeSingleInquiryResponse(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};
  return {
    inquiry: normalizePersonaInquiry(object.data),
    included: readArray(object.included),
    raw: object,
  };
}

function normalizePersonaInquiry(value: unknown): Record<string, unknown> {
  const raw = optionalRecord(value) ?? {};
  const attributes = optionalRecord(raw.attributes) ?? {};
  const relationships = optionalRecord(raw.relationships) ?? {};

  return {
    id: optionalString(raw.id),
    type: optionalString(raw.type),
    attributes: {
      status: optionalString(attributes.status) ?? "",
      referenceId: nullableString(attributes["reference-id"]) ?? null,
      note: nullableString(attributes.note) ?? null,
      tags: stringArray(readArray(attributes.tags), "tags", (message) => new ProviderRequestError(502, message)),
      createdAt: nullableString(attributes["created-at"]) ?? null,
      updatedAt: nullableString(attributes["updated-at"]) ?? null,
      completedAt: nullableString(attributes["completed-at"]) ?? null,
      decisionedAt: nullableString(attributes["decisioned-at"]) ?? null,
      fields: optionalRecord(attributes.fields) ?? {},
    },
    relationships,
    raw,
  };
}

async function readPersonaPayload(response: Response): Promise<unknown> {
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

async function fetchPersona(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `persona request failed: ${message}`);
  }
}

function assertPersonaResponse(response: Response, payload: unknown, phase: "validate" | "execute"): void {
  if (response.ok) {
    return;
  }

  const message = extractPersonaMessage(payload) ?? response.statusText ?? "persona request failed";
  if (response.status === 429) {
    throw new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message, payload);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractPersonaMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const object = optionalRecord(payload);
  const errors = Array.isArray(object?.errors) ? object.errors : [];
  const firstError = optionalRecord(errors[0]);
  return (
    optionalString(firstError?.detail) ??
    optionalString(firstError?.details) ??
    optionalString(firstError?.title) ??
    optionalString(object?.message) ??
    optionalString(object?.error)
  );
}

function readStringInput(input: Record<string, unknown>, key: string): string {
  const text = optionalString(input[key]);
  if (!text) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return text;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
