import type { CredentialValidationResult, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { SupportbeeActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { compactJson, encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

type SupportbeeRequestPhase = "validate" | "execute";

interface SupportbeeActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type SupportbeeActionHandler = ProviderRuntimeHandler<SupportbeeActionContext>;

const service = "supportbee";
const validationPath = "/users";

export const supportbeeActionHandlers: Record<SupportbeeActionName, SupportbeeActionHandler> = {
  list_tickets(input, context) {
    return listSupportbeeTickets(input, context, "/tickets");
  },
  search_tickets(input, context) {
    return listSupportbeeTickets(input, context, "/tickets/search");
  },
  async get_ticket(input, context) {
    const payload = await supportbeeGetJson(context, `/tickets/${encodePathSegment(input.id)}`);
    const raw = payloadObject(payload);
    return {
      ticket: normalizeSupportbeeTicket(readObjectProperty(raw, "ticket") ?? raw),
      raw,
    };
  },
  async create_ticket(input, context) {
    const payload = await supportbeeJsonRequest(context, {
      method: "POST",
      path: "/tickets",
      body: {
        ticket: buildTicketCreateBody(input),
      },
    });
    const raw = payloadObject(payload);
    return {
      ticket: normalizeSupportbeeTicket(readObjectProperty(raw, "ticket") ?? raw),
      raw,
    };
  },
  async list_ticket_replies(input, context) {
    const payload = await supportbeeGetJson(context, `/tickets/${encodePathSegment(input.ticket_id)}/replies`);
    const raw = payloadObject(payload);
    return {
      replies: readObjectArray(raw, "replies").map(normalizeSupportbeeReply),
      raw,
    };
  },
  async get_ticket_reply(input, context) {
    const payload = await supportbeeGetJson(
      context,
      `/tickets/${encodePathSegment(input.ticket_id)}/replies/${encodePathSegment(input.reply_id)}`,
    );
    const raw = payloadObject(payload);
    return {
      reply: normalizeSupportbeeReply(readObjectProperty(raw, "reply") ?? raw),
      raw,
    };
  },
  async create_ticket_reply(input, context) {
    const payload = await supportbeeJsonRequest(context, {
      method: "POST",
      path: `/tickets/${encodePathSegment(input.ticket_id)}/replies`,
      body: {
        reply: buildReplyCreateBody(input),
      },
    });
    const raw = payloadObject(payload);
    return {
      reply: normalizeSupportbeeReply(readObjectProperty(raw, "reply") ?? raw),
      raw,
    };
  },
  async list_ticket_comments(input, context) {
    const payload = await supportbeeGetJson(context, `/tickets/${encodePathSegment(input.ticket_id)}/comments`);
    const raw = payloadObject(payload);
    return {
      comments: readObjectArray(raw, "comments").map(normalizeSupportbeeComment),
      raw,
    };
  },
  async create_ticket_comment(input, context) {
    const payload = await supportbeeJsonRequest(context, {
      method: "POST",
      path: `/tickets/${encodePathSegment(input.ticket_id)}/comments`,
      body: {
        comment: buildCommentCreateBody(input),
      },
    });
    const raw = payloadObject(payload);
    return {
      comment: normalizeSupportbeeComment(readObjectProperty(raw, "comment") ?? raw),
      raw,
    };
  },
  async list_labels(_input, context) {
    const payload = await supportbeeGetJson(context, "/labels");
    const raw = payloadObject(payload);
    return {
      labels: readLooseArray(raw.labels).map(normalizeSupportbeeLabel),
      raw,
    };
  },
  async add_label_to_ticket(input, context) {
    const payload = await supportbeeJsonRequest(context, {
      method: "POST",
      path: `/tickets/${encodePathSegment(input.ticket_id)}/labels/${encodePathSegment(input.label_name)}`,
    });
    const raw = payloadObject(payload);
    return {
      label: normalizeSupportbeeLabel(readObjectProperty(raw, "label") ?? raw),
      raw,
    };
  },
  async remove_label_from_ticket(input, context) {
    await supportbeeJsonRequest(context, {
      method: "DELETE",
      path: `/tickets/${encodePathSegment(input.ticket_id)}/labels/${encodePathSegment(input.label_name)}`,
    });
    return { ok: true };
  },
  async list_users(input, context) {
    const payload = await supportbeeGetJson(context, "/users", {
      with_invited: optionalBoolean(input.with_invited),
      with_roles: readOptionalStringArray(input.with_roles)?.join(","),
      type: optionalString(input.type),
    });
    const raw = payloadObject(payload);
    return {
      users: readObjectArray(raw, "users").map(normalizeSupportbeeUser),
      raw,
    };
  },
  async get_user(input, context) {
    const payload = await supportbeeGetJson(context, `/users/${encodePathSegment(input.id)}`, {
      max_tickets: readMaxTickets(input.max_tickets),
    });
    const raw = payloadObject(payload);
    return {
      user: normalizeSupportbeeUser(readObjectProperty(raw, "user") ?? raw),
      raw,
    };
  },
  async create_user(input, context) {
    const payload = await supportbeeJsonRequest(context, {
      method: "POST",
      path: "/users",
      body: buildUserWriteBody(input),
    });
    const raw = payloadObject(payload);
    return {
      user: normalizeSupportbeeUser(readObjectProperty(raw, "user") ?? raw),
      raw,
    };
  },
  async update_user(input, context) {
    const payload = await supportbeeJsonRequest(context, {
      method: "PUT",
      path: `/users/${encodePathSegment(input.id)}`,
      body: buildUserWriteBody(input),
    });
    const raw = payloadObject(payload);
    return {
      user: normalizeSupportbeeUser(readObjectProperty(raw, "user") ?? raw),
      raw,
    };
  },
  async list_teams(input, context) {
    const payload = await supportbeeGetJson(context, "/teams", {
      with_users: optionalBoolean(input.with_users),
      user: optionalString(input.user),
    });
    const raw = payloadObject(payload);
    return {
      teams: readObjectArray(raw, "teams").map(normalizeSupportbeeTeam),
      raw,
    };
  },
};

export const supportbeeExecutors: ProviderExecutors = defineProviderExecutors<SupportbeeActionContext>({
  service,
  handlers: supportbeeActionHandlers,
  async createContext(context, fetcher): Promise<SupportbeeActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createSupportbeeContext(credential.apiKey, credential.values, context, fetcher);
  },
});

export async function validateSupportbeeCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const company = readSupportbeeCompany(input.values.company);
  const baseUrl = buildSupportbeeBaseUrl(company);

  await supportbeeGetJson({ apiKey: input.apiKey, baseUrl, fetcher, signal }, validationPath, {}, "validate");

  return {
    profile: {
      accountId: `supportbee:${company}`,
      displayName: `SupportBee ${company}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: baseUrl,
      baseUrl,
      company,
      validationEndpoint: validationPath,
    },
  };
}

function createSupportbeeContext(
  apiKey: string,
  values: Record<string, string>,
  context: ExecutionContext,
  fetcher: ProviderFetch,
): SupportbeeActionContext {
  return {
    apiKey,
    baseUrl: buildSupportbeeBaseUrl(readSupportbeeCompany(values.company)),
    fetcher,
    signal: context.signal,
  };
}

async function listSupportbeeTickets(
  input: Record<string, unknown>,
  context: SupportbeeActionContext,
  path: string,
): Promise<Record<string, unknown>> {
  const payload = await supportbeeGetJson(context, path, {
    query: optionalString(input.query),
    per_page: optionalInteger(input.per_page),
    page: optionalInteger(input.page),
    archived: optionalString(input.archived),
    spam: optionalBoolean(input.spam),
    trash: optionalBoolean(input.trash),
    replies: optionalBoolean(input.replies),
    max_replies: optionalInteger(input.max_replies),
    assigned_user: optionalString(input.assigned_user),
    assigned_team: optionalString(input.assigned_team),
    label: optionalString(input.label),
    since: optionalString(input.since),
    until: optionalString(input.until),
    sort_by: optionalString(input.sort_by),
    requester_emails: readOptionalStringArray(input.requester_emails)?.join(","),
    total_only: optionalBoolean(input.total_only),
  });
  const raw = payloadObject(payload);

  return {
    tickets: readObjectArray(raw, "tickets").map(normalizeSupportbeeTicket),
    current_page: readNullableInteger(raw.current_page),
    per_page: readNullableInteger(raw.per_page),
    total_pages: readNullableInteger(raw.total_pages),
    total: readNullableInteger(raw.total),
    raw,
  };
}

function buildTicketCreateBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    subject: optionalString(input.subject),
    requester_name: optionalString(input.requester_name),
    requester_email: optionalString(input.requester_email),
    cc: readOptionalStringArray(input.cc),
    bcc: readOptionalStringArray(input.bcc),
    notify_requester: optionalBoolean(input.notify_requester),
    content: buildContent(input, true),
    forwarding_address_id: optionalString(input.forwarding_address_id),
  });
}

function buildReplyCreateBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    on_behalf_of: readObjectProperty(input, "on_behalf_of") ?? undefined,
    cc: readOptionalStringArray(input.cc),
    bcc: readOptionalStringArray(input.bcc),
    content: buildContent(input, true),
  });
}

function buildCommentCreateBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    content: buildContent(input, false),
  };
}

function buildContent(input: Record<string, unknown>, includeAttachmentIds: boolean): Record<string, unknown> {
  const content = compactObject({
    text: optionalString(input.text),
    html: optionalString(input.html),
    attachment_ids: includeAttachmentIds ? readOptionalIntegerArray(input.attachment_ids) : undefined,
  });

  if (!content.text && !content.html) {
    throw new ProviderRequestError(400, "supportbee content requires text or html");
  }

  return content;
}

function buildUserWriteBody(input: Record<string, unknown>): Record<string, unknown> {
  const name = optionalString(input.name);
  if (!name) {
    throw new ProviderRequestError(400, "supportbee user name is required");
  }

  const type = optionalString(input.type) ?? "user";
  const email = optionalString(input.email);
  if (type !== "customer_group" && !email) {
    throw new ProviderRequestError(400, "supportbee user email is required unless type is customer_group");
  }

  return {
    user: compactJson({
      email,
      name,
      role: optionalInteger(input.role),
      team_ids: readOptionalIntegerArray(input.team_ids),
      type: optionalString(input.type),
      can_members_access_group_tickets:
        input.can_members_access_group_tickets === null
          ? null
          : optionalBoolean(input.can_members_access_group_tickets),
      email_domains: readOptionalStringArray(input.email_domains),
    }),
  };
}

async function supportbeeGetJson(
  context: SupportbeeActionContext,
  path: string,
  query: Record<string, unknown> = {},
  phase: SupportbeeRequestPhase = "execute",
): Promise<unknown> {
  return supportbeeJsonRequest(context, {
    method: "GET",
    path,
    query,
    phase,
  });
}

async function supportbeeJsonRequest(
  context: SupportbeeActionContext,
  input: {
    method: string;
    path: string;
    query?: Record<string, unknown>;
    body?: unknown;
    phase?: SupportbeeRequestPhase;
  },
): Promise<unknown> {
  const url = new URL(input.path, context.baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers: supportbeeHeaders(context.apiKey, input.body !== undefined),
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: context.signal,
    });
    payload = await readSupportbeePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `supportbee request failed: ${error.message}` : "supportbee request failed",
    );
  }

  if (!response.ok) {
    throw mapSupportbeeError(response, payload, input.phase ?? "execute");
  }

  return payload;
}

function supportbeeHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...(hasJsonBody ? { "content-type": "application/json" } : {}),
  };
}

async function readSupportbeePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "supportbee returned malformed JSON");
    }
    return { message: text };
  }
}

function mapSupportbeeError(response: Response, payload: unknown, phase: SupportbeeRequestPhase): ProviderRequestError {
  const message =
    readSupportbeeErrorMessage(payload) ??
    response.statusText ??
    `supportbee request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readSupportbeeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "errors"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const first = Object.values(value as Record<string, unknown>)
        .flat()
        .find((item) => typeof item === "string");
      if (typeof first === "string") {
        return first;
      }
    }
  }
  return undefined;
}

function normalizeSupportbeeTicket(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(value.id),
    subject: readNullableString(value.subject),
    replies_count: readNullableInteger(value.replies_count),
    comments_count: readNullableInteger(value.comments_count),
    created_at: readNullableString(value.created_at),
    last_activity_at: readNullableString(value.last_activity_at),
    unanswered: readNullableBoolean(value.unanswered),
    archived: readNullableBoolean(value.archived),
    spam: readNullableBoolean(value.spam),
    labels: readLabelNames(value.labels),
    requester: readObjectProperty(value, "requester"),
    content: readObjectProperty(value, "content"),
    raw: value,
  };
}

