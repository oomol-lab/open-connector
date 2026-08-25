import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const paystackApiBaseUrl = "https://api.paystack.co";
const paystackValidationPath = "/customer";

interface PaystackResponseBody {
  data?: unknown;
  meta?: unknown;
  message?: unknown;
}

interface PaystackRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

type PaystackActionContext = ApiKeyProviderContext;
type PaystackActionHandler = (input: Record<string, unknown>, context: PaystackActionContext) => Promise<unknown>;

export const paystackActionHandlers: ProviderActionHandlers<"paystack", PaystackActionHandler> = {
  create_customer(input, context) {
    return createCustomer(input, context);
  },
  list_customers(input, context) {
    return listCustomers(input, context);
  },
  get_customer(input, context) {
    return getCustomer(input, context);
  },
  update_customer(input, context) {
    return updateCustomer(input, context);
  },
  initialize_transaction(input, context) {
    return initializeTransaction(input, context);
  },
  list_transactions(input, context) {
    return listTransactions(input, context);
  },
  get_transaction(input, context) {
    return getTransaction(input, context);
  },
  verify_transaction(input, context) {
    return verifyTransaction(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("paystack", paystackActionHandlers);

export async function validatePaystackCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await requestPaystack({
    path: paystackValidationPath,
    apiKey: input.apiKey,
    fetcher,
    phase: "validate",
    query: {
      page: 1,
      perPage: 1,
    },
  });
  const firstCustomer = Array.isArray(payload.data) ? optionalRecord(payload.data[0]) : undefined;
  const meta = optionalRecord(payload.meta);

  return {
    profile: {
      accountId: buildPaystackProviderAccountId(input.apiKey),
      displayName: buildPaystackAccountLabel(input.apiKey),
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: paystackApiBaseUrl,
      validationEndpoint: paystackValidationPath,
      totalCustomers: optionalInteger(meta?.total),
      firstCustomerCode: optionalString(firstCustomer?.customer_code),
      firstCustomerEmail: optionalString(firstCustomer?.email),
    }),
  };
}

async function listCustomers(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: "/customer",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    query: readListQuery(input),
  });
  return {
    customers: Array.isArray(payload.data) ? payload.data : [],
    meta: optionalRecord(payload.meta),
  };
}

async function createCustomer(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: "/customer",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    body: compactObject({
      email: optionalString(input.email),
      first_name: optionalString(input.first_name),
      last_name: optionalString(input.last_name),
      phone: optionalString(input.phone),
      metadata: optionalRecord(input.metadata),
    }),
  });

  return {
    customer: readRequiredDataObject(payload),
  };
}

async function getCustomer(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: `/customer/${encodePath(input.email_or_code)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    customer: readRequiredDataObject(payload),
  };
}

async function updateCustomer(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: `/customer/${encodePath(input.code)}`,
    method: "PUT",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    body: compactObject({
      first_name: optionalString(input.first_name),
      last_name: optionalString(input.last_name),
      phone: optionalString(input.phone),
      metadata: optionalRecord(input.metadata),
    }),
  });

  return {
    customer: readRequiredDataObject(payload),
  };
}

async function initializeTransaction(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: "/transaction/initialize",
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    body: compactObject({
      email: optionalString(input.email),
      amount: optionalInteger(input.amount),
      currency: optionalString(input.currency),
      reference: optionalString(input.reference),
      callback_url: optionalString(input.callback_url),
      metadata: optionalRecord(input.metadata),
    }),
  });

  return readRequiredDataObject(payload);
}

async function listTransactions(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: "/transaction",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    query: compactObject({
      ...readListQuery(input),
      status: optionalString(input.status),
      customer: optionalString(input.customer),
    }),
  });

  return {
    transactions: Array.isArray(payload.data) ? payload.data : [],
    meta: optionalRecord(payload.meta),
  };
}

async function getTransaction(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: `/transaction/${encodePath(input.id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    transaction: readRequiredDataObject(payload),
  };
}

async function verifyTransaction(input: Record<string, unknown>, context: PaystackActionContext): Promise<unknown> {
  const payload = await requestPaystack({
    path: `/transaction/verify/${encodePath(input.reference)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
  });

  return {
    transaction: readRequiredDataObject(payload),
  };
}

function readListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    page: optionalInteger(input.page),
    perPage: optionalInteger(input.perPage),
    from: optionalString(input.from),
    to: optionalString(input.to),
  });
}

async function requestPaystack(input: PaystackRequestInput): Promise<PaystackResponseBody> {
  const url = new URL(input.path, paystackApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Paystack request failed: ${error.message}` : "Paystack request failed",
    );
  }

  const payload = await readPaystackPayload(response);
  if (!response.ok) {
    throw mapPaystackError(response.status, payload, input.phase);
  }

  return payload;
}

async function readPaystackPayload(response: Response): Promise<PaystackResponseBody> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;
    return optionalRecord(payload) ?? {};
  } catch {
    throw new ProviderRequestError(502, "Paystack returned invalid JSON");
  }
}

function readRequiredDataObject(payload: PaystackResponseBody): Record<string, unknown> {
  return requiredRecord(payload.data, "data", providerOutputError);
}

function mapPaystackError(
  status: number,
  payload: PaystackResponseBody,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = optionalString(payload.message) ?? `Paystack request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function encodePath(value: unknown): string {
  return encodeURIComponent(String(value));
}

function buildPaystackProviderAccountId(apiKey: string): string {
  return `paystack:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

function buildPaystackAccountLabel(apiKey: string): string {
  return `Paystack Secret Key ${apiKey.slice(-4) || apiKey}`;
}

function providerOutputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Paystack response ${message}`);
}
