import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { FreshserviceActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "freshservice";
const freshserviceValidationPath = "/api/v2/tickets";
const freshserviceDefaultRequestTimeoutMs = 30_000;
const freshserviceDefaultPageSize = 30;

interface FreshserviceActionContext {
  apiKey: string;
  baseUrl: string;
  workspaceId?: number;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FreshserviceRequestInput {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  mode: "validate" | "execute";
  notFoundAsInvalidInput?: boolean;
}

type FreshserviceActionHandler = (
  input: Record<string, unknown>,
  context: FreshserviceActionContext,
) => Promise<unknown>;

export const freshserviceActionHandlers: Record<FreshserviceActionName, FreshserviceActionHandler> = {
  async list_tickets(input, context) {
    validateListTicketsInput(input);
    const perPage = optionalInteger(input.perPage) ?? freshserviceDefaultPageSize;
    const page = optionalInteger(input.page) ?? 1;
    const payload = await requestFreshserviceJson(context, {
      path: freshserviceValidationPath,
      mode: "execute",
      query: compactObject({
        page,
        per_page: perPage,
        filter: optionalString(input.filter),
        include: stringifyInclude(input.include),
        order_by: optionalString(input.orderBy),
        order_type: optionalString(input.orderType),
        updated_since: optionalString(input.updatedSince),
        workspace_id: resolveWorkspaceId(input.workspaceId, context.workspaceId),
      }),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Freshservice tickets response must be an array", payload);
    }

    const hasMore = payload.length >= perPage;
    return {
      tickets: payload,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    };
  },

  async get_ticket(input, context) {
    const ticketId = requirePositiveInteger(input.ticketId, "ticketId");
    const payload = await requestFreshserviceJson(context, {
      path: `/api/v2/tickets/${ticketId}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        include: stringifyInclude(input.include),
        workspace_id: resolveWorkspaceId(input.workspaceId, context.workspaceId),
      }),
    });

    return {
      ticket: readRequiredObject(payload, "ticket"),
    };
  },

  async create_ticket(input, context) {
    validateCreateTicketInput(input);
    const payload = await requestFreshserviceJson(context, {
      path: "/api/v2/tickets",
      method: "POST",
      mode: "execute",
      body: buildCreateTicketBody(input, context.workspaceId),
    });

    return {
      ticket: readRequiredObject(payload, "ticket"),
    };
  },

  async list_locations(input, context) {
    const perPage = optionalInteger(input.perPage) ?? freshserviceDefaultPageSize;
    const page = optionalInteger(input.page) ?? 1;
    const payload = await requestFreshserviceJson(context, {
      path: "/api/v2/locations",
      mode: "execute",
      query: compactObject({
        page,
        per_page: perPage,
        workspace_id: resolveWorkspaceId(input.workspaceId, context.workspaceId),
      }),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Freshservice locations response must be an array", payload);
    }

    const hasMore = payload.length >= perPage;
    return {
      locations: payload,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    };
  },

  async list_service_catalog_items(input, context) {
    const perPage = optionalInteger(input.perPage) ?? freshserviceDefaultPageSize;
    const page = optionalInteger(input.page) ?? 1;
    const searchTerm = optionalString(input.searchTerm);
    const payload = await requestFreshserviceJson(context, {
      path: searchTerm ? "/api/v2/service_catalog/items/search" : "/api/v2/service_catalog/items",
      mode: "execute",
      query: compactObject({
        page,
        per_page: perPage,
        search_term: searchTerm,
        workspace_id: resolveWorkspaceId(input.workspaceId, context.workspaceId),
      }),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Freshservice service catalog response must be an array", payload);
    }

    const hasMore = payload.length >= perPage;
    return {
      items: payload,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    };
  },

  async create_service_request(input, context) {
    const itemDisplayId = requirePositiveInteger(input.itemDisplayId, "itemDisplayId");
    const payload = await requestFreshserviceJson(context, {
      path: `/api/v2/service_catalog/items/${itemDisplayId}/place_request`,
      method: "POST",
      mode: "execute",
      body: buildCreateServiceRequestBody(input, context.workspaceId),
    });

    return {
      serviceRequest: readRequiredObject(payload, "serviceRequest"),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FreshserviceActionContext>({
  service,
  handlers: freshserviceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FreshserviceActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveFreshserviceBaseUrl(credential.values, credential.metadata),
      workspaceId: resolveStoredWorkspaceId(credential.values.workspaceId, credential.metadata.workspaceId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveFreshserviceBaseUrl(credential.values, credential.metadata);
  },
  auth: {
    type: "api_key_basic",
    suffix: ":X",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const domain = normalizeFreshserviceDomain(input.values.domain);
    const workspaceId = parseOptionalPositiveIntegerString(input.values.workspaceId, "workspaceId");
    const baseUrl = buildFreshserviceBaseUrl(domain);
    const payload = await requestFreshserviceJson(
      {
        apiKey: input.apiKey,
        baseUrl,
        workspaceId,
        fetcher,
        signal,
      },
      {
        path: freshserviceValidationPath,
        mode: "validate",
        query: compactObject({
          per_page: 1,
          workspace_id: workspaceId,
        }),
      },
    );

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Freshservice validation response must be an array", payload);
    }

    return {
      profile: {
        accountId: `freshservice:${domain}`,
        displayName: `Freshservice ${domain}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        domain,
        baseUrl,
        validationEndpoint: `${freshserviceValidationPath}?per_page=1`,
        workspaceId,
      }),
    };
  },
};

function validateListTicketsInput(input: Record<string, unknown>): void {
  if (input.orderType !== undefined && input.orderBy === undefined) {
    throw new ProviderRequestError(400, "orderType requires orderBy.");
  }
}

function validateCreateTicketInput(input: Record<string, unknown>): void {
  if (input.email === undefined && input.requesterId === undefined) {
    throw new ProviderRequestError(400, "create_ticket requires either email or requesterId.");
  }
}

async function requestFreshserviceJson(
  context: FreshserviceActionContext,
  input: FreshserviceRequestInput,
): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(freshserviceDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildFreshserviceUrl(context.baseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: freshserviceHeaders(context.apiKey, input.method),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    payload = await readFreshservicePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutSignal.aborted && !context.signal?.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Freshservice request timed out after ${Math.max(1, Math.ceil(freshserviceDefaultRequestTimeoutMs / 1000))} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Freshservice request failed: ${error.message}` : "Freshservice request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createFreshserviceError(response, payload, input.mode, input.notFoundAsInvalidInput === true);
  }

  return payload;
}

async function readFreshservicePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Freshservice returned invalid JSON");
  }
}

function createFreshserviceError(
  response: Response,
  payload: unknown,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractFreshserviceErrorMessage(payload) ?? `Freshservice request failed with ${response.status}`;

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function extractFreshserviceErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = optionalString(record.message) ?? optionalString(record.description) ?? optionalString(record.error);
  if (direct) {
    return direct;
  }

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const first = optionalRecord(record.errors[0]);
    const message = first ? (optionalString(first.message) ?? optionalString(first.description)) : undefined;
    if (message) {
      return message;
    }
  }

  return undefined;
}

function buildFreshserviceUrl(baseUrl: string, path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${trimTrailingSlash(baseUrl)}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildFreshserviceBaseUrl(domain: string): string {
  return `https://${domain}.freshservice.com`;
}

function resolveFreshserviceBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const baseUrl = optionalString(metadata.baseUrl);
  if (baseUrl) {
    return trimTrailingSlash(baseUrl);
  }

  const domain = optionalString(metadata.domain) ?? optionalString(values.domain);
  return buildFreshserviceBaseUrl(normalizeFreshserviceDomain(domain));
}

function normalizeFreshserviceDomain(rawDomain: string | undefined): string {
  const domain = rawDomain?.trim();
  if (!domain) {
    throw new ProviderRequestError(400, "domain is required");
  }

  let normalized = domain;
  if (normalized.startsWith("https://")) {
    normalized = normalized.slice("https://".length);
  } else if (normalized.startsWith("http://")) {
    normalized = normalized.slice("http://".length);
  }

  normalized = trimTrailingSlash(normalized);
  if (normalized.toLowerCase().endsWith(".freshservice.com")) {
    normalized = normalized.slice(0, -".freshservice.com".length);
  }
  normalized = normalized.toLowerCase();

  if (!normalized || !isFreshserviceSubdomain(normalized)) {
    throw new ProviderRequestError(400, "domain is required");
  }

  return normalized;
}

function isFreshserviceSubdomain(value: string): boolean {
  if (value.length === 0 || value.startsWith("-") || value.endsWith("-")) {
    return false;
  }

  for (const char of value) {
    const isLetter = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    if (!isLetter && !isDigit && char !== "-") {
      return false;
    }
  }

  return true;
}

function freshserviceHeaders(apiKey: string, method: "GET" | "POST" | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: buildFreshserviceAuthorizationHeader(apiKey),
    "user-agent": providerUserAgent,
    accept: "application/json",
  };
  if (method === "POST") {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildFreshserviceAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`;
}

function stringifyInclude(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const result = value
    .map((item) => optionalString(item))
    .filter((item) => item !== undefined)
    .join(",");
  return result || undefined;
}

function buildCreateTicketBody(
  input: Record<string, unknown>,
  defaultWorkspaceId: number | undefined,
): Record<string, unknown> {
  return compactObject({
    subject: readRequiredInputString(input.subject, "subject"),
    description: readRequiredInputString(input.description, "description"),
    status: requirePositiveInteger(input.status, "status"),
    priority: requirePositiveInteger(input.priority, "priority"),
    email: optionalString(input.email),
    requester_id: optionalInteger(input.requesterId),
    name: optionalString(input.name),
    type: optionalString(input.type),
    source: optionalInteger(input.source),
    impact: optionalInteger(input.impact),
    urgency: optionalInteger(input.urgency),
    email_config_id: optionalInteger(input.emailConfigId),
    group_id: optionalInteger(input.groupId),
    responder_id: optionalInteger(input.responderId),
    requested_for_id: optionalInteger(input.requestedForId),
    department_id: optionalInteger(input.departmentId),
    category: optionalString(input.category),
    sub_category: optionalString(input.subCategory),
    item_category: optionalString(input.itemCategory),
    due_by: optionalString(input.dueBy),
    fr_due_by: optionalString(input.frDueBy),
    tags: readOptionalStringArray(input.tags),
    cc_emails: readOptionalStringArray(input.ccEmails),
    custom_fields: optionalRecord(input.customFields),
    workspace_id: resolveWorkspaceId(input.workspaceId, defaultWorkspaceId),
  });
}

function buildCreateServiceRequestBody(
  input: Record<string, unknown>,
  defaultWorkspaceId: number | undefined,
): Record<string, unknown> {
  return compactObject({
    email: optionalString(input.email),
    quantity: optionalInteger(input.quantity),
    parent_ticket_id: optionalInteger(input.parentTicketId),
    workspace_id: resolveWorkspaceId(input.workspaceId, defaultWorkspaceId),
    custom_fields: optionalRecord(input.customFields),
  });
}

function resolveWorkspaceId(value: unknown, fallback: number | undefined): number | undefined {
  const explicit = optionalInteger(value);
  if (explicit !== undefined) {
    if (explicit <= 0) {
      throw new ProviderRequestError(400, "workspaceId must be a positive integer");
    }
    return explicit;
  }

  return fallback;
}

function resolveStoredWorkspaceId(value: string | undefined, metadataValue: unknown): number | undefined {
  const metadataWorkspaceId = optionalInteger(metadataValue);
  if (metadataWorkspaceId !== undefined) {
    if (metadataWorkspaceId <= 0) {
      throw new ProviderRequestError(400, "workspaceId must be a positive integer");
    }
    return metadataWorkspaceId;
  }

  return parseOptionalPositiveIntegerString(value, "workspaceId");
}

function parseOptionalPositiveIntegerString(value: string | undefined, fieldName: string): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readRequiredObject(payload: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} response must be an object`, payload);
  }
  return record;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const result = value
    .map((item) => optionalString(item))
    .filter((item): item is string => item !== undefined && item.length > 0);
  return result.length > 0 ? result : undefined;
}

function isAbortLikeError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function trimTrailingSlash(value: string): string {
  let normalized = value;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
