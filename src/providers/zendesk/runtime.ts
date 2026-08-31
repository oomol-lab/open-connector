import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalBooleanOrNull,
  optionalInteger,
  optionalIntegerOrNull,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
  positiveInteger,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const zendeskCurrentUserPath = "/api/v2/users/me.json";

type ZendeskActionContext =
  | {
      authType: "oauth2";
      accessToken: string;
      baseUrl: string;
      subdomain: string;
      fetcher: ProviderFetch;
      signal?: AbortSignal;
    }
  | {
      authType: "api_key";
      apiKey: string;
      email: string;
      baseUrl: string;
      subdomain: string;
      fetcher: ProviderFetch;
      signal?: AbortSignal;
    };

type ZendeskActionHandler = ProviderRuntimeHandler<ZendeskActionContext>;

interface ZendeskListPayload {
  count?: unknown;
  next_page?: unknown;
  previous_page?: unknown;
  meta?: unknown;
  links?: unknown;
  [key: string]: unknown;
}

export const zendeskActionHandlers: ProviderActionHandlers<"zendesk", ZendeskActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestZendeskJson<{ user?: unknown }>({
      context,
      path: zendeskCurrentUserPath,
      phase: "execute",
    });
    return { user: normalizeZendeskUser(payload.user, "user") };
  },
  async list_tickets(input, context) {
    const payload = await requestZendeskJson<ZendeskListPayload>({
      context,
      path: "/api/v2/tickets.json",
      phase: "execute",
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        "page[size]": optionalInteger(input.pageSize),
        "page[after]": optionalString(input.pageAfter),
        "page[before]": optionalString(input.pageBefore),
        external_id: optionalString(input.externalId),
        sort_by: optionalString(input.sortBy),
        sort_order: optionalString(input.sortOrder),
      }),
    });
    return { tickets: normalizeZendeskTicketArray(payload.tickets), pagination: normalizeZendeskPagination(payload) };
  },
  async get_ticket(input, context) {
    const ticketId = requirePositiveInteger(input.ticketId, "ticketId");
    const [ticketPayload, commentsPayload] = await Promise.all([
      requestZendeskJson<{ ticket?: unknown }>({
        context,
        path: `/api/v2/tickets/${ticketId}.json`,
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
      requestZendeskJson<{ comments?: unknown }>({
        context,
        path: `/api/v2/tickets/${ticketId}/comments.json`,
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    ]);
    return {
      ticket: normalizeZendeskTicket(ticketPayload.ticket, "ticket"),
      comments: normalizeZendeskCommentArray(commentsPayload.comments),
    };
  },
  async create_ticket(input, context) {
    const payload = await requestZendeskJson<{ ticket?: unknown }>({
      context,
      path: "/api/v2/tickets.json",
      method: "POST",
      phase: "execute",
      body: { ticket: buildZendeskCreateTicketBody(input) },
    });
    return { ticket: normalizeZendeskTicket(payload.ticket, "ticket") };
  },
  async update_ticket(input, context) {
    const ticketId = requirePositiveInteger(input.ticketId, "ticketId");
    const payload = await requestZendeskJson<{ ticket?: unknown }>({
      context,
      path: `/api/v2/tickets/${ticketId}.json`,
      method: "PUT",
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: { ticket: buildZendeskUpdateTicketBody(input) },
    });
    return { ticket: normalizeZendeskTicket(payload.ticket, "ticket") };
  },
  async reply_to_ticket(input, context) {
    const ticketId = requirePositiveInteger(input.ticketId, "ticketId");
    const body = optionalString(input.body);
    if (!body) throw new ProviderRequestError(400, "body is required");
    const payload = await requestZendeskJson<{ ticket?: unknown }>({
      context,
      path: `/api/v2/tickets/${ticketId}.json`,
      method: "PUT",
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: {
        ticket: compactObject({
          assignee_id: optionalInteger(input.assigneeId),
          comment: { body, public: optionalBoolean(input.public) ?? true },
        }),
      },
    });
    return { ticket: normalizeZendeskTicket(payload.ticket, "ticket") };
  },
  async list_users(input, context) {
    const payload = await requestZendeskJson<ZendeskListPayload>({
      context,
      path: "/api/v2/users.json",
      phase: "execute",
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
        "page[size]": optionalInteger(input.pageSize),
        "page[after]": optionalString(input.pageAfter),
        role: optionalString(input.role),
        "role[]": stringifyArrayQuery(input.roleList),
        external_id: optionalString(input.externalId),
        permission_set: optionalInteger(input.permissionSet),
      }),
    });
    return { users: normalizeZendeskUserArray(payload.users), pagination: normalizeZendeskPagination(payload) };
  },
  async get_user(input, context) {
    const userId = requirePositiveInteger(input.userId, "userId");
    const payload = await requestZendeskJson<{ user?: unknown }>({
      context,
      path: `/api/v2/users/${userId}.json`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { user: normalizeZendeskUser(payload.user, "user") };
  },
  async search_users(input, context) {
    const payload = await requestZendeskJson<{
      users?: unknown;
      count?: unknown;
      next_page?: unknown;
      previous_page?: unknown;
    }>({
      context,
      path: "/api/v2/users/search.json",
      phase: "execute",
      query: compactObject({
        query: buildZendeskUserSearchQuery(input),
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      }),
    });
    return {
      users: normalizeZendeskUserArray(payload.users),
      count: optionalInteger(payload.count) ?? 0,
      nextPage: nullableString(payload.next_page),
      previousPage: nullableString(payload.previous_page),
    };
  },
  async list_organizations(input, context) {
    const payload = await requestZendeskJson<ZendeskListPayload>({
      context,
      path: "/api/v2/organizations.json",
      phase: "execute",
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      }),
    });
    return {
      organizations: normalizeZendeskOrganizationArray(payload.organizations),
      pagination: normalizeZendeskPagination(payload),
    };
  },
  async get_organization(input, context) {
    const organizationId = requirePositiveInteger(input.organizationId, "organizationId");
    const payload = await requestZendeskJson<{ organization?: unknown }>({
      context,
      path: `/api/v2/organizations/${organizationId}.json`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { organization: normalizeZendeskOrganization(payload.organization, "organization") };
  },
};

export async function validateZendeskCredential(
  secret: string,
  values: Record<string, unknown>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  authType: "api_key" | "oauth2" = "api_key",
): Promise<CredentialValidationResult> {
  const subdomain = normalizeZendeskSubdomain(
    requireString(readZendeskSubdomainValue(values), "Zendesk subdomain is required"),
  );
  const baseUrl = `https://${subdomain}.zendesk.com`;
  const email = authType === "api_key" ? requireString(values.email, "Zendesk email is required") : undefined;
  const context: ZendeskActionContext =
    authType === "oauth2"
      ? { authType, accessToken: secret, subdomain, baseUrl, fetcher, signal }
      : {
          authType,
          apiKey: secret,
          email: email ?? "",
          subdomain,
          baseUrl,
          fetcher,
          signal,
        };
  const payload = await requestZendeskJson<{ user?: unknown }>({
    context,
    path: zendeskCurrentUserPath,
    phase: "validate",
  });
  const user = normalizeZendeskUser(payload.user, "user");
  return {
    profile: {
      accountId: `zendesk:${subdomain}:${user.id}`,
      displayName: user.email ?? user.name ?? `${subdomain}.zendesk.com`,
    },
    metadata: {
      subdomain,
      baseUrl,
      validationEndpoint: zendeskCurrentUserPath,
      userId: user.id,
      name: user.name,
      email: user.email ?? email,
      role: user.role,
      rawUser: user.raw,
    },
  };
}

async function requestZendeskJson<T>(input: {
  context: ZendeskActionContext;
  path: string;
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  query?: Record<string, string | number | readonly string[] | undefined>;
  phase: "validate" | "execute";
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildZendeskUrl(input.context.baseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildZendeskHeaders(input.context, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readZendeskPayload(response);
    if (!response.ok) {
      throw createZendeskError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Zendesk request timed out after 30 seconds");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zendesk request failed: ${error.message}` : "Zendesk request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readZendeskPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zendesk returned invalid JSON");
  }
}

function createZendeskError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractZendeskErrorMessage(payload) ?? `Zendesk request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (notFoundAsInvalidInput && response.status === 404) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && (response.status === 400 || response.status === 409 || response.status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractZendeskErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const direct =
    optionalString(record?.description) ?? optionalString(record?.error) ?? optionalString(record?.message);
  if (direct) return direct;
  const details = optionalRecord(record?.details);
  const firstValue = details ? Object.values(details)[0] : undefined;
  if (Array.isArray(firstValue) && firstValue.length > 0) return String(firstValue[0]);
  const errors = record?.errors;
  return Array.isArray(errors) && errors.length > 0 ? String(errors[0]) : undefined;
}

function buildZendeskUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | readonly string[] | undefined>,
): string {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildZendeskHeaders(context: ZendeskActionContext, hasJsonBody: boolean): Record<string, string> {
  return compactObject({
    authorization:
      context.authType === "oauth2"
        ? `Bearer ${context.accessToken}`
        : `Basic ${Buffer.from(`${context.email}/token:${context.apiKey}`).toString("base64")}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
    "content-type": hasJsonBody ? "application/json" : undefined,
  }) as Record<string, string>;
}

function buildZendeskCreateTicketBody(input: Record<string, unknown>): Record<string, unknown> {
  const subject = requireString(input.subject, "subject is required");
  const requester = optionalRecord(input.requester);
  return compactObject({
    subject,
    comment: buildZendeskCommentInput(input, true),
    status: optionalString(input.status),
    priority: optionalString(input.priority),
    type: optionalString(input.ticketType),
    assignee_id: optionalInteger(input.assigneeId),
    group_id: optionalInteger(input.groupId),
    organization_id: optionalInteger(input.organizationId),
    requester_id: optionalInteger(input.requesterId),
    requester: requester
      ? compactObject({ name: optionalString(requester.name), email: optionalString(requester.email) })
      : undefined,
    external_id: optionalString(input.externalId),
    due_at: optionalString(input.dueAt),
    tags: readStringArray(input.tags),
    custom_fields: buildZendeskCustomFields(input.customFields),
  });
}

function buildZendeskUpdateTicketBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    subject: optionalString(input.subject),
    comment: buildZendeskCommentInput(input, false),
    status: optionalString(input.status),
    priority: optionalString(input.priority),
    type: optionalString(input.ticketType),
    assignee_id: optionalInteger(input.assigneeId),
    group_id: optionalInteger(input.groupId),
    organization_id: optionalInteger(input.organizationId),
    requester_id: optionalInteger(input.requesterId),
    external_id: optionalString(input.externalId),
    due_at: optionalString(input.dueAt),
    tags: readStringArray(input.tags),
    custom_fields: buildZendeskCustomFields(input.customFields),
    safe_update: optionalBoolean(input.safeUpdate),
    updated_stamp: optionalString(input.updatedStamp),
    metadata: optionalRecord(input.metadata),
  });
}

