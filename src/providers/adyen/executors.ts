import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { AdyenActionName } from "./actions.ts";

import { compactObject, nullableString, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "adyen";
const adyenTestApiBaseUrl = "https://management-test.adyen.com/v3";
const adyenLiveApiBaseUrl = "https://management-live.adyen.com/v3";
const adyenApiKeyHelpUrl = "https://docs.adyen.com/development-resources/api-credentials#generate-api-key";

type AdyenEnvironment = "test" | "live";
type AdyenRequestPhase = "validate" | "execute";
type AdyenQueryValue = string | number | undefined;

interface AdyenActionContext {
  apiKey: string;
  environment: AdyenEnvironment;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AdyenListPayload {
  data: unknown[];
  itemsTotal?: unknown;
  pagesTotal?: unknown;
  _links?: unknown;
}

type AdyenActionHandler = (input: Record<string, unknown>, context: AdyenActionContext) => Promise<unknown>;

export const adyenActionHandlers: Record<AdyenActionName, AdyenActionHandler> = {
  get_api_credential(_input, context) {
    return getApiCredential(context);
  },
  list_companies(input, context) {
    return listCompanies(input, context);
  },
  get_company(input, context) {
    return getCompany(input, context);
  },
  list_company_merchants(input, context) {
    return listCompanyMerchants(input, context);
  },
  list_merchants(input, context) {
    return listMerchants(input, context);
  },
  get_merchant(input, context) {
    return getMerchant(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AdyenActionContext>({
  service,
  handlers: adyenActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AdyenActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      environment: readStoredEnvironment(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const environment = normalizeAdyenEnvironment(input.values.environment);
    const apiBaseUrl = buildAdyenApiBaseUrl(environment);
    const payload = await requestAdyenJson<unknown>({
      apiKey: input.apiKey,
      environment,
      path: "/me",
      fetcher,
      signal,
      phase: "validate",
    });
    const credential = normalizeApiCredential(payload);

    return {
      profile: {
        accountId: credential.id ? `adyen:${environment}:${credential.id}` : `adyen:${environment}:api_key`,
        displayName: buildAccountLabel(credential, environment),
        grantedScopes: credential.roles,
      },
      grantedScopes: credential.roles,
      metadata: compactObject({
        environment,
        apiBaseUrl,
        validationEndpoint: "/me",
        credentialHelpUrl: adyenApiKeyHelpUrl,
        credentialId: credential.id ?? undefined,
        username: credential.username ?? undefined,
        companyName: credential.companyName ?? undefined,
      }),
    };
  },
};

function buildAdyenApiBaseUrl(environment: AdyenEnvironment): string {
  return environment === "live" ? adyenLiveApiBaseUrl : adyenTestApiBaseUrl;
}

function normalizeAdyenEnvironment(value: string | undefined): AdyenEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "test") {
    return "test";
  }
  if (normalized === "live") {
    return "live";
  }

  throw new ProviderRequestError(400, "environment must be test or live");
}

function readStoredEnvironment(
  values: Record<string, string>,
  metadata: Record<string, unknown> | undefined,
): AdyenEnvironment {
  return normalizeAdyenEnvironment(optionalString(values.environment) ?? optionalString(metadata?.environment));
}

async function getApiCredential(context: AdyenActionContext): Promise<unknown> {
  const payload = await requestAdyenJson<unknown>({
    apiKey: context.apiKey,
    environment: context.environment,
    path: "/me",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { credential: normalizeApiCredential(payload) };
}

async function listCompanies(input: Record<string, unknown>, context: AdyenActionContext): Promise<unknown> {
  const payload = await requestAdyenJson<unknown>({
    apiKey: context.apiKey,
    environment: context.environment,
    path: "/companies",
    query: buildPaginationQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const listPayload = normalizeListPayload(payload, "companies");
  return {
    companies: listPayload.data.map(normalizeCompany),
    pagination: normalizePagination(listPayload),
  };
}

async function getCompany(input: Record<string, unknown>, context: AdyenActionContext): Promise<unknown> {
  const companyId = readRequiredString(input.companyId, "companyId");
  const payload = await requestAdyenJson<unknown>({
    apiKey: context.apiKey,
    environment: context.environment,
    path: `/companies/${encodeURIComponent(companyId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { company: normalizeCompany(payload) };
}

async function listCompanyMerchants(input: Record<string, unknown>, context: AdyenActionContext): Promise<unknown> {
  const companyId = readRequiredString(input.companyId, "companyId");
  const payload = await requestAdyenJson<unknown>({
    apiKey: context.apiKey,
    environment: context.environment,
    path: `/companies/${encodeURIComponent(companyId)}/merchants`,
    query: buildPaginationQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const listPayload = normalizeListPayload(payload, "merchants");
  return {
    merchants: listPayload.data.map(normalizeMerchant),
    pagination: normalizePagination(listPayload),
  };
}

async function listMerchants(input: Record<string, unknown>, context: AdyenActionContext): Promise<unknown> {
  const payload = await requestAdyenJson<unknown>({
    apiKey: context.apiKey,
    environment: context.environment,
    path: "/merchants",
    query: buildPaginationQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const listPayload = normalizeListPayload(payload, "merchants");
  return {
    merchants: listPayload.data.map(normalizeMerchant),
    pagination: normalizePagination(listPayload),
  };
}

async function getMerchant(input: Record<string, unknown>, context: AdyenActionContext): Promise<unknown> {
  const merchantId = readRequiredString(input.merchantId, "merchantId");
  const payload = await requestAdyenJson<unknown>({
    apiKey: context.apiKey,
    environment: context.environment,
    path: `/merchants/${encodeURIComponent(merchantId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { merchant: normalizeMerchant(payload) };
}

async function requestAdyenJson<T>(input: {
  apiKey: string;
  environment: AdyenEnvironment;
  path: string;
  query?: Record<string, AdyenQueryValue>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: AdyenRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const url = buildAdyenUrl(input.environment, input.path, input.query);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: adyenHeaders(input.apiKey),
      signal: input.signal,
    });
    payload = await readAdyenPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Adyen request failed: ${error.message}` : "Adyen request failed",
    );
  }

  if (!response.ok) {
    throw createAdyenError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload as T;
}

function buildAdyenUrl(environment: AdyenEnvironment, path: string, query: Record<string, AdyenQueryValue> = {}): URL {
  const url = new URL(`${buildAdyenApiBaseUrl(environment)}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function adyenHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function readAdyenPayload(response: Response): Promise<unknown> {
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

function createAdyenError(
  response: Response,
  payload: unknown,
  phase: AdyenRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractAdyenErrorMessage(payload) ?? response.statusText ?? "Adyen request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractAdyenErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.detail) ??
    optionalString(record?.title) ??
    optionalString(record?.message) ??
    optionalString(record?.errorCode)
  );
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, number | undefined> {
  return {
    pageNumber: optionalInteger(input.pageNumber),
    pageSize: optionalInteger(input.pageSize),
  };
}

function normalizeListPayload(payload: unknown, name: string): AdyenListPayload {
  const record = optionalRecord(payload);
  if (!record || !Array.isArray(record.data)) {
    throw new ProviderRequestError(502, `invalid adyen ${name} response`);
  }
  return {
    data: record.data,
    itemsTotal: record.itemsTotal,
    pagesTotal: record.pagesTotal,
    _links: record._links,
  };
}

function normalizePagination(payload: AdyenListPayload): Record<string, unknown> {
  return {
    itemsTotal: nullableInteger(payload.itemsTotal),
    pagesTotal: nullableInteger(payload.pagesTotal),
    links: optionalRecord(payload._links) ?? null,
  };
}

function normalizeApiCredential(payload: unknown): Record<string, unknown> & { roles: string[] } {
  const record = readResponseObject(payload, "API credential");
  return {
    id: nullableString(record.id) ?? null,
    username: nullableString(record.username) ?? null,
    active: typeof record.active === "boolean" ? record.active : null,
    companyName: nullableString(record.companyName) ?? null,
    description: nullableString(record.description) ?? null,
    roles: readStringArray(record.roles),
    raw: record,
  };
}

function normalizeCompany(payload: unknown): Record<string, unknown> {
  const record = readResponseObject(payload, "company");
  return {
    id: nullableString(record.id) ?? null,
    name: nullableString(record.name) ?? null,
    status: nullableString(record.status) ?? null,
    reference: nullableString(record.reference) ?? null,
    description: nullableString(record.description) ?? null,
    raw: record,
  };
}

function normalizeMerchant(payload: unknown): Record<string, unknown> {
  const record = readResponseObject(payload, "merchant");
  return {
    id: nullableString(record.id) ?? null,
    name: nullableString(record.name) ?? null,
    status: nullableString(record.status) ?? null,
    reference: nullableString(record.reference) ?? null,
    companyId: nullableString(record.companyId) ?? null,
    raw: record,
  };
}

function readResponseObject(payload: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `invalid adyen ${name} response`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function buildAccountLabel(credential: Record<string, unknown>, environment: AdyenEnvironment): string {
  const companyName = optionalString(credential.companyName);
  if (companyName) {
    return `Adyen ${companyName} (${environment})`;
  }
  const username = optionalString(credential.username);
  if (username) {
    return `Adyen ${username} (${environment})`;
  }
  return `Adyen API Key (${environment})`;
}
