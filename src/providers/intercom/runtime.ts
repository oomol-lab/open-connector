import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { intercomGrantedPermissions } from "./scopes.ts";

const intercomDefaultApiBaseUrl = "https://api.intercom.io";
const intercomApiVersion = "2.13";
const intercomJobsApiVersion = "2.15";

const intercomRegionBaseUrlByCode: Record<string, string> = {
  US: "https://api.intercom.io",
  EU: "https://api.eu.intercom.io",
  AU: "https://api.au.intercom.io",
};
const allowedIntercomHosts = new Set(
  Object.values(intercomRegionBaseUrlByCode).map((value) => new URL(value).hostname.toLowerCase()),
);

export interface IntercomActionContext {
  accessToken: string;
  fetcher: typeof fetch;
  providerMetadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

type IntercomActionHandler = (input: Record<string, unknown>, context: IntercomActionContext) => Promise<unknown>;

interface IntercomJsonRequestInput {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  apiVersion?: string;
  providerMetadata?: Record<string, unknown>;
  phase: "validate" | "execute";
  notFoundAsInvalidInput?: boolean;
}

interface IntercomPaginationSummary {
  hasMore: boolean;
  nextStartingAfter: string | null;
  page: number | null;
  perPage: number | null;
  totalPages: number | null;
  totalCount: number | null;
}

export const intercomActionHandlers: ProviderActionHandlers<"intercom", IntercomActionHandler> = {
  async get_current_admin(_input, context) {
    const admin = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/me",
      providerMetadata: context.providerMetadata,
      phase: "execute",
    });