function buildZendeskCommentInput(
  input: Record<string, unknown>,
  required: boolean,
): Record<string, unknown> | undefined {
  const body = optionalString(input.description);
  const htmlBody = optionalString(input.htmlDescription);
  if (!body && !htmlBody) {
    if (required) throw new ProviderRequestError(400, "description or htmlDescription is required");
    return undefined;
  }
  return compactObject({ body, html_body: htmlBody, public: optionalBoolean(input.commentPublic) });
}

function buildZendeskCustomFields(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) throw new ProviderRequestError(400, "customFields entries must be objects");
    return { id: requirePositiveInteger(record.id, "customFields.id"), value: record.value };
  });
}

function buildZendeskUserSearchQuery(input: Record<string, unknown>): string {
  const terms: string[] = [];
  const email = optionalString(input.email);
  const name = optionalString(input.name);
  if (email) terms.push(`email:${quoteZendeskSearchTerm(email)}`);
  if (name) terms.push(`name:${quoteZendeskSearchTerm(name)}`);
  if (terms.length === 0) throw new ProviderRequestError(400, "email or name is required");
  return terms.join(" ");
}

function normalizeZendeskPagination(payload: ZendeskListPayload): Record<string, unknown> {
  const meta = optionalRecord(payload.meta);
  const links = optionalRecord(payload.links);
  return {
    count: nullableInteger(payload.count),
    hasMore:
      optionalBooleanOrNull(meta?.has_more) ??
      Boolean(optionalString(payload.next_page) ?? optionalString(links?.next)),
    nextPage: nullableString(payload.next_page) ?? nullableString(links?.next),
    previousPage: nullableString(payload.previous_page) ?? nullableString(links?.prev),
    afterCursor: nullableString(meta?.after_cursor),
    beforeCursor: nullableString(meta?.before_cursor),
  };
}

function normalizeZendeskTicketArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item, index) => normalizeZendeskTicket(item, `tickets[${index}]`)) : [];
}

function normalizeZendeskCommentArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item, index) => normalizeZendeskComment(item, `comments[${index}]`)) : [];
}

function normalizeZendeskUserArray(value: unknown): Array<ReturnType<typeof normalizeZendeskUser>> {
  return Array.isArray(value) ? value.map((item, index) => normalizeZendeskUser(item, `users[${index}]`)) : [];
}

function normalizeZendeskOrganizationArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item, index) => normalizeZendeskOrganization(item, `organizations[${index}]`))
    : [];
}

function normalizeZendeskTicket(value: unknown, fieldName = "ticket"): Record<string, unknown> {
  const record = requireRecord(value, `${fieldName} must be an object`);
  return {
    id: requireResponseInteger(record.id, `${fieldName}.id`),
    url: nullableString(record.url),
    subject: nullableString(record.subject),
    description: nullableString(record.description),
    status: nullableString(record.status),
    priority: nullableString(record.priority),
    type: nullableString(record.type),
    requesterId: nullableInteger(record.requester_id),
    assigneeId: nullableInteger(record.assignee_id),
    groupId: nullableInteger(record.group_id),
    organizationId: nullableInteger(record.organization_id),
    externalId: nullableString(record.external_id),
    dueAt: nullableString(record.due_at),
    createdAt: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
    tags: readRawStringArray(record.tags),
    raw: record,
  };
}

