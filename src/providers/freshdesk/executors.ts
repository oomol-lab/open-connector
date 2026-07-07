import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { FreshdeskActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "freshdesk";
const freshdeskValidationPath = "/api/v2/account";
const defaultFreshdeskPageSize = 30;
const freshdeskDefaultRequestTimeoutMs = 30_000;

interface FreshdeskActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FreshdeskRequestInput {
  path: string;
  mode: "validate" | "execute";
  query?: Record<string, string | number | undefined>;
  notFoundAsInvalidInput?: boolean;
}

type FreshdeskActionHandler = (input: Record<string, unknown>, context: FreshdeskActionContext) => Promise<unknown>;

export const freshdeskActionHandlers: Record<FreshdeskActionName, FreshdeskActionHandler> = {
  async get_account(_input, context) {
    return {
      account: await requestFreshdeskJson({
        ...context,
        path: freshdeskValidationPath,
        mode: "execute",
      }),
    };
  },
  async list_tickets(input, context) {
    validateListTicketsInput(input);
    const perPage = optionalInteger(input.perPage) ?? defaultFreshdeskPageSize;
    const page = optionalInteger(input.page) ?? 1;
    const ticketsPayload = await requestFreshdeskJson({
      ...context,
      path: "/api/v2/tickets",
      mode: "execute",
      query: compactObject({
        filter: optionalString(input.filter),
        requester_id: optionalInteger(input.requesterId),
        email: optionalString(input.email),
        company_id: optionalInteger(input.companyId),
        updated_since: optionalString(input.updatedSince),
        order_by: optionalString(input.orderBy),
        order_type: optionalString(input.orderType),
        page,
        per_page: perPage,
        include: stringifyInclude(input.include),
      }),
    });

    if (!Array.isArray(ticketsPayload)) {
      throw new ProviderRequestError(502, "Freshdesk tickets response must be an array", ticketsPayload);
    }

    const hasMore = ticketsPayload.length >= perPage;
    return {
      tickets: ticketsPayload,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    };
  },
  async get_ticket(input, context) {
    const ticketId = requirePositiveInteger(input.ticketId, "ticketId");
    return {
      ticket: await requestFreshdeskJson({
        ...context,
        path: `/api/v2/tickets/${ticketId}`,
        mode: "execute",
        notFoundAsInvalidInput: true,
        query: compactObject({
          include: stringifyInclude(input.include),
        }),
      }),
    };
  },
  async list_ticket_conversations(input, context) {
    const ticketId = requirePositiveInteger(input.ticketId, "ticketId");
    const payload = await requestFreshdeskJson({
      ...context,
      path: `/api/v2/tickets/${ticketId}/conversations`,
      mode: "execute",
      notFoundAsInvalidInput: true,
      query: compactObject({
        page: optionalInteger(input.page),
        per_page: optionalInteger(input.perPage),
      }),
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Freshdesk ticket conversations response must be an array", payload);
    }

    return {
      conversations: payload,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FreshdeskActionContext>({
  service,
  handlers: freshdeskActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FreshdeskActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveFreshdeskBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveFreshdeskBaseUrl(credential.values, credential.metadata);
  },
  auth: {
    type: "api_key_basic",
    suffix: ":X",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const domain = normalizeFreshdeskDomain(input.values.domain);
    const baseUrl = buildFreshdeskBaseUrl(domain);
    const payload = await requestFreshdeskJson({
      apiKey: input.apiKey,
      baseUrl,
      fetcher,
      signal,
      path: freshdeskValidationPath,
      mode: "validate",
    });

    const account = optionalRecord(payload);
    if (!account) {
      throw new ProviderRequestError(502, "Freshdesk account response must be an object", payload);
    }

    const accountId = optionalInteger(account.account_id);
    const accountName = optionalString(account.account_name);
    const helpdeskName = optionalString(account.organisation_name) ?? optionalString(account.account_domain);

    return {
      profile: {
        accountId: accountId === undefined ? `freshdesk:${domain}` : String(accountId),
        displayName: accountName ?? `Freshdesk ${domain}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        domain,
        baseUrl,
        validationEndpoint: freshdeskValidationPath,
        accountId,
        accountName,
        helpdeskName,
      }),
    };
  },
};

function validateListTicketsInput(input: Record<string, unknown>): void {
  const primaryFilters = [input.filter, input.requesterId, input.email, input.companyId, input.updatedSince].filter(
    (value) => value !== undefined,
  );

  if (primaryFilters.length > 1) {
    throw new ProviderRequestError(
      400,
      "list_tickets accepts at most one of filter, requesterId, email, companyId, updatedSince",
    );
  }
}

function stringifyInclude(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value
    .map((item) => optionalString(item))
    .filter((item) => item !== undefined)
    .join(",");
}

function resolveFreshdeskBaseUrl(values: Record<string, string>, metadata: Record<string, unknown>): string {
  const baseUrl = optionalString(metadata.baseUrl);
  if (baseUrl) {
    return trimTrailingSlash(baseUrl);
  }

  const domain = optionalString(metadata.domain) ?? optionalString(values.domain);
  return buildFreshdeskBaseUrl(normalizeFreshdeskDomain(domain));
}

async function requestFreshdeskJson(input: FreshdeskActionContext & FreshdeskRequestInput): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(freshdeskDefaultRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildFreshdeskUrl(input.baseUrl, input.path, input.query), {
      method: "GET",
      headers: {
        authorization: buildFreshdeskAuthorizationHeader(input.apiKey),
        "user-agent": providerUserAgent,
        accept: "application/json",
      },
      signal,
    });
    payload = await readFreshdeskPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !input.signal?.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Freshdesk request timed out after ${Math.max(1, Math.ceil(freshdeskDefaultRequestTimeoutMs / 1000))} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Freshdesk request failed: ${error.message}` : "Freshdesk request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createFreshdeskError(response, payload, input.mode, input.notFoundAsInvalidInput === true);
  }

  return payload;
}

async function readFreshdeskPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Freshdesk returned invalid JSON");
  }
}

function createFreshdeskError(
  response: Response,
  payload: unknown,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractFreshdeskErrorMessage(payload) ?? `Freshdesk request failed with ${response.status}`;

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function extractFreshdeskErrorMessage(payload: unknown): string | undefined {
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

function buildFreshdeskUrl(baseUrl: string, path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${trimTrailingSlash(baseUrl)}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildFreshdeskBaseUrl(domain: string): string {
  return `https://${domain}.freshdesk.com`;
}

function normalizeFreshdeskDomain(rawDomain: string | undefined): string {
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
  if (normalized.toLowerCase().endsWith(".freshdesk.com")) {
    normalized = normalized.slice(0, -".freshdesk.com".length);
  }
  normalized = normalized.toLowerCase();

  if (!normalized || !isFreshdeskSubdomain(normalized)) {
    throw new ProviderRequestError(400, "domain is required");
  }

  return normalized;
}

function isFreshdeskSubdomain(value: string): boolean {
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

function buildFreshdeskAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:X`).toString("base64")}`;
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

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}
