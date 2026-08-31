import { compactObject, optionalRecord, optionalString, requiredRecord, requiredStringArray } from "../../core/cast.ts";
import {
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export const nimbleApiBaseUrl = "https://app.nimble.com/api/v1";

export interface NimbleContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface NimbleRequest {
  method?: "GET" | "POST" | "PUT";
  path: string;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}

type NimbleHandler = (input: Record<string, unknown>, context: NimbleContext) => Promise<unknown>;

export const nimbleActionHandlers: Record<string, NimbleHandler> = {
  async list_contacts(input, context) {
    const query = new URLSearchParams();
    setQuery(query, "keyword", optionalString(input.keyword));
    setQuery(query, "fields", joinStrings(input.fields));
    setQuery(query, "record_type", input.recordType);
    setQuery(query, "page", input.page);
    setQuery(query, "per_page", input.perPage);
    setQuery(query, "tags", input.includeTags);
    const payload = requireResponseObject(await requestNimble(context, { path: "/contacts", query }));
    return {
      contacts: Array.isArray(payload.resources) ? payload.resources : [],
      pagination: requireResponseObject(payload.meta),
    };
  },
  async get_contact(input, context) {
    const query = new URLSearchParams();
    setQuery(query, "fields", joinStrings(input.fields));
    setQuery(query, "tags", input.includeTags);
    const contactId = encodeURIComponent(requiredInputString(input.contactId, "contactId"));
    const payload = requireResponseObject(await requestNimble(context, { path: `/contact/${contactId}`, query }));
    const resources = Array.isArray(payload.resources) ? payload.resources : [];
    return { contact: requireResponseObject(resources[0] ?? payload) };
  },
  async create_contact(input, context) {
    return mutateContact(input, context, "POST");
  },
  async update_contact(input, context) {
    return mutateContact(input, context, "PUT");
  },
};

export async function validateNimbleCredential(context: NimbleContext): Promise<Record<string, unknown>> {
  return requireResponseObject(await requestNimble(context, { path: "/myself" }));
}

async function mutateContact(
  input: Record<string, unknown>,
  context: NimbleContext,
  method: "POST" | "PUT",
): Promise<{ contact: Record<string, unknown> }> {
  const isUpdate = method === "PUT";
  const path = isUpdate
    ? `/contact/${encodeURIComponent(requiredInputString(input.contactId, "contactId"))}`
    : "/contact";
  const query = new URLSearchParams();
  if (isUpdate && input.replaceFields !== undefined) {
    query.set("type", input.replaceFields ? "1" : "0");
  }
  const body = compactObject({
    fields: input.fields,
    owner_id: input.ownerId,
    avatar_url: input.avatarUrl,
    is_important: input.isImportant,
  });
  if (isUpdate && body.fields === undefined && body.avatar_url === undefined && body.is_important === undefined) {
    throw new ProviderRequestError(400, "update_contact requires fields, avatarUrl, or isImportant");
  }
  if (body.fields !== undefined) {
    const fields = requiredRecord(body.fields, "fields", providerInputError);
    if (Object.keys(fields).length === 0) throw new ProviderRequestError(400, "fields requires at least one field");
  }
  const payload = requireResponseObject(await requestNimble(context, { method, path, query, body }));
  const resources = Array.isArray(payload.resources) ? payload.resources : [];
  return { contact: requireResponseObject(resources[0] ?? payload) };
}

async function requestNimble(context: NimbleContext, request: NimbleRequest): Promise<unknown> {
  const url = new URL(`${nimbleApiBaseUrl}${request.path}`);
  if (request.query) url.search = request.query.toString();
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        ...(request.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      `Nimble request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }
  const payload = await readPayload(response);
  if (!response.ok) throw mapNimbleError(response.status, readErrorMessage(payload), payload);
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Nimble returned malformed JSON");
    return { message: text };
  }
}

function mapNimbleError(status: number, message: string, payload: unknown): ProviderRequestError {
  if (status === 401) return new ProviderRequestError(401, message, payload);
  if (status === 402 || status === 429) return new ProviderRequestError(429, message, payload);
  if (400 <= status && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(502, message, payload);
}

function readErrorMessage(payload: unknown): string {
  const data = optionalRecord(payload);
  return optionalString(data?.message) ?? optionalString(data?.error) ?? "Nimble request failed";
}

function joinStrings(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return requiredStringArray(value, "fields", providerInputError)
    .map((field) => field.trim())
    .join(",");
}

function setQuery(query: URLSearchParams, name: string, value: unknown): void {
  if (value !== undefined) query.set(name, String(value));
}

function requireResponseObject(value: unknown): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, "Nimble returned invalid object data");
  return object;
}
