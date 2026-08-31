import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

export const gleapApiBaseUrl = "https://api.gleap.io/v3";

type GleapRequestPhase = "validate" | "execute";
type GleapHttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface GleapActionContext {
  apiKey: string;
  projectId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface GleapRequestInput {
  method: GleapHttpMethod;
  path: string;
  context: GleapActionContext;
  phase: GleapRequestPhase;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

type GleapActionHandler = (input: Record<string, unknown>, context: GleapActionContext) => Promise<unknown>;

export const gleapActionHandlers: ProviderActionHandlers<"gleap", GleapActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_contacts(_input, context) {
    return listContacts(context);
  },
  get_contact_by_user_id(input, context) {
    return getContactByUserId(input, context);
  },
  create_contact(input, context) {
    return createContact(input, context);
  },
  update_contact(input, context) {
    return updateContact(input, context);
  },
  list_tickets(input, context) {
    return listTickets(input, context);
  },
  get_ticket(input, context) {
    return getTicket(input, context);
  },
  create_ticket(input, context) {
    return createTicket(input, context);
  },
  create_ticket_with_message(input, context) {
    return createTicketWithMessage(input, context);
  },
  update_ticket(input, context) {
    return updateTicket(input, context);
  },
  delete_ticket(input, context) {
    return deleteTicket(input, context);
  },
};

export async function validateGleapCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredInputString(input.apiKey, "apiKey");
  const projectId = requiredInputString(input.values.projectId, "projectId");
  const context = { apiKey, projectId, fetcher, signal };
  const userPayload = await requestGleapJson({
    method: "GET",
    path: "/users/me",
    context,
    phase: "validate",
  });
  const user = readObject(userPayload, "Gleap returned invalid current user payload");
  const countPayload = await requestGleapJson({
    method: "GET",
    path: "/tickets/ticketscount",
    context,
    phase: "validate",
  });
  const countObject = optionalRecord(countPayload);
  const count = optionalNumber(countObject?.count) ?? optionalNumber(countPayload);
  const userId = readProviderAccountId(user);

  return {
    profile: {
      accountId: userId ?? projectId,
      displayName: readUserLabel(user) ?? "Gleap API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: gleapApiBaseUrl,
      projectId,
      validationEndpoint: "/tickets/ticketscount",
      userEmail: optionalString(user.email),
      userId,
      ticketCount: count,
    }),
  };
}

export function resolveGleapProjectId(values: Record<string, unknown>, metadata: Record<string, unknown>): string {
  return (
    optionalString(metadata.projectId) ??
    optionalString(values.projectId) ??
    (() => {
      throw new ProviderRequestError(400, "gleap projectId is required");
    })()
  );
}

async function getCurrentUser(context: GleapActionContext): Promise<unknown> {
  const payload = await requestGleapJson({
    method: "GET",
    path: "/users/me",
    context,
    phase: "execute",
  });
  const user = readObject(payload, "Gleap returned invalid current user payload");
  return { user, raw: payload };
}

async function listContacts(context: GleapActionContext): Promise<unknown> {
  const payload = await requestGleapJson({
    method: "GET",
    path: "/sessions",
    context,
    phase: "execute",
  });
  const contacts = readArray(payload, "Gleap returned invalid contacts payload");
  return { contacts, raw: payload };
}

async function getContactByUserId(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const userId = requiredInputString(input.userId, "userId");
  const payload = await requestGleapJson({
    method: "GET",
    path: `/sessions/by-user-id/${encodeURIComponent(userId)}`,
    context,
    phase: "execute",
  });
  const contact = readObject(payload, "Gleap returned invalid contact payload");
  return { contact, raw: payload };
}

async function createContact(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  if (!optionalString(input.userId) && !optionalString(input.email)) {
    throw new ProviderRequestError(400, "userId or email is required");
  }
  const payload = await requestGleapJson({
    method: "POST",
    path: "/sessions",
    context,
    phase: "execute",
    body: pickBody(input, [
      "userId",
      "email",
      "name",
      "phone",
      "avatar",
      "companyId",
      "companyName",
      "plan",
      "value",
      "tags",
      "blocked",
      "unsubscribed",
      "customData",
      "eventData",
    ]),
  });
  const contact = readObject(payload, "Gleap returned invalid created contact payload");
  return { contact, raw: payload };
}

async function updateContact(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const sessionId = requiredInputString(input.sessionId, "sessionId");
  const body = pickBody(input, [
    "userId",
    "email",
    "name",
    "phone",
    "avatar",
    "companyId",
    "companyName",
    "plan",
    "value",
    "tags",
    "blocked",
    "unsubscribed",
    "customData",
    "eventData",
  ]);
  requireBodyFields(body, "at least one contact field is required");
  const payload = await requestGleapJson({
    method: "PUT",
    path: `/sessions/${encodeURIComponent(sessionId)}`,
    context,
    phase: "execute",
    body,
  });
  const contact = readObject(payload, "Gleap returned invalid updated contact payload");
  return { contact, raw: payload };
}

async function listTickets(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const payload = await requestGleapJson({
    method: "GET",
    path: "/tickets",
    context,
    phase: "execute",
    query: buildListTicketsQuery(input),
  });
  const object = readObject(payload, "Gleap returned invalid tickets payload");
  const tickets = readArray(object.tickets, "Gleap returned invalid tickets list");
  return {
    tickets,
    count: optionalNumber(object.count) ?? null,
    totalCount: optionalNumber(object.totalCount) ?? null,
    raw: payload,
  };
}