function normalizeSupportbeeReply(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(value.id),
    created_at: readNullableString(value.created_at),
    summary: readNullableString(value.summary),
    cc: readStringArray(value.cc),
    bcc: readStringArray(value.bcc),
    replier: readObjectProperty(value, "replier"),
    content: readObjectProperty(value, "content"),
    raw: value,
  };
}

function normalizeSupportbeeComment(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(value.id),
    created_at: readNullableString(value.created_at),
    commenter: readObjectProperty(value, "commenter"),
    content: readObjectProperty(value, "content"),
    raw: value,
  };
}

function normalizeSupportbeeUser(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(value.id),
    type: readNullableString(value.type),
    email: readNullableString(value.email),
    name: readNullableString(value.name),
    role: readNullableString(value.role),
    agent: readNullableBoolean(value.agent),
    teams: readObjectArray(value, "teams"),
    raw: value,
  };
}

function normalizeSupportbeeTeam(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: readNullableInteger(value.id),
    name: readNullableString(value.name),
    users: readObjectArray(value, "users"),
    raw: value,
  };
}

function normalizeSupportbeeLabel(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return {
      id: null,
      label: value,
      ticket: null,
      raw: { label: value },
    };
  }

  const raw = optionalRecord(value) ?? {};
  return {
    id: readNullableInteger(raw.id),
    label: readNullableString(raw.label),
    ticket: readNullableInteger(raw.ticket),
    raw,
  };
}

