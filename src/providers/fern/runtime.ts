import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FernActionName } from "./actions.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const fernApiBaseUrl = "https://api.fernhq.com";
const fernValidationPath = "/customers?pageSize=1";

type FernRequestPhase = "validate" | "execute";

export const fernActionHandlers: Record<FernActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_customers(input, context) {
    return fernGetJson(buildListCustomersPath(input), context, "execute");
  },
  get_customer(input, context) {
    return fernGetJson(buildGetCustomerPath(input), context, "execute");
  },
  list_payment_accounts(input, context) {
    return fernGetJson(buildListPaymentAccountsPath(input), context, "execute");
  },
  get_payment_account(input, context) {
    const paymentAccountId = readRequiredString(input, "paymentAccountId", "payment account ID");
    return fernGetJson(`/payment-accounts/${encodeURIComponent(paymentAccountId)}`, context, "execute");
  },
  get_exchange_rate(input, context) {
    return fernGetJson(buildExchangeRatePath(input), context, "execute");
  },
  list_transactions(input, context) {
    return fernGetJson(buildListTransactionsPath(input), context, "execute");
  },
  get_transaction(input, context) {
    const transactionId = readRequiredString(input, "transactionId", "transaction ID");
    return fernGetJson(`/transactions/${encodeURIComponent(transactionId)}`, context, "execute");
  },
};

export async function validateFernCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await fernGetJson(fernValidationPath, { apiKey, fetcher, signal }, "validate");
  return {
    profile: {
      displayName: "Fern API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: fernApiBaseUrl,
      validationEndpoint: fernValidationPath,
      validationMode: "customer_list_probe",
    },
  };
}

function buildListCustomersPath(input: Record<string, unknown>): string {
  const url = new URL("/customers", fernApiBaseUrl);
  setOptionalQuery(url, "pageToken", optionalString(input.pageToken));
  setOptionalQuery(url, "pageSize", optionalInteger(input.pageSize));
  setOptionalQuery(url, "organizationId", optionalString(input.organizationId));
  return `${url.pathname}${url.search}`;
}

function buildGetCustomerPath(input: Record<string, unknown>): string {
  const customerId = readRequiredString(input, "customerId", "customer ID");
  const url = new URL(`/customers/${encodeURIComponent(customerId)}`, fernApiBaseUrl);
  setOptionalQuery(url, "includeVerification", optionalBoolean(input.includeVerification));
  setOptionalQuery(url, "includePaymentMethods", optionalBoolean(input.includePaymentMethods));
  return `${url.pathname}${url.search}`;
}

function buildListPaymentAccountsPath(input: Record<string, unknown>): string {
  const url = new URL("/payment-accounts", fernApiBaseUrl);
  setOptionalQuery(url, "customerId", optionalString(input.customerId));
  setOptionalQuery(url, "pageToken", optionalString(input.pageToken));
  setOptionalQuery(url, "pageSize", optionalInteger(input.pageSize));
  return `${url.pathname}${url.search}`;
}

function buildExchangeRatePath(input: Record<string, unknown>): string {
  const url = new URL("/exchange-rates", fernApiBaseUrl);
  setOptionalQuery(url, "sourceCurrency", optionalString(input.sourceCurrency));
  setOptionalQuery(url, "sourcePaymentMethod", optionalString(input.sourcePaymentMethod));
  setOptionalQuery(url, "sourceAmount", optionalString(input.sourceAmount));
  setOptionalQuery(url, "destinationPaymentMethod", optionalString(input.destinationPaymentMethod));
  setOptionalQuery(url, "destinationCurrency", optionalString(input.destinationCurrency));
  return `${url.pathname}${url.search}`;
}

function buildListTransactionsPath(input: Record<string, unknown>): string {
  const url = new URL("/transactions", fernApiBaseUrl);
  setOptionalQuery(url, "pageToken", optionalString(input.pageToken));
  setOptionalQuery(url, "pageSize", optionalInteger(input.pageSize));
  setOptionalQuery(url, "customerId", optionalString(input.customerId));
  setOptionalQuery(url, "paymentAccountId", optionalString(input.paymentAccountId));
  setOptionalQuery(url, "organizationId", optionalString(input.organizationId));
  return `${url.pathname}${url.search}`;
}

function setOptionalQuery(url: URL, key: string, value: string | number | boolean | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

async function fernGetJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: FernRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, fernApiBaseUrl), {
      method: "GET",
      headers: fernHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readFernPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Fern request failed: ${error.message}` : "Fern request failed",
    );
  }

  if (!response.ok) {
    throw createFernError(response, payload, phase);
  }

  return payload;
}

function fernHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readFernPayload(response: Response): Promise<unknown> {
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

function createFernError(response: Response, payload: unknown, phase: FernRequestPhase): ProviderRequestError {
  const message = extractFernErrorMessage(payload) ?? `Fern request failed with status ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractFernErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function readRequiredString(input: Record<string, unknown>, key: string, label: string): string {
  return requiredString(input[key], label, (message) => new ProviderRequestError(400, message));
}
