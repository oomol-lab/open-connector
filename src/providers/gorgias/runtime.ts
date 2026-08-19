import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const gorgiasValidationPath = "/api/account";

type QueryValue = string | number | boolean | Array<string | number> | undefined;
type GorgiasPhase = "validate" | "execute";

interface GorgiasActionContext {
  apiKey: string;
  baseUrl: string;
  email: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface GorgiasRequestInput {
  baseUrl: string;
  email: string;
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: GorgiasPhase;
  signal?: AbortSignal;
  query?: Record<string, QueryValue>;
  notFoundAsInvalidInput?: boolean;
}

type GorgiasActionHandler = ProviderRuntimeHandler<GorgiasActionContext>;

export const gorgiasActionHandlers: ProviderActionHandlers<"gorgias", GorgiasActionHandler> = {
  async get_account(_input, context) {
    return {
      account: normalizeAccount(
        await requestGorgiasJson({
          ...context,
          path: gorgiasValidationPath,
          phase: "execute",
        }),
      ),
    };
  },
  async list_users(input, context) {
    const payload = await requestGorgiasJson({
      ...context,
      path: "/api/users",
      phase: "execute",
      query: compactQuery({
        cursor: optionalString(input.cursor),
        external_id: optionalString(input.externalId),
        email: optionalString(input.email),
        limit: optionalInteger(input.limit),
        order_by: optionalString(input.orderBy),
        roles: readStringArray(input.roles),
        search: optionalString(input.search),
        available_first: optionalBoolean(input.availableFirst),
      }),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Gorgias users response must be an array");
    }

    return { users: payload.map(normalizeUser) };
  },
  async list_customers(input, context) {
    const payload = await requestGorgiasJson({
      ...context,
      path: "/api/customers",
      phase: "execute",
      query: compactQuery({
        cursor: optionalString(input.cursor),
        email: optionalString(input.email),
        external_id: optionalString(input.externalId),
        limit: optionalInteger(input.limit),
      }),
    });
    const page = normalizePaginatedPayload(payload, "customers");
    return {
      customers: page.data.map(normalizeCustomer),
      pagination: page.pagination,
      raw: page.raw,
    };
  },
  async list_tickets(input, context) {
    const payload = await requestGorgiasJson({
      ...context,
      path: "/api/tickets",
      phase: "execute",
      query: compactQuery({
        cursor: optionalString(input.cursor),
        customer_id: optionalInteger(input.customerId),
        trashed: optionalBoolean(input.trashed),
        external_id: optionalString(input.externalId),
        limit: optionalInteger(input.limit),
        view_id: optionalInteger(input.viewId),
        rule_id: optionalInteger(input.ruleId),
        ticket_ids: readIntegerArray(input.ticketIds),
        order_by: optionalString(input.orderBy),
      }),
    });
    const page = normalizePaginatedPayload(payload, "tickets");
    return {
      tickets: page.data.map(normalizeTicket),
      pagination: page.pagination,
      raw: page.raw,
    };
  },
  async get_ticket(input, context) {
    const ticketId = requirePositiveInteger(input.ticketId, "ticketId");
    return {
      ticket: normalizeTicket(
        await requestGorgiasJson({
          ...context,
          path: `/api/tickets/${ticketId}`,
          phase: "execute",
          notFoundAsInvalidInput: true,
          query: compactQuery({
            relationships: readStringArray(input.relationships),
          }),
        }),
      ),
    };
  },
  async list_tags(input, context) {
    const payload = await requestGorgiasJson({
      ...context,
      path: "/api/tags",
      phase: "execute",
      query: compactQuery({
        cursor: optionalString(input.cursor),
        search: optionalString(input.search),
        limit: optionalInteger(input.limit),
        order_by: optionalString(input.orderBy),
      }),
    });
    const page = normalizePaginatedPayload(payload, "tags");
    return {
      tags: page.data.map(normalizeTag),
      pagination: page.pagination,
      raw: page.raw,
    };
  },
};

export async function validateGorgiasCredential(
  input: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requireCredentialString(input.apiKey, "apiKey");
  const email = requireCredentialString(input.email, "email");
  const baseUrl = buildGorgiasBaseUrl(input.domain);
  const domain = new URL(baseUrl).hostname.slice(0, -".gorgias.com".length);
  const payload = await requestGorgiasJson({
    baseUrl,
    email,
    apiKey,
    path: gorgiasValidationPath,
    fetcher,
    signal,
    phase: "validate",
  });
  const account = optionalRecord(payload);
  if (!account) {
    throw new ProviderRequestError(502, "Gorgias account response must be an object");
  }

  const accountStatus = normalizeAccountStatus(account.status);
  const accountDomain = optionalString(account.domain);

  return {
    profile: {
      accountId: `gorgias:${domain}`,
      displayName: `Gorgias ${accountDomain || domain}`,
    },
    grantedScopes: [],
    metadata: {
      domain,
      email,
      baseUrl,
      validationEndpoint: gorgiasValidationPath,
      accountStatus,
    },
  };
}

async function requestGorgiasJson(input: GorgiasRequestInput): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildGorgiasUrl(input.baseUrl, input.path, input.query), {
      method: "GET",
      headers: {
        authorization: buildGorgiasAuthorizationHeader(input.email, input.apiKey),
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readGorgiasPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gorgias request failed: ${error.message}` : "Gorgias request failed",
    );
  }

  if (!response.ok) {
    throw createGorgiasError(response, payload, input.phase, input.notFoundAsInvalidInput === true);
  }

  return payload;
}

function buildGorgiasUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${trimTrailingSlash(baseUrl)}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readGorgiasPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Gorgias returned invalid JSON");
  }
}

function createGorgiasError(
  response: Response,
  payload: unknown,
  phase: GorgiasPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractGorgiasErrorMessage(payload) ?? `Gorgias request failed with ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

function extractGorgiasErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.description);
  if (direct) {
    return direct;
  }

  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];
    if (typeof first === "string" && first) {
      return first;
    }
    const firstRecord = optionalRecord(first);
    return firstRecord
      ? (optionalString(firstRecord.message) ??
          optionalString(firstRecord.detail) ??
          optionalString(firstRecord.description))
      : undefined;
  }