    return { admin };
  },

  async list_admins(input, context) {
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/admins",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      query: compactObject({
        display_avatar: optionalBoolean(input.displayAvatar),
      }),
    });

    return {
      admins: readObjectArray(payload.admins),
    };
  },

  async get_admin(input, context) {
    const adminId = readRequiredPathToken(input.adminId, "adminId");
    const admin = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/admins/${encodeURIComponent(adminId)}`,
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return { admin };
  },

  async list_contacts(input, context) {
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/contacts",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      query: compactObject({
        per_page: readOptionalInteger(input.perPage),
        starting_after: optionalString(input.startingAfter),
      }),
    });

    return {
      contacts: readPaginatedData(payload),
      pagination: normalizeIntercomPagination(payload),
    };
  },

  async search_contacts(input, context) {
    const searchQuery = readRequiredObject(input.query, "query");
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/contacts/search",
      method: "POST",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      body: compactObject({
        query: searchQuery,
        pagination: buildIntercomPaginationRequest(input),
      }),
    });

    return {
      contacts: readPaginatedData(payload),
      pagination: normalizeIntercomPagination(payload),
    };
  },

  async get_contact(input, context) {
    const contactId = readRequiredString(input.contactId, "contactId", "action input");
    const contact = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/contacts/${encodeURIComponent(contactId)}`,
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return { contact };
  },

  async get_contact_by_external_id(input, context) {
    const externalId = readRequiredString(input.externalId, "externalId", "action input");
    const contact = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/contacts/find_by_external_id/${encodeURIComponent(externalId)}`,
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return { contact };
  },

  async create_contact(input, context) {
    validateCreateContactInput(input);
    const contact = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/contacts",
      method: "POST",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      body: buildIntercomContactBody(input),
    });

    return { contact };
  },

  async update_contact(input, context) {
    const contactId = readRequiredString(input.contactId, "contactId", "action input");
    validateUpdateContactInput(input);
    const contact = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/contacts/${encodeURIComponent(contactId)}`,
      method: "PUT",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: buildIntercomContactBody(input),
    });

    return { contact };
  },

  async list_companies(input, context) {
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/companies/list",
      method: "POST",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      query: compactObject({
        page: readOptionalInteger(input.page),
        per_page: readOptionalInteger(input.perPage),
        order: optionalString(input.order),
        starting_after: optionalString(input.startingAfter),
      }),
    });

    return {
      companies: readPaginatedData(payload),
      pagination: normalizeIntercomPagination(payload),
    };
  },

  async get_company(input, context) {
    validateGetCompanyInput(input);
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/companies",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        company_id: optionalString(input.companyId),
        name: optionalString(input.name),
      }),
    });

    return { company: readRequiredFirstPaginatedObject(payload, "Intercom company") };
  },

  async list_conversations(input, context) {
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/conversations",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      query: compactObject({
        per_page: readOptionalInteger(input.perPage),
        starting_after: optionalString(input.startingAfter),
      }),
    });

    return {
      conversations: readObjectArray(payload.conversations),
      pagination: normalizeIntercomPagination(payload),
    };
  },

  async get_conversation(input, context) {
    const conversationId = readRequiredString(input.conversationId, "conversationId", "action input");
    const conversation = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/conversations/${encodeURIComponent(conversationId)}`,
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        display_as: optionalString(input.displayAs),
      }),
    });

    return { conversation };
  },

  async reply_to_conversation(input, context) {
    const conversationId = readRequiredString(input.conversationId, "conversationId", "action input");
    const conversation = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/conversations/${encodeURIComponent(conversationId)}/reply`,
      method: "POST",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: compactObject({
        message_type: optionalString(input.messageType) ?? "comment",
        type: "admin",
        admin_id: readRequiredString(input.adminId, "adminId", "action input"),
        body: readRequiredString(input.body, "body", "action input"),
        attachment_urls: readStringArray(input.attachmentUrls),
      }),
    });

    return { conversation };
  },

  async close_conversation(input, context) {
    const conversationId = readRequiredString(input.conversationId, "conversationId", "action input");
    const conversation = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/conversations/${encodeURIComponent(conversationId)}/parts`,
      method: "POST",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: compactObject({
        message_type: "close",
        type: "admin",
        admin_id: readRequiredString(input.adminId, "adminId", "action input"),
        body: optionalString(input.body),
      }),
    });

    return { conversation };
  },

  async reopen_conversation(input, context) {
    const conversationId = readRequiredString(input.conversationId, "conversationId", "action input");
    const conversation = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/conversations/${encodeURIComponent(conversationId)}/parts`,
      method: "POST",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
      body: {
        message_type: "open",
        admin_id: readRequiredString(input.adminId, "adminId", "action input"),
      },
    });

    return { conversation };
  },

  async list_events(input, context) {
    validateListEventsInput(input);
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/events",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      query: compactObject({
        type: "user",
        user_id: optionalString(input.userId),
        email: optionalString(input.email),
        intercom_user_id: optionalString(input.intercomUserId),
        per_page: readOptionalInteger(input.perPage),
        summary: optionalBoolean(input.summary),
      }),
    });

    return {
      events: readObjectArray(payload.events ?? payload.data),
      eventSummary: payload,
    };
  },

  async list_tags(_input, context) {
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/tags",
      providerMetadata: context.providerMetadata,
      phase: "execute",
    });

    return { tags: readObjectArray(payload.data) };
  },

  async get_counts(input, context) {
    const counts = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/counts",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      query: compactObject({
        type: optionalString(input.type),
        count: optionalString(input.count),
      }),
    });

    return { counts };
  },

  async get_ticket(input, context) {
    const ticketId = readRequiredString(input.ticketId, "ticketId", "action input");
    const ticket = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/tickets/${encodeURIComponent(ticketId)}`,
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return { ticket };
  },

  async search_tickets(input, context) {
    const searchQuery = readRequiredObject(input.query, "query");
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/tickets/search",
      method: "POST",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      body: compactObject({
        query: searchQuery,
        pagination: buildIntercomPaginationRequest(input),
      }),
    });

    return {
      tickets: readObjectArray(payload.tickets ?? payload.data),
      pagination: normalizeIntercomPagination(payload),
    };
  },

  async get_job_status(input, context) {
    const jobId = readRequiredString(input.jobId, "jobId", "action input");
    const job = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/jobs/status/${encodeURIComponent(jobId)}`,
      apiVersion: intercomJobsApiVersion,
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return { job };
  },

  async list_articles(input, context) {
    const payload = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/articles",
      providerMetadata: context.providerMetadata,
      phase: "execute",
      query: compactObject({
        per_page: readOptionalInteger(input.perPage),
        starting_after: optionalString(input.startingAfter),
      }),
    });

    return {
      articles: readPaginatedData(payload),
      pagination: normalizeIntercomPagination(payload),
    };
  },

  async get_article(input, context) {
    const articleId = readRequiredPathToken(input.articleId, "articleId");
    const article = await intercomRequestJson<Record<string, unknown>>({
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      path: `/articles/${encodeURIComponent(articleId)}`,
      providerMetadata: context.providerMetadata,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });

    return { article };
  },
};