async function getTicket(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const ticketId = requiredInputString(input.ticketId, "ticketId");
  const payload = await requestGleapJson({
    method: "GET",
    path: `/tickets/${encodeURIComponent(ticketId)}`,
    context,
    phase: "execute",
  });
  const ticket = readObject(payload, "Gleap returned invalid ticket payload");
  return { ticket, raw: payload };
}

async function createTicket(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const payload = await requestGleapJson({
    method: "POST",
    path: "/tickets",
    context,
    phase: "execute",
    body: pickBody(input, [
      "title",
      "type",
      "status",
      "priority",
      "description",
      "plainContent",
      "session",
      "processingUser",
      "processingTeam",
      "tags",
      "formData",
      "customData",
      "attributes",
      "attachments",
      "archived",
      "isSpam",
      "preventAutoReply",
    ]),
  });
  const ticket = readObject(payload, "Gleap returned invalid created ticket payload");
  return { ticket, raw: payload };
}

async function createTicketWithMessage(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const payload = await requestGleapJson({
    method: "POST",
    path: "/tickets/compose",
    context,
    phase: "execute",
    body: pickBody(input, [
      "type",
      "title",
      "message",
      "priority",
      "status",
      "processingUser",
      "processingTeam",
      "tags",
      "session",
      "email",
      "formData",
      "preventAutoReply",
    ]),
  });
  const ticket = readObject(payload, "Gleap returned invalid composed ticket payload");
  return { ticket, raw: payload };
}

async function updateTicket(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const ticketId = requiredInputString(input.ticketId, "ticketId");
  const body = pickBody(input, [
    "title",
    "type",
    "status",
    "priority",
    "description",
    "plainContent",
    "session",
    "processingUser",
    "processingTeam",
    "tags",
    "formData",
    "customData",
    "attributes",
    "attachments",
    "archived",
    "isSpam",
    "preventAutoReply",
    "forceCloseOverride",
  ]);
  requireBodyFields(body, "at least one ticket field is required");
  const payload = await requestGleapJson({
    method: "PUT",
    path: `/tickets/${encodeURIComponent(ticketId)}`,
    context,
    phase: "execute",
    body,
  });
  const ticket = readObject(payload, "Gleap returned invalid updated ticket payload");
  return { ticket, raw: payload };
}

async function deleteTicket(input: Record<string, unknown>, context: GleapActionContext): Promise<unknown> {
  const ticketId = requiredInputString(input.ticketId, "ticketId");
  const payload = await requestGleapJson({
    method: "DELETE",
    path: `/tickets/${encodeURIComponent(ticketId)}`,
    context,
    phase: "execute",
  });
  return { deleted: true, raw: payload };
}

async function requestGleapJson(input: GleapRequestInput): Promise<unknown> {
  const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(path, `${gleapApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryParam(url, key, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: gleapHeaders(input.context, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gleap request failed: ${error.message}` : "Gleap request failed",
    );
  }

  if (response.status === 204) {
    return {};
  }

  if (response.ok) {
    return readJson(response, false);
  }

  const error = await readGleapError(response);
  if (response.status === 401) {
    throw new ProviderRequestError(input.phase === "validate" ? 400 : 401, error.message);
  }
  if (
    response.status === 400 ||
    response.status === 403 ||
    response.status === 404 ||
    response.status === 409 ||
    response.status === 422
  ) {
    throw new ProviderRequestError(400, error.message);
  }
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }

  throw new ProviderRequestError(response.status || 502, error.message);
}

function gleapHeaders(context: GleapActionContext, hasBody: boolean): HeadersInit {
  return {
    accept: "application/json",
    authorization: `Bearer ${context.apiKey}`,
    Project: context.projectId,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

function appendQueryParam(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  url.searchParams.set(key, String(value));
}

function buildListTicketsQuery(input: Record<string, unknown>): Record<string, unknown> {
  const filters = optionalRecord(input.filters) ?? {};
  const namedFields = compactObject({
    type: input.type,
    status: input.status,
    priority: input.priority,
    archived: input.archived,
    ignoreArchived: input.ignoreArchived,
    isSpam: input.isSpam,
    sort: input.sort,
    limit: input.limit,
    skip: input.skip,
  });
  return {
    ...filters,
    ...namedFields,
  };
}

function pickBody(input: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      body[field] = input[field];
    }
  }
  return body;
}

async function readJson(response: Response, tolerateInvalidJson: boolean): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (tolerateInvalidJson) {
      return {};
    }
    throw new ProviderRequestError(502, "Gleap returned invalid JSON");
  }
}

async function readGleapError(response: Response): Promise<{ message: string }> {
  const payload = await readJson(response, true);
  const object = optionalRecord(payload);
  const error = optionalRecord(object?.error);
  const message =
    optionalString(object?.message) ??
    optionalString(object?.error) ??
    optionalString(error?.message) ??
    optionalString(error?.error) ??
    `Gleap request failed with HTTP ${response.status}`;
  return { message };
}

function readProviderAccountId(user: Record<string, unknown>): string | undefined {
  return optionalString(user.id) ?? optionalString(user.email) ?? optionalString(user._id);
}

function readUserLabel(user: Record<string, unknown>): string | undefined {
  const email = optionalString(user.email);
  const firstName = optionalString(user.firstName);
  const lastName = optionalString(user.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || email;
}

function readObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function readArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}

function requireBodyFields(body: Record<string, unknown>, message: string): void {
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, message);
  }
}