function normalizeZendeskComment(value: unknown, fieldName = "comment"): Record<string, unknown> {
  const record = requireRecord(value, `${fieldName} must be an object`);
  return {
    id: requireResponseInteger(record.id, `${fieldName}.id`),
    type: nullableString(record.type),
    authorId: nullableInteger(record.author_id),
    body: nullableString(record.body),
    htmlBody: nullableString(record.html_body),
    plainBody: nullableString(record.plain_body),
    public: optionalBooleanOrNull(record.public),
    createdAt: nullableString(record.created_at),
    attachments: Array.isArray(record.attachments)
      ? record.attachments.map((item, index) => normalizeZendeskAttachment(item, `${fieldName}.attachments[${index}]`))
      : [],
    raw: record,
  };
}

function normalizeZendeskAttachment(value: unknown, fieldName: string): Record<string, unknown> {
  const record = requireRecord(value, `${fieldName} must be an object`);
  return {
    id: requireResponseInteger(record.id, `${fieldName}.id`),
    fileName: nullableString(record.file_name),
    contentType: nullableString(record.content_type),
    size: nullableInteger(record.size),
    url: nullableString(record.content_url) ?? nullableString(record.url),
  };
}

function normalizeZendeskUser(
  value: unknown,
  fieldName = "user",
): {
  id: number;
  name: string | null;
  email: string | null;
  role: string | null;
  raw: Record<string, unknown>;
  [key: string]: unknown;
} {
  const record = requireRecord(value, `${fieldName} must be an object`);
  return {
    id: requireResponseInteger(record.id, `${fieldName}.id`),
    url: nullableString(record.url),
    name: nullableString(record.name),
    email: nullableString(record.email),
    role: nullableString(record.role),
    active: optionalBooleanOrNull(record.active),
    organizationId: nullableInteger(record.organization_id),
    externalId: nullableString(record.external_id),
    phone: nullableString(record.phone),
    timeZone: nullableString(record.time_zone) ?? nullableString(record.iana_time_zone),
    createdAt: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
    tags: readRawStringArray(record.tags),
    raw: record,
  };
}

function normalizeZendeskOrganization(value: unknown, fieldName = "organization"): Record<string, unknown> {
  const record = requireRecord(value, `${fieldName} must be an object`);
  return {
    id: requireResponseInteger(record.id, `${fieldName}.id`),
    url: nullableString(record.url),
    name: nullableString(record.name),
    externalId: nullableString(record.external_id),
    details: nullableString(record.details),
    notes: nullableString(record.notes),
    createdAt: nullableString(record.created_at),
    updatedAt: nullableString(record.updated_at),
    groupId: nullableInteger(record.group_id),
    sharedTickets: optionalBooleanOrNull(record.shared_tickets),
    sharedComments: optionalBooleanOrNull(record.shared_comments),
    domainNames: readRawStringArray(record.domain_names),
    tags: readRawStringArray(record.tags),
    raw: record,
  };
}

function normalizeZendeskSubdomain(raw: string): string {
  let candidate = raw.trim();
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    const url = new URL(candidate);
    candidate = url.hostname;
  }
  const lower = candidate.toLowerCase();
  const subdomain = lower.endsWith(".zendesk.com") ? lower.slice(0, -".zendesk.com".length) : lower;
  if (!subdomain || subdomain.includes(".") || subdomain.startsWith("-") || subdomain.endsWith("-")) {
    throw new ProviderRequestError(400, "Zendesk subdomain is invalid");
  }
  for (const character of subdomain) {
    const ok = (character >= "a" && character <= "z") || (character >= "0" && character <= "9") || character === "-";
    if (!ok) throw new ProviderRequestError(400, "Zendesk subdomain is invalid");
  }
  return subdomain;
}

function readZendeskSubdomainValue(values: Record<string, unknown>): unknown {
  return values.subdomain ?? optionalRecord(values.oauthClientExtra)?.subdomain;
}

function requireString(value: unknown, message: string): string {
  const result = optionalString(value);
  if (result) return result;
  throw new ProviderRequestError(400, message);
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  throw new ProviderRequestError(502, `${fieldName} is missing`);
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function nullableString(value: unknown): string | null {
  return optionalStringOrNull(value);
}

function nullableInteger(value: unknown): number | null {
  return optionalIntegerOrNull(value);
}

function stringifyArrayQuery(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

function quoteZendeskSearchTerm(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

function readRawStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined)
    : [];
}