export async function validateIntercomOAuthCredential(
  input: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await intercomRequestJson<Record<string, unknown>>({
    accessToken: input.accessToken,
    fetcher,
    signal,
    path: "/me",
    providerMetadata: input.metadata,
    phase: "validate",
  });

  const adminId = readRequiredString(payload.id, "id", "current admin");
  const app = optionalRecord(payload.app);
  const workspaceIdCode = optionalString(app?.id_code);
  const workspaceName = optionalString(app?.name);
  const workspaceRegion = optionalString(app?.region);
  const email = optionalString(payload.email);
  const name = optionalString(payload.name);
  const providerAccountId = workspaceIdCode ? `${workspaceIdCode}:${adminId}` : adminId;
  const accountLabel = buildIntercomAccountLabel({
    workspaceName,
    email,
    name,
    fallback: providerAccountId,
  });

  return {
    profile: {
      accountId: providerAccountId,
      displayName: accountLabel,
    },
    grantedScopes: intercomGrantedPermissions,
    metadata: compactObject({
      adminId,
      adminEmail: email,
      adminName: name,
      workspaceIdCode,
      workspaceName,
      workspaceRegion,
      apiBaseUrl: resolveIntercomApiBaseUrl({
        workspaceRegion,
      }),
    }),
  };
}

async function intercomRequestJson<T>(input: IntercomJsonRequestInput): Promise<T> {
  const baseUrl = resolveIntercomApiBaseUrl(input.providerMetadata);
  const url = new URL(input.path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal);
  try {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${input.accessToken}`,
      "Intercom-Version": input.apiVersion ?? intercomApiVersion,
      "user-agent": providerUserAgent,
    });
    if (input.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });

    if (!response.ok) {
      throw toIntercomError({
        response,
        payload: await safeReadJson(response),
        phase: input.phase,
        notFoundAsInvalidInput: input.notFoundAsInvalidInput ?? false,
      });
    }

    return (await safeReadJson(response)) as T;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "intercom request timed out", error);
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function safeReadJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "intercom returned invalid JSON");
    }
    return {};
  }
}

function toIntercomError(input: {
  response: Response;
  payload: unknown;
  phase: "validate" | "execute";
  notFoundAsInvalidInput: boolean;
}): ProviderRequestError {
  const { response, payload, phase, notFoundAsInvalidInput } = input;
  const message = extractIntercomErrorMessage(payload) ?? `intercom request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 403 && looksLikeAuthError(message)) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function buildIntercomAccountLabel(input: {
  workspaceName?: string;
  email?: string;
  name?: string;
  fallback: string;
}): string {
  const adminLabel = input.email ?? input.name ?? input.fallback;
  return input.workspaceName ? `${input.workspaceName} (${adminLabel})` : adminLabel;
}

function resolveIntercomApiBaseUrl(
  providerMetadata?: { workspaceRegion?: string; apiBaseUrl?: string } | Record<string, unknown>,
): string {
  const metadata = providerMetadata as Record<string, unknown> | undefined;
  const apiBaseUrl = optionalString(metadata?.apiBaseUrl) ?? optionalString(metadata?.baseUrl);
  if (apiBaseUrl) {
    return normalizeIntercomApiBaseUrl(apiBaseUrl);
  }

  const region = optionalString(metadata?.workspaceRegion) ?? optionalString(metadata?.region);
  if (region) {
    const resolved = intercomRegionBaseUrlByCode[region.toUpperCase()];
    if (resolved) {
      return resolved;
    }
  }

  return intercomDefaultApiBaseUrl;
}

function normalizeIntercomApiBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "intercom apiBaseUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "intercom apiBaseUrl must use https");
  }

  if (parsed.username || parsed.password || parsed.port || !allowedIntercomHosts.has(parsed.hostname.toLowerCase())) {
    throw new ProviderRequestError(400, "intercom apiBaseUrl must be an approved Intercom API host");
  }

  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return trimTrailingSlash(parsed.toString());
}

