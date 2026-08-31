import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, requiredInputString } from "../provider-runtime.ts";

type QueryValue = string | number | undefined;
type TaxjarActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const taxjarApiBaseUrl = "https://api.taxjar.com/v2";
const validationEndpoint = "/categories";

export const taxjarActionHandlers: ProviderActionHandlers<"taxjar", TaxjarActionHandler> = {
  calculate_sales_tax_for_order(input, context) {
    return taxjarRequest({ path: "/taxes", method: "POST", body: input }, context);
  },
  show_tax_rates_for_location(input, context) {
    const zip = requiredInputString(input.zip, "zip");
    return taxjarRequest(
      {
        path: `/rates/${encodeURIComponent(zip)}`,
        method: "GET",
        query: compactObject({
          country: optionalString(input.country),
          state: optionalString(input.state),
          city: optionalString(input.city),
          street: optionalString(input.street),
        }),
      },
      context,
    );
  },
  list_tax_categories(_input, context) {
    return taxjarRequest({ path: "/categories", method: "GET" }, context);
  },
  list_nexus_regions(_input, context) {
    return taxjarRequest({ path: "/nexus/regions", method: "GET" }, context);
  },
  summarize_tax_rates_for_all_regions(_input, context) {
    return taxjarRequest({ path: "/summary_rates", method: "GET" }, context);
  },
  list_customers(input, context) {
    return taxjarRequest(
      {
        path: "/customers",
        method: "GET",
        query: compactObject({
          page: optionalNumber(input.page),
          per_page: optionalNumber(input.per_page),
        }),
      },
      context,
    );
  },
  show_customer(input, context) {
    const customerId = requiredInputString(input.customer_id, "customer_id");
    return taxjarRequest({ path: `/customers/${encodeURIComponent(customerId)}`, method: "GET" }, context);
  },
  create_customer(input, context) {
    return taxjarRequest({ path: "/customers", method: "POST", body: input }, context);
  },
  update_customer(input, context) {
    const customerId = requiredInputString(input.customer_id, "customer_id");
    return taxjarRequest({ path: `/customers/${encodeURIComponent(customerId)}`, method: "PUT", body: input }, context);
  },
  async delete_customer(input, context) {
    const customerId = requiredInputString(input.customer_id, "customer_id");
    const response = await taxjarRequest(
      { path: `/customers/${encodeURIComponent(customerId)}`, method: "DELETE" },
      context,
    );
    return { deleted: true, customer_id: customerId, response };
  },
  list_order_transactions(input, context) {
    return listTransactions("/transactions/orders", input, context);
  },
  show_order_transaction(input, context) {
    const transactionId = requiredInputString(input.transaction_id, "transaction_id");
    return taxjarRequest({ path: `/transactions/orders/${encodeURIComponent(transactionId)}`, method: "GET" }, context);
  },
  create_order_transaction(input, context) {
    return taxjarRequest({ path: "/transactions/orders", method: "POST", body: input }, context);
  },
  update_order_transaction(input, context) {
    const transactionId = requiredInputString(input.transaction_id, "transaction_id");
    return taxjarRequest(
      { path: `/transactions/orders/${encodeURIComponent(transactionId)}`, method: "PUT", body: input },
      context,
    );
  },
  async delete_order_transaction(input, context) {
    const transactionId = requiredInputString(input.transaction_id, "transaction_id");
    const response = await taxjarRequest(
      { path: `/transactions/orders/${encodeURIComponent(transactionId)}`, method: "DELETE" },
      context,
    );
    return { deleted: true, transaction_id: transactionId, response };
  },
  list_refund_transactions(input, context) {
    return listTransactions("/transactions/refunds", input, context);
  },
  show_refund_transaction(input, context) {
    const transactionId = requiredInputString(input.transaction_id, "transaction_id");
    return taxjarRequest(
      { path: `/transactions/refunds/${encodeURIComponent(transactionId)}`, method: "GET" },
      context,
    );
  },
  create_refund_transaction(input, context) {
    return taxjarRequest({ path: "/transactions/refunds", method: "POST", body: input }, context);
  },
  update_refund_transaction(input, context) {
    const transactionId = requiredInputString(input.transaction_id, "transaction_id");
    return taxjarRequest(
      { path: `/transactions/refunds/${encodeURIComponent(transactionId)}`, method: "PUT", body: input },
      context,
    );
  },
  async delete_refund_transaction(input, context) {
    const transactionId = requiredInputString(input.transaction_id, "transaction_id");
    const response = await taxjarRequest(
      { path: `/transactions/refunds/${encodeURIComponent(transactionId)}`, method: "DELETE" },
      context,
    );
    return { deleted: true, transaction_id: transactionId, response };
  },
  async validate_vat_number(input, context) {
    const vatNumber = requiredInputString(input.vat_number, "vat_number");
    const payload = await taxjarRequest({ path: "/validation", method: "GET", query: { vat: vatNumber } }, context);
    return { validation: payload };
  },
};

export async function validateTaxjarCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await taxjarRequest(
    { path: validationEndpoint, method: "GET" },
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
  );
  return {
    profile: {
      accountId: "taxjar-api-key",
      displayName: "TaxJar API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: taxjarApiBaseUrl,
      validationEndpoint,
    },
  };
}

function listTransactions(
  path: "/transactions/orders" | "/transactions/refunds",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return taxjarRequest(
    {
      path,
      method: "GET",
      query: compactObject({
        from_transaction_date: requiredInputString(input.from_transaction_date, "from_transaction_date"),
        to_transaction_date: requiredInputString(input.to_transaction_date, "to_transaction_date"),
        provider: optionalString(input.provider),
      }),
    },
    context,
  );
}

interface TaxjarRequestInput {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
}

async function taxjarRequest(
  input: TaxjarRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildTaxjarUrl(input), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-version": "2022-01-24",
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      isTimeoutLikeError(error) ? 504 : 502,
      isTimeoutLikeError(error)
        ? "TaxJar request timed out"
        : error instanceof Error
          ? `TaxJar request failed: ${error.message}`
          : "TaxJar request failed",
      error,
    );
  }
  if (!response.ok) {
    throw createTaxjarError(response.status, payload);
  }
  return optionalRecord(payload) ?? {};
}

function buildTaxjarUrl(input: TaxjarRequestInput): URL {
  const url = new URL(`${taxjarApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "TaxJar returned invalid JSON");
  }
}

function createTaxjarError(status: number, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `TaxJar request failed with ${status || 500}`;
  if (status === 400 || status === 401 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 403) return new ProviderRequestError(403, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  return optionalString(object?.detail) ?? optionalString(object?.error) ?? optionalString(object?.message);
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("timeout") ||
    error.message.toLowerCase().includes("timed out")
  );
}
