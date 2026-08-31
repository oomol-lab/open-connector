import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "altoviz";
const altovizApiBaseUrl = "https://api.altoviz.com";

type AltovizPhase = "validate" | "execute";
type AltovizActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const altovizActionHandlers: ProviderActionHandlers<"altoviz", AltovizActionHandler> = {
  list_customers: listCustomers,
  get_customer: getCustomer,
  find_customers: findCustomers,
  create_customer: createCustomer,
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, altovizActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await requestAltoviz("/v1/Users/me", {
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const user = readObject(response.payload, "Altoviz user");
    const displayName = optionalString(user.displayName);
    const email = optionalString(user.email);
    return {
      profile: {
        accountId: email ?? "altoviz-api-key",
        displayName: displayName ?? email ?? "Altoviz API Key",
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: altovizApiBaseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: altovizApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});

async function listCustomers(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const pageIndex = optionalInteger(input.pageIndex) ?? 1;
  const pageSize = optionalInteger(input.pageSize) ?? 10;
  const url = new URL("/v1/Customers", altovizApiBaseUrl);
  for (const [key, value] of Object.entries(
    compactObject({
      PageIndex: pageIndex,
      PageSize: pageSize,
      OrderBy: optionalString(input.orderBy),
      query: optionalString(input.query),
    }),
  )) {
    url.searchParams.set(key, String(value));
  }
  const response = await requestAltoviz(url, { ...context, phase: "execute" });
  return {
    customers: readArray(response.payload, "Altoviz customers"),
    pagination: compactObject({
      pageIndex: readIntegerHeader(response.headers, "x-page-index") ?? pageIndex,
      pageSize: readIntegerHeader(response.headers, "x-page-size") ?? pageSize,
      pageCount: readIntegerHeader(response.headers, "x-page-count"),
      recordCount: readIntegerHeader(response.headers, "x-record-count"),
      next: response.headers.get("x-page-next") || undefined,
      previous: response.headers.get("x-page-prev") || undefined,
    }),
  };
}

async function getCustomer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const customerId = positiveInteger(input.customerId, "customerId", providerInputError);
  const response = await requestAltoviz(`/v1/Customers/${encodeURIComponent(String(customerId))}`, {
    ...context,
    phase: "execute",
  });
  return { customer: readObject(response.payload, "Altoviz customer") };
}

async function findCustomers(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const query = compactObject({
    email: optionalString(input.email),
    internalId: optionalString(input.internalId),
    number: optionalString(input.number),
  });
  if (Object.keys(query).length === 0) {
    throw new ProviderRequestError(400, "email, internalId, or number is required");
  }
  const url = new URL("/v1/Customers/Find", altovizApiBaseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await requestAltoviz(url, { ...context, phase: "execute" });
  return { customers: readArray(response.payload, "Altoviz customers") };
}

async function createCustomer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await requestAltoviz("/v1/Customers", {
    ...context,
    phase: "execute",
    init: { method: "POST", body: JSON.stringify(input) },
  });
  return { customer: readObject(response.payload, "Altoviz customer") };
}

interface AltovizRequestContext extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  phase: AltovizPhase;
  init?: RequestInit;
}

async function requestAltoviz(
  path: string | URL,
  context: AltovizRequestContext,
): Promise<{ payload: unknown; headers: Headers }> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, altovizApiBaseUrl), {
      ...context.init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
        ...context.init?.headers,
      },
      signal: context.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Altoviz request failed: ${error.message}` : "Altoviz request failed",
    );
  }
  if (!response.ok) throw mapAltovizError(response.status, payload, context.phase);
  return { payload, headers: response.headers };
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Altoviz returned malformed JSON");
  }
}

function mapAltovizError(status: number, payload: unknown, phase: AltovizPhase): ProviderRequestError {
  const message = optionalString(optionalRecord(payload)?.message) ?? `Altoviz request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 400 || status === 404) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readObject(payload: unknown, label: string): Record<string, unknown> {
  return requiredRecord(payload, `${label} response`, providerResponseError);
}

function readArray(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, `${label} response must be an array`);
  return payload;
}

function readIntegerHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  const parsed = value === null ? Number.NaN : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
