import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { HelpdeskActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface HelpdeskCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

export const helpdeskApiBaseUrl = "https://api.helpdesk.com";
const helpdeskValidationEndpoint = "/v1/licenses";

type HelpdeskRequestPhase = "validate" | "execute";
type HelpdeskActionInput = ApiKeyProviderActionInput & {
  actionName: HelpdeskActionName;
  input: Record<string, unknown>;
};
type HelpdeskActionHandler = (input: HelpdeskActionInput, fetcher: typeof fetch) => Promise<unknown>;

export const helpdeskActionHandlers: ProviderActionHandlers<"helpdesk", HelpdeskActionHandler> = {
  list_tickets(input, fetcher) {
    return listTickets(input, fetcher);
  },
  get_ticket(input, fetcher) {
    return getTicket(input, fetcher);
  },
  create_ticket(input, fetcher) {
    return createTicket(input, fetcher);
  },
  update_ticket(input, fetcher) {
    return updateTicket(input, fetcher);
  },
  delete_ticket(input, fetcher) {
    return deleteTicket(input, fetcher);
  },
  move_ticket_to_silo(input, fetcher) {
    return moveTicketToSilo(input, fetcher);
  },
  list_agents(input, fetcher) {
    return listAgents(input, fetcher);
  },
  list_teams(input, fetcher) {
    return listTeams(input, fetcher);
  },
};

export async function validateHelpdeskCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<HelpdeskCredentialCheck> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const accountId = requireHelpdeskAccountId(input);
  const { payload } = await requestHelpdesk({
    path: helpdeskValidationEndpoint,
    method: "GET",
    apiKey,
    accountId,
    phase: "validate",
    fetcher,
  });
  const licenses = requireObjectArray(payload, "HelpDesk licenses response");
  const license = licenses.find((item) => String(item.ID) === accountId) ?? licenses[0];
  const settings = optionalRecord(license?.settings);
  const companyName = readTrimmedString(settings?.companyName);

  return {
    providerAccountId: accountId,
    accountLabel: companyName ?? `HelpDesk account ${accountId}`,
    providerScopes: [],
    providerMetadata: compactObject({
      accountId,
      companyName,
      apiBaseUrl: helpdeskApiBaseUrl,
      validationEndpoint: helpdeskValidationEndpoint,
    }),
  };
}

export async function executeHelpdeskAction(input: HelpdeskActionInput, fetcher: typeof fetch): Promise<unknown> {
  return helpdeskActionHandlers[input.actionName](input, fetcher);
}

