import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { GetProspectActionName } from "./actions.ts";

import { optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "getprospect";
const getprospectApiBaseUrl = "https://api.getprospect.com";
const validationEndpoint = "/v2/email-verifier";
const validationEmail = "support@getprospect.com";

type GetProspectActionContext = ApiKeyProviderContext;
type GetProspectActionHandler = (input: Record<string, unknown>, context: GetProspectActionContext) => Promise<unknown>;

export const getprospectActionHandlers: Record<GetProspectActionName, GetProspectActionHandler> = {
  find_email(input, context) {
    return findEmail(input, context);
  },
  verify_email(input, context) {
    return verifyEmail(input, context);
  },
  lookup_email(input, context) {
    return lookupEmail(input, context);
  },
  search_leads(input, context) {
    return searchLeads(input, context);
  },
  search_companies(input, context) {
    return searchCompanies(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, getprospectActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: getprospectApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "apiKey",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestGetProspect({
      path: validationEndpoint,
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
      query: {
        email: validationEmail,
      },
    });
    const object = optionalRecord(payload) ?? {};

    return {
      profile: {
        accountId: "getprospect",
        displayName: "GetProspect API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: getprospectApiBaseUrl,
        validationEndpoint,
        validationEmail,
        status: optionalString(object.status),
      },
    };
  },
};

async function findEmail(input: Record<string, unknown>, context: GetProspectActionContext): Promise<unknown> {
  assertFindEmailInput(input);
  const payload = await requestGetProspect({
    path: "/v2/email-finder",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: input,
  });

  return {
    email: readRequiredString(payload, "email"),
    status: readRequiredString(payload, "status"),
    account: readNullableString(payload, "account"),
    domain: readNullableString(payload, "domain"),
    full_name: readNullableString(payload, "full_name"),
    first_name: readNullableString(payload, "first_name"),
    last_name: readNullableString(payload, "last_name"),
    linkedin_url: readNullableString(payload, "linkedin_url"),
    raw: payload,
  };
}

async function verifyEmail(input: Record<string, unknown>, context: GetProspectActionContext): Promise<unknown> {
  const payload = await requestGetProspect({
    path: "/v2/email-verifier",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: input,
  });

  return {
    email: readRequiredString(payload, "email"),
    status: readRequiredString(payload, "status"),
    account: readRequiredString(payload, "account"),
    domain: readRequiredString(payload, "domain"),
    domain_status: readRequiredString(payload, "domain_status"),
    smtp_provider: readRequiredString(payload, "smtp_provider"),
    free_email: readNullableBoolean(payload, "free_email"),
    raw: payload,
  };
}

async function lookupEmail(input: Record<string, unknown>, context: GetProspectActionContext): Promise<unknown> {
  const payload = await requestGetProspect({
    path: "/public/v1/email/lookup",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: input,
  });

  return {
    email: readRequiredString(payload, "email"),
    status: readRequiredString(payload, "status"),
    free_email: readNullableBoolean(payload, "free_email"),
    full_name: readNullableString(payload, "full_name"),
    first_name: readNullableString(payload, "first_name"),
    last_name: readNullableString(payload, "last_name"),
    linkedin: readArray(payload, "linkedin"),
    companies: readArray(payload, "companies"),
    raw: payload,
  };
}

async function searchLeads(input: Record<string, unknown>, context: GetProspectActionContext): Promise<unknown> {
  const filters = readRequiredFilters(input.filters);
  const { filters: _filters, ...query } = input;
  const payload = await requestGetProspect({
    path: "/public/v1/insights/contacts",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "POST",
    query,
    body: filters,
  });

  return {
    data: readArray(payload, "data").map((item) => normalizeLeadItem(asRecord(item))),
    meta: readMeta(payload),
  };
}

async function searchCompanies(input: Record<string, unknown>, context: GetProspectActionContext): Promise<unknown> {
  const filters = readRequiredFilters(input.filters);
  const { filters: _filters, ...query } = input;
  const payload = await requestGetProspect({
    path: "/public/v1/insights/companies",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "POST",
    query,
    body: filters,
  });

  return {
    data: readArray(payload, "data").map((item) => normalizeCompanyItem(asRecord(item))),
    meta: readMeta(payload),
  };
}

async function requestGetProspect(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  query?: Record<string, unknown>;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const url = new URL(`${getprospectApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  try {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      apiKey: input.apiKey,
    });
    if (input.body) {
      headers.set("content-type", "application/json");
    }

    response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      signal: input.signal,
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `getprospect request failed: ${error.message}` : "getprospect request failed",
      error,
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw mapGetProspectError(response.status, readErrorMessage(payload), payload, input.phase);
  }

  return payload;
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return requiredResponseRecord(JSON.parse(text) as unknown, "getprospect response");
  } catch (error) {
    if (error instanceof ProviderRequestError && response.ok) {
      throw error;
    }
    if (response.ok) {
      throw new ProviderRequestError(502, "getprospect returned malformed JSON", error);
    }
    return { message: text };
  }
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item === undefined || item === null || item === "") {
        continue;
      }
      url.searchParams.append(key, String(item));
    }
    return;
  }
  url.searchParams.set(key, String(value));
}

function normalizeLeadItem(item: Record<string, unknown>): Record<string, unknown> {
  return {
    getProspectId: readRequiredString(item, "getProspectId"),
    firstName: readNullableString(item, "firstName"),
    lastName: readNullableString(item, "lastName"),
    contactInfo: readNullableString(item, "contactInfo"),
    summary: readNullableString(item, "summary"),
    companies: readArray(item, "companies"),
    lastUpdatedAt: readRequiredString(item, "lastUpdatedAt"),
    linkedin: readArray(item, "linkedin"),
    geolocation: readObject(item, "geolocation"),
    raw: item,
  };
}

function normalizeCompanyItem(item: Record<string, unknown>): Record<string, unknown> {
  return {
    getProspectId: readRequiredString(item, "getProspectId"),
    name: readRequiredString(item, "name"),
    domain: readRequiredString(item, "domain"),
    description: readNullableString(item, "description"),
    headquarters: readNullableString(item, "headquarters"),
    industry: readNullableString(item, "industry"),
    postalCode: readNullableString(item, "postalCode"),
    size: readNullableNumber(item, "size"),
    linkedin: readArray(item, "linkedin"),
    location: readObject(item, "location"),
    technologies: readArray(item, "technologies"),
    raw: item,
  };
}

function readMeta(payload: Record<string, unknown>): Record<string, unknown> {
  const meta = readObject(payload, "meta");
  const sort = readObject(meta, "sort");
  return {
    totalPages: readRequiredNumber(meta, "totalPages"),
    totalItems: readRequiredNumber(meta, "totalItems"),
    savedItems: readRequiredNumber(meta, "savedItems"),
    pageSize: readRequiredNumber(meta, "pageSize"),
    page: readRequiredNumber(meta, "page"),
    sort: {
      column: readRequiredString(sort, "column"),
      order: readRequiredString(sort, "order"),
    },
    additionalInfo: readObject(meta, "additionalInfo"),
  };
}

function assertFindEmailInput(input: Record<string, unknown>): void {
  const hasFullName = Boolean(optionalString(input.full_name));
  const hasSplitName = Boolean(optionalString(input.first_name) && optionalString(input.last_name));
  const hasDomainOrCompany = Boolean(optionalString(input.domain) || optionalString(input.company));

  if (!hasFullName && !hasSplitName) {
    throw new ProviderRequestError(400, "full_name or first_name and last_name must be provided");
  }

  if (!hasDomainOrCompany) {
    throw new ProviderRequestError(400, "domain or company must be provided");
  }
}

function readRequiredFilters(value: unknown): Record<string, unknown> {
  const filters = optionalRecord(value);
  if (!filters || Object.keys(filters).length === 0) {
    throw new ProviderRequestError(400, "filters must contain at least one search criterion");
  }

  return filters;
}

function readErrorMessage(payload: Record<string, unknown>): string {
  for (const key of ["message", "error"]) {
    const message = optionalString(payload[key]);
    if (message) {
      return message;
    }
  }
  if (Array.isArray(payload.errors)) {
    const firstError = optionalString(payload.errors[0]);
    if (firstError) {
      return firstError;
    }
  }
  return "getprospect request failed";
}

function mapGetProspectError(
  status: number,
  message: string,
  payload: Record<string, unknown>,
  phase: "validate" | "execute",
): ProviderRequestError {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 402 || (status >= 400 && status < 500)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readRequiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field) {
    throw new ProviderRequestError(502, `getprospect response missing ${key}`, value);
  }
  return field;
}

function readRequiredNumber(value: Record<string, unknown>, key: string): number {
  const field = optionalNumber(value[key]);
  if (field === undefined) {
    throw new ProviderRequestError(502, `getprospect response missing ${key}`, value);
  }
  return field;
}

function readNullableString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  if (field === null || field === undefined) {
    return null;
  }
  return typeof field === "string" ? field : null;
}

function readNullableBoolean(value: Record<string, unknown>, key: string): boolean | null {
  const field = value[key];
  if (field === null || field === undefined) {
    return null;
  }
  return optionalBoolean(field) ?? null;
}

function readNullableNumber(value: Record<string, unknown>, key: string): number | null {
  const field = value[key];
  if (field === null || field === undefined) {
    return null;
  }
  return optionalNumber(field) ?? null;
}

function readArray(value: Record<string, unknown>, key: string): unknown[] {
  const field = value[key];
  return Array.isArray(field) ? field : [];
}

function readObject(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(value[key]);
}

function asRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function requiredResponseRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return record;
}