export function readSupportbeeCompany(value: unknown): string {
  const company = requiredString(value, "supportbee company", providerInputError).toLowerCase();
  if (company.startsWith("-") || company.endsWith("-")) {
    throw new ProviderRequestError(400, "supportbee company must be a single subdomain label");
  }
  for (const char of company) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (!isDigit && !isLowercaseLetter && char !== "-") {
      throw new ProviderRequestError(400, "supportbee company must be a single subdomain label");
    }
  }
  return company;
}

export function buildSupportbeeBaseUrl(company: string): string {
  return `https://${company}.supportbee.com`;
}

function payloadObject(payload: unknown): Record<string, unknown> {
  return optionalRecord(payload) ?? {};
}

function readObjectProperty(value: unknown, key: string): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return optionalRecord(record[key]) ?? null;
}

function readObjectArray(value: Record<string, unknown>, key: string): Array<Record<string, unknown>> {
  return readLooseArray(value[key]).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function readLooseArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return readLooseArray(value).filter((item): item is string => typeof item === "string");
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  const values = readStringArray(value);
  return values.length > 0 ? values : undefined;
}

function readOptionalIntegerArray(value: unknown): number[] | undefined {
  const values = readLooseArray(value)
    .map((item) => optionalInteger(item))
    .filter((item): item is number => item !== undefined);
  return values.length > 0 ? values : undefined;
}

function readMaxTickets(value: unknown): number | false | undefined {
  if (value === false) {
    return false;
  }
  return optionalInteger(value);
}

function readLabelNames(value: unknown): string[] {
  return readLooseArray(value)
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      const record = optionalRecord(item);
      return record ? readNullableString(record.name) : null;
    })
    .filter((item): item is string => Boolean(item));
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