async function listTickets(input: HelpdeskActionInput, fetcher: typeof fetch) {
  if (input.input.next && input.input.prev) {
    throw new ProviderRequestError(400, "list_tickets accepts either next or prev, not both.");
  }
  const sortBy = readTrimmedString(input.input.sortBy) ?? "createdAt";
  const { payload, response } = await requestHelpdesk({
    path: "/v1/tickets",
    method: "GET",
    query: buildTicketListQuery(input.input),
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  const tickets = requireObjectArray(payload, "HelpDesk tickets response");

  return {
    tickets,
    totalPages: readIntegerHeader(response.headers, "x-total-pages"),
    totalResults: readIntegerHeader(response.headers, "x-total-results"),
    nextCursor: createTicketCursor(tickets.at(-1), sortBy),
    prevCursor: createTicketCursor(tickets[0], sortBy),
  };
}

async function getTicket(input: HelpdeskActionInput, fetcher: typeof fetch) {
  const ticketId = requireInputString(input.input.ticketId, "ticketId");
  const { payload } = await requestHelpdesk({
    path: `/v1/tickets/${encodeURIComponent(ticketId)}`,
    method: "GET",
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  return {
    ticket: requireObject(payload, "HelpDesk ticket response"),
  };
}

async function createTicket(input: HelpdeskActionInput, fetcher: typeof fetch) {
  const { payload } = await requestHelpdesk({
    path: "/v1/tickets",
    method: "POST",
    body: buildTicketBody(input.input),
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  return {
    ticket: requireObject(payload, "HelpDesk ticket response"),
  };
}

async function updateTicket(input: HelpdeskActionInput, fetcher: typeof fetch) {
  const ticketId = requireInputString(input.input.ticketId, "ticketId");
  const { ticketId: _ticketId, ...updateInput } = input.input;
  if (Object.keys(updateInput).length === 0) {
    throw new ProviderRequestError(400, "update_ticket requires at least one field to update.");
  }
  const { payload } = await requestHelpdesk({
    path: `/v1/tickets/${encodeURIComponent(ticketId)}`,
    method: "PATCH",
    body: buildTicketBody(updateInput),
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  return {
    ticket: requireObject(payload, "HelpDesk ticket response"),
  };
}

async function deleteTicket(input: HelpdeskActionInput, fetcher: typeof fetch) {
  const ticketId = requireInputString(input.input.ticketId, "ticketId");
  const { payload } = await requestHelpdesk({
    path: `/v1/tickets/${encodeURIComponent(ticketId)}`,
    method: "DELETE",
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  requireOkAcknowledgement(payload);
  return { ok: true };
}

async function moveTicketToSilo(input: HelpdeskActionInput, fetcher: typeof fetch) {
  const ticketId = requireInputString(input.input.ticketId, "ticketId");
  const silo = requireInputString(input.input.silo, "silo");
  const { payload } = await requestHelpdesk({
    path: `/v1/tickets/${encodeURIComponent(ticketId)}/silo`,
    method: "PUT",
    body: { silo },
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  requireOkAcknowledgement(payload);
  return { ok: true };
}

async function listAgents(input: HelpdeskActionInput, fetcher: typeof fetch) {
  const { payload } = await requestHelpdesk({
    path: "/v1/agents",
    method: "GET",
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  return {
    agents: requireObjectArray(payload, "HelpDesk agents response"),
  };
}

async function listTeams(input: HelpdeskActionInput, fetcher: typeof fetch) {
  const { payload } = await requestHelpdesk({
    path: "/v1/teams",
    method: "GET",
    ...readActionCredential(input),
    phase: "execute",
    fetcher,
  });
  return {
    teams: requireObjectArray(payload, "HelpDesk teams response"),
  };
}

function buildTicketListQuery(input: Record<string, unknown>) {
  const query = new URLSearchParams();
  setQueryValue(query, "status", input.status);
  setQueryValue(query, "silo", input.silo);
  setQueryValue(query, "spam", input.spam);
  setQueryValue(query, "subject", input.subject);
  setQueryValue(query, "query", input.query);
  setQueryValue(query, "shortID", input.shortId);
  setQueryArray(query, "teamIDs[]", input.teamIds);
  setQueryArray(query, "tagIDs[]", input.tagIds);
  setQueryValue(
    query,
    "hasAssignee",
    typeof input.hasAssignee === "boolean" ? (input.hasAssignee ? "Y" : "N") : undefined,
  );
  setQueryValue(query, "priority", input.priority);
  setQueryValue(query, "createdDateFrom", input.createdDateFrom);
  setQueryValue(query, "createdDateTo", input.createdDateTo);
  setQueryValue(query, "updatedDateFrom", input.updatedDateFrom);
  setQueryValue(query, "updatedDateTo", input.updatedDateTo);
  setQueryValue(query, "pageSize", input.pageSize);
  setQueryValue(query, "order", input.order);
  setQueryValue(query, "sortBy", input.sortBy);
  setCursorQuery(query, "next", input.next);
  setCursorQuery(query, "prev", input.prev);
  return query;
}

function setQueryValue(query: URLSearchParams, name: string, value: unknown) {
  if (typeof value === "string" && value.trim()) {
    query.set(name, value.trim());
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    query.set(name, String(value));
  }
}

function setQueryArray(query: URLSearchParams, name: string, value: unknown) {
  if (Array.isArray(value) && value.length > 0) {
    query.set(name, value.join(","));
  }
}

function setCursorQuery(query: URLSearchParams, name: "next" | "prev", value: unknown) {
  const cursor = optionalRecord(value);
  if (!cursor) {
    return;
  }
  setQueryValue(query, `${name}.value`, cursor.value);
  setQueryValue(query, `${name}.ID`, cursor.ID);
}

function buildTicketBody(input: Record<string, unknown>) {
  const message = optionalRecord(input.message);
  if (message && !readTrimmedString(message.text)) {
    throw new ProviderRequestError(400, "message text must not be blank.");
  }
  return compactObject({
    status: input.status,
    priority: input.priority,
    subject: readTrimmedString(input.subject),
    teamIDs: input.teamIds,
    requester: normalizeNamedPerson(input.requester),
    cc: Array.isArray(input.cc) ? input.cc.map(normalizeNamedPerson) : input.cc,
    tagIDs: input.tagIds,
    followers: input.followerIds,
    assignment: buildAssignment(input.assignment),
    message: message ? { ...message, text: readTrimmedString(message.text) } : input.message,
    isPrivate: input.isPrivate,
    customFields: input.customFields,
    author:
      typeof input.authorType === "string"
        ? {
            type: input.authorType,
          }
        : undefined,
  });
}

function normalizeNamedPerson(value: unknown): unknown {
  const person = optionalRecord(value);
  if (!person) return value;
  return {
    ...person,
    ...(typeof person.name === "string" ? { name: person.name.trim() } : {}),
  };
}

function buildAssignment(value: unknown) {
  const assignment = optionalRecord(value);
  if (!assignment) {
    return undefined;
  }
  const teamId = readTrimmedString(assignment.teamId);
  const agentId = readTrimmedString(assignment.agentId);
  if (!teamId && !agentId) {
    throw new ProviderRequestError(400, "assignment must include teamId or agentId.");
  }
  return compactObject({
    team: teamId
      ? {
          ID: teamId,
        }
      : undefined,
    agent: agentId
      ? {
          ID: agentId,
        }
      : undefined,
  });
}

function createTicketCursor(ticket: Record<string, unknown> | undefined, sortBy: string) {
  const ID = readTrimmedString(ticket?.ID);
  const value = readTrimmedString(ticket?.[sortBy]);
  return ID && value ? { value, ID } : null;
}

function readIntegerHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readActionCredential(input: ApiKeyProviderActionInput) {
  return {
    apiKey: input.apiKey,
    accountId: requireStoredHelpdeskAccountId(input.values),
  };
}

async function requestHelpdesk(input: {
  path: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  apiKey: string;
  accountId: string;
  phase: HelpdeskRequestPhase;
  fetcher: typeof fetch;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}) {
  const timeout = createProviderTimeout(undefined);
  const url = new URL(input.path, helpdeskApiBaseUrl);
  if (input.query) {
    url.search = input.query.toString();
  }

  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: helpdeskHeaders(input.accountId, input.apiKey, input.body !== undefined),
      signal: timeout.signal,
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    const payload = await readHelpdeskPayload(response);
    if (!response.ok) {
      throw createHelpdeskError(response.status, payload, input.phase);
    }
    return { response, payload };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "HelpDesk request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HelpDesk request failed: ${error.message}` : "HelpDesk request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function helpdeskHeaders(accountId: string, apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${accountId}:${apiKey}`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readHelpdeskPayload(response: Response) {
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

function createHelpdeskError(status: number, payload: unknown, phase: HelpdeskRequestPhase) {
  const message = readHelpdeskErrorMessage(payload) ?? `HelpDesk request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(409, message);
  }
  if (phase === "execute" && (status === 400 || status === 404 || status === 422)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function readHelpdeskErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = optionalRecord(record.error);
  return readTrimmedString(record.message) ?? readTrimmedString(record.error) ?? readTrimmedString(error?.message);
}

function requireHelpdeskAccountId(input: Record<string, unknown>) {
  const accountId = readTrimmedString(input.accountId);
  if (!accountId) {
    throw new ProviderRequestError(400, "accountId is required");
  }
  return accountId;
}

function requireStoredHelpdeskAccountId(values: Record<string, string> | undefined) {
  return requireHelpdeskAccountId(values ?? {});
}

function requireInputString(value: unknown, fieldName: string) {
  const text = readTrimmedString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readTrimmedString(value: unknown) {
  const text = optionalString(value)?.trim();
  return text || undefined;
}

function requireObject(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`);
  }
  return record;
}

function requireObjectArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be a JSON array`);
  }
  return value.map((item) => requireObject(item, `${label} item`));
}

function requireOkAcknowledgement(value: unknown) {
  if (typeof value !== "string" || value.trim() !== "OK") {
    throw new ProviderRequestError(502, "HelpDesk acknowledgement response must be OK");
  }
}