  return undefined;
}

function normalizePaginatedPayload(
  value: unknown,
  label: string,
): {
  data: unknown[];
  pagination: { previousCursor: string | null; nextCursor: string | null; totalResources: number | null };
  raw: Record<string, unknown>;
} {
  const payload = optionalRecord(value);
  const data = payload?.data;
  if (!payload || !Array.isArray(data)) {
    throw new ProviderRequestError(502, `Gorgias ${label} response is missing data array`);
  }

  const meta = optionalRecord(payload.meta);
  return {
    data,
    pagination: {
      previousCursor: optionalString(meta?.prev_cursor) ?? null,
      nextCursor: optionalString(meta?.next_cursor) ?? null,
      totalResources: optionalInteger(meta?.total_resources) ?? null,
    },
    raw: payload,
  };
}

function normalizeAccount(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Gorgias account response must be an object");
  }
  return {
    domain: optionalString(record.domain) ?? null,
    status: normalizeAccountStatus(record.status),
    raw: record,
  };
}

function normalizeUser(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const role = optionalRecord(record.role);
  return {
    id: optionalInteger(record.id) ?? null,
    email: optionalString(record.email) ?? null,
    name: optionalString(record.name) ?? null,
    active: optionalBoolean(record.active) ?? null,
    roleName: optionalString(role?.name) ?? null,
    raw: record,
  };
}

function normalizeCustomer(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalInteger(record.id) ?? null,
    email: optionalString(record.email) ?? null,
    name: optionalString(record.name) ?? null,
    externalId: optionalString(record.external_id) ?? null,
    raw: record,
  };
}

function normalizeTicket(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: optionalInteger(record.id) ?? null,
    subject: optionalString(record.subject) ?? null,
    status: optionalString(record.status) ?? null,
    channel: optionalString(record.channel) ?? null,
    customer: record.customer === null ? null : normalizeNullableCustomer(record.customer),
    createdDatetime: optionalString(record.created_datetime) ?? null,
    updatedDatetime: optionalString(record.updated_datetime) ?? null,
    raw: record,
  };
}

function normalizeNullableCustomer(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  return record ? normalizeCustomer(record) : null;
}

function normalizeTag(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  const decoration = optionalRecord(record.decoration);
  return {
    id: optionalInteger(record.id) ?? null,
    name: optionalString(record.name) ?? null,
    color: optionalString(decoration?.color) ?? null,
    usage: optionalInteger(record.usage) ?? null,
    raw: record,
  };
}

function normalizeAccountStatus(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  const status = optionalRecord(value);
  return optionalString(status?.status) ?? null;
}

function requireCredentialString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const strings = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return strings.length > 0 ? strings : undefined;
}

function readIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value.map((item, index) => requirePositiveInteger(item, `ticketIds[${index}]`));
}

function compactQuery(query: Record<string, QueryValue>): Record<string, QueryValue> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined));
}

function buildGorgiasBaseUrl(rawDomain: string | undefined): string {
  return `https://${normalizeGorgiasDomain(rawDomain)}.gorgias.com`;
}

function normalizeGorgiasDomain(rawDomain: string | undefined): string {
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

  normalized = trimTrailingSlash(normalized).toLowerCase();
  if (normalized.endsWith(".gorgias.com")) {
    normalized = normalized.slice(0, -".gorgias.com".length);
  } else if (normalized.includes(".")) {
    throw new ProviderRequestError(400, "domain must be a Gorgias subdomain");
  }

  if (!isGorgiasSubdomain(normalized)) {
    throw new ProviderRequestError(400, "domain must be a Gorgias subdomain");
  }

  return normalized;
}

function isGorgiasSubdomain(value: string): boolean {
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

function buildGorgiasAuthorizationHeader(email: string, apiKey: string): string {
  return `Basic ${Buffer.from(`${email}:${apiKey}`).toString("base64")}`;
}

function trimTrailingSlash(value: string): string {
  let normalized = value;
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