function buildIntercomPaginationRequest(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const perPage = readOptionalInteger(input.perPage);
  const startingAfter = optionalString(input.startingAfter);
  if (perPage === undefined && startingAfter === undefined) {
    return undefined;
  }

  return compactObject({
    per_page: perPage,
    starting_after: startingAfter,
  });
}

function buildIntercomContactBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    role: optionalString(input.role),
    external_id: optionalString(input.externalId),
    email: optionalString(input.email),
    phone: readNullableString(input.phone),
    name: readNullableString(input.name),
    avatar: readNullableString(input.avatar),
    signed_up_at: readNullableInteger(input.signedUpAt),
    last_seen_at: readNullableInteger(input.lastSeenAt),
    owner_id: readNullableInteger(input.ownerId),
    unsubscribed_from_emails: readNullableBoolean(input.unsubscribedFromEmails),
    custom_attributes: readNullableObject(input.customAttributes),
  });
}

function validateCreateContactInput(input: Record<string, unknown>): void {
  if (!optionalString(input.email) && !optionalString(input.externalId) && !optionalString(input.role)) {
    throw new ProviderRequestError(400, "create_contact requires at least one of email, externalId, or role");
  }
}

function validateUpdateContactInput(input: Record<string, unknown>): void {
  const hasMutation = Object.entries(input).some(([key, value]) => key !== "contactId" && value !== undefined);
  if (!hasMutation) {
    throw new ProviderRequestError(400, "update_contact requires at least one field to update");
  }
}

function validateGetCompanyInput(input: Record<string, unknown>): void {
  const provided = [optionalString(input.companyId), optionalString(input.name)].filter((value) => value);
  if (provided.length !== 1) {
    throw new ProviderRequestError(400, "get_company requires exactly one of companyId or name");
  }
}

function validateListEventsInput(input: Record<string, unknown>): void {
  const provided = [
    optionalString(input.userId),
    optionalString(input.email),
    optionalString(input.intercomUserId),
  ].filter((value) => value);
  if (provided.length !== 1) {
    throw new ProviderRequestError(400, "list_events requires exactly one of userId, email, or intercomUserId");
  }
}

function readPaginatedData(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  return readObjectArray(payload.data);
}

function readRequiredFirstPaginatedObject(payload: Record<string, unknown>, label: string): Record<string, unknown> {
  const first = readPaginatedData(payload)[0];
  if (!first) {
    throw new ProviderRequestError(400, `${label} was not found`);
  }
  return first;
}

function normalizeIntercomPagination(payload: Record<string, unknown>): IntercomPaginationSummary {
  const pages = optionalRecord(payload.pages);
  const next = optionalRecord(pages?.next);
  return {
    hasMore: next != null && optionalString(next.starting_after) != null,
    nextStartingAfter: optionalString(next?.starting_after) ?? null,
    page: readOptionalInteger(pages?.page) ?? null,
    perPage: readOptionalInteger(pages?.per_page) ?? null,
    totalPages: readOptionalInteger(pages?.total_pages) ?? null,
    totalCount: readOptionalInteger(payload.total_count) ?? null,
  };
}

function extractIntercomErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  const errors = Array.isArray(body?.errors) ? body.errors : undefined;
  const firstError = errors?.find((value) => optionalRecord(value) != null);
  const firstErrorRecord = optionalRecord(firstError);
  return optionalString(firstErrorRecord?.message) ?? optionalString(body?.message) ?? optionalString(body?.error);
}

function looksLikeAuthError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("access token") || normalized.includes("unauthorized");
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => optionalRecord(item) != null);
}

function readRequiredString(value: unknown, fieldName: string, context: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required for ${context}`);
  }
  return stringValue;
}

function readRequiredPathToken(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  return readRequiredString(value, fieldName, "action input");
}

function readOptionalInteger(value: unknown): number | undefined {
  const integerValue = optionalInteger(value);
  if (integerValue !== undefined) {
    return integerValue;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readNullableInteger(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return readOptionalInteger(value);
}

function readNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value);
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function readNullableObject(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalRecord(value);
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  return items.length > 0 ? items : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
