import type { CredentialValidationResult, ExecutionResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { KeyObject } from "node:crypto";

import { createHash, createPrivateKey, createSign } from "node:crypto";
import { optionalNumber, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  toProviderExecutionError,
} from "../provider-runtime.ts";

export const waffoApiBaseUrl = "https://api.waffo.ai";

export interface WaffoCredential {
  merchantId: string;
  privateKey: KeyObject;
}

export interface WaffoActionContext {
  credential: WaffoCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface WaffoRequestInput {
  path: string;
  body: Record<string, unknown>;
  context: WaffoActionContext;
  phase: "validate" | "execute";
}

export const waffoActionHandlers: ProviderActionHandlers<"waffo", ProviderRuntimeHandler<WaffoActionContext>> = {
  async create_store(input, context) {
    const data = await requestWaffoData({
      path: "/v1/actions/store/create-store",
      body: input,
      context,
      phase: "execute",
    });
    return { store: requireOutputObject(data.store, "Waffo store") };
  },
  async list_stores(_input, context) {
    const data = await queryWaffoData(
      `query ListStores {
        stores {
          id name status slug supportEmail website prodEnabled createdAt updatedAt
        }
      }`,
      {},
      context,
    );
    const stores = requireOutputArray(data.stores, "Waffo stores");
    return { stores, count: stores.length };
  },
  async create_one_time_product(input, context) {
    const data = await requestWaffoData({
      path: "/v1/actions/onetime-product/create-product",
      body: normalizeProductInput(input, false),
      context,
      phase: "execute",
    });
    return { product: requireOutputObject(data.product, "Waffo one-time product") };
  },
  async create_subscription_product(input, context) {
    const data = await requestWaffoData({
      path: "/v1/actions/subscription-product/create-product",
      body: normalizeProductInput(input, true),
      context,
      phase: "execute",
    });
    return { product: requireOutputObject(data.product, "Waffo subscription product") };
  },
  async list_products(input, context) {
    const productType = requireProductType(input.productType);
    const { limit, offset } = readPagination(input);
    const filter = buildGraphqlFilter(input, [["status", "status"]], [`storeId: { eq: $storeId }`]);
    const resource = productType === "one_time" ? "onetimeProducts" : "subscriptionProducts";
    const billingPeriod = productType === "subscription" ? "billingPeriod" : "";
    const data = await queryWaffoData(
      `query ListProducts($storeId: String!, $limit: Int!, $offset: Int!) {
        items: ${resource}(filter: ${filter}, limit: $limit, offset: $offset) {
          id name description ${billingPeriod} prices status version media successUrl metadata createdAt updatedAt
        }
        total: ${resource}Count(filter: ${filter})
      }`,
      { storeId: requiredString(input.storeId, "storeId", providerInputError), limit, offset },
      context,
    );
    const products = requireOutputObjectArray(data.items, "Waffo products").map((product) => ({
      ...product,
      productType,
    }));
    return { products, total: requireOutputNumber(data.total, "product total"), limit, offset };
  },
  async update_product(input, context) {
    const productType = requireProductType(input.productType);
    const { productType: _, ...fields } = normalizeProductUpdate(input, productType);
    const data = await requestWaffoData({
      path: productActionPath(productType, "update-product"),
      body: fields,
      context,
      phase: "execute",
    });
    return { product: requireOutputObject(data.product, "Waffo product") };
  },
  async set_product_status(input, context) {
    const productType = requireProductType(input.productType);
    const { productType: _, ...body } = input;
    const data = await requestWaffoData({
      path: productActionPath(productType, "update-status"),
      body,
      context,
      phase: "execute",
    });
    return { product: requireOutputObject(data.product, "Waffo product") };
  },
  async publish_product(input, context) {
    const productType = requireProductType(input.productType);
    const data = await requestWaffoData({
      path: productActionPath(productType, "publish-product"),
      body: { id: input.id },
      context,
      phase: "execute",
    });
    return { product: requireOutputObject(data.product, "Waffo product") };
  },
  async create_checkout_session(input, context) {
    const data = await requestWaffoData({
      path: "/v1/actions/checkout/create-session",
      body: normalizeCheckoutInput(input),
      context,
      phase: "execute",
    });
    return {
      sessionId: requireOutputString(data.sessionId, "sessionId"),
      checkoutUrl: requireOutputString(data.checkoutUrl, "checkoutUrl"),
      expiresAt: requireOutputString(data.expiresAt, "expiresAt"),
    };
  },
  async cancel_subscription(input, context) {
    const data = await requestWaffoData({
      path: "/v1/actions/subscription-order/cancel-order",
      body: input,
      context,
      phase: "execute",
    });
    return {
      orderId: requireOutputString(data.orderId, "orderId"),
      status: requireOutputString(data.status, "status"),
    };
  },
  async search_orders(input, context) {
    const orderType = requireOrderType(input.orderType);
    const { limit, offset } = readPagination(input);
    const filter = buildGraphqlFilter(input, [
      ["status", "status"],
      ["orderMerchantExternalId", "orderMerchantExternalId"],
    ]);
    const resource = orderType === "one_time" ? "onetimeOrders" : "subscriptionOrders";
    const fields =
      orderType === "one_time"
        ? "currency priceSnapshot { currency subtotal taxAmount total taxCategory } metadata"
        : "billingPeriod";
    const filterArgument = filter ? `, filter: ${filter}` : "";
    const data = await queryWaffoData(
      `query SearchOrders($storeId: String!, $limit: Int!, $offset: Int!) {
        items: ${resource}(storeId: $storeId${filterArgument}, limit: $limit, offset: $offset) {
          id buyerEmail status orderMerchantExternalId createdAt ${fields}
        }
        total: ${resource}Count(storeId: $storeId${filterArgument})
      }`,
      { storeId: requiredString(input.storeId, "storeId", providerInputError), limit, offset },
      context,
    );
    const orders = requireOutputObjectArray(data.items, "Waffo orders").map((order) => ({
      ...order,
      orderType,
    }));
    return { orders, total: requireOutputNumber(data.total, "order total"), limit, offset };
  },
  async search_payments(input, context) {
    validatePaymentSearchInput(input);
    const { limit, offset } = readPagination(input);
    const paymentId = optionalString(input.paymentId);
    if (paymentId) {
      const data = await queryWaffoData(
        `query FindPayment($paymentId: String!) {
          item: payment(id: $paymentId) {
            id orderId status refundStatus orderMerchantExternalId
            snapshotAmountDetails { subtotal taxAmount total currency }
            createdAt
          }
        }`,
        { paymentId },
        context,
      );
      const payment = optionalRecord(data.item);
      return { payments: payment ? [payment] : [], total: payment ? 1 : 0, limit, offset };
    }

    const filter = buildGraphqlFilter(input, [
      ["status", "status"],
      ["orderMerchantExternalId", "orderMerchantExternalId"],
    ]);
    const filterArgument = filter
      ? `(filter: ${filter}, limit: $limit, offset: $offset)`
      : `(limit: $limit, offset: $offset)`;
    const countArgument = filter ? `(filter: ${filter})` : "";
    const data = await queryWaffoData(
      `query SearchPayments($limit: Int!, $offset: Int!) {
        items: payments${filterArgument} {
          id orderId status refundStatus orderMerchantExternalId
          snapshotAmountDetails { subtotal taxAmount total currency }
          createdAt
        }
        total: paymentsCount${countArgument}
      }`,
      { limit, offset },
      context,
    );
    return {
      payments: requireOutputArray(data.items, "Waffo payments"),
      total: requireOutputNumber(data.total, "payment total"),
      limit,
      offset,
    };
  },
  async search_refund_tickets(input, context) {
    const { limit, offset } = readPagination(input);
    const filter = buildGraphqlFilter(input, [
      ["status", "status"],
      ["paymentId", "subjectId"],
      ["refundTicketMerchantExternalId", "refundTicketMerchantExternalId"],
    ]);
    const filterArgument = filter
      ? `(filter: ${filter}, limit: $limit, offset: $offset)`
      : `(limit: $limit, offset: $offset)`;
    const countArgument = filter ? `(filter: ${filter})` : "";
    const data = await queryWaffoData(
      `query SearchRefundTickets($limit: Int!, $offset: Int!) {
        items: refundTickets${filterArgument} {
          id paymentId status requestedAmount reason refundTicketMerchantExternalId
          versionData { reason requestedAmount { amount currency } }
          reviewNote rejectReason executedAt createdAt
        }
        total: refundTicketsCount${countArgument}
      }`,
      { limit, offset },
      context,
    );
    return {
      refundTickets: requireOutputArray(data.items, "Waffo refund tickets"),
      total: requireOutputNumber(data.total, "refund ticket total"),
      limit,
      offset,
    };
  },
  async create_refund_ticket(input, context) {
    const data = await requestWaffoData({
      path: "/api/actions/refund-ticket/create-ticket",
      body: normalizeRefundInput(input),
      context,
      phase: "execute",
    });
    return { ticket: requireOutputObject(data.ticket, "Waffo refund ticket") };
  },
  async resubmit_refund_ticket(input, context) {
    const data = await requestWaffoData({
      path: "/api/actions/refund-ticket/resubmit-ticket",
      body: normalizeRefundInput(input),
      context,
      phase: "execute",
    });
    return { ticket: requireOutputObject(data.ticket, "Waffo refund ticket") };
  },
  run_query(input, context) {
    return requestWaffoJson({ path: "/v1/graphql", body: input, context, phase: "execute" });
  },
};

export async function validateWaffoCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = readWaffoCredential(values);
  const payload = await requestWaffoJson({
    path: "/v1/graphql",
    body: { query: "query ConnectorCredentialCheck { stores { id name status } }" },
    context: { credential, fetcher, signal },
    phase: "validate",
  });
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new ProviderRequestError(400, readWaffoErrorMessage(payload) ?? "Waffo credential validation query failed");
  }

  return {
    profile: {
      accountId: credential.merchantId,
      displayName: `Waffo ${credential.merchantId}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: waffoApiBaseUrl,
      merchantId: credential.merchantId,
      validationEndpoint: "/v1/graphql",
    },
  };
}

export function readWaffoCredential(values: Record<string, string>): WaffoCredential {
  const merchantId = requiredString(values.merchantId, "merchantId", providerInputError);
  const pem = requiredString(values.privateKey, "privateKey", providerInputError).replaceAll("\\n", "\n");
  try {
    const privateKey = createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== "rsa") throw new Error("not RSA");
    return { merchantId, privateKey };
  } catch {
    throw new ProviderRequestError(400, "privateKey must be a valid RSA private key in PEM format");
  }
}

export async function requestWaffoJson(input: WaffoRequestInput): Promise<Record<string, unknown>> {
  const body = JSON.stringify(input.body);
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  });
  applyWaffoRequestHeaders({
    credential: input.context.credential,
    method: "POST",
    path: input.path,
    body,
    headers,
  });

  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(`${waffoApiBaseUrl}${input.path}`, {
      method: "POST",
      headers,
      body,
      redirect: "error",
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Waffo returned invalid JSON",
      invalidJsonFallback: (text) => ({ message: text }),
    });
    if (!response.ok) throw buildWaffoError(response.status, payload, input.phase);
    return requireOutputObject(payload, "Waffo response");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Waffo request timed out");
    }
    throw new ProviderRequestError(502, "Waffo request failed");
  } finally {
    timeout.cleanup();
  }
}

export function applyWaffoRequestHeaders(input: {
  credential: WaffoCredential;
  method: string;
  path: string;
  body: string;
  headers: Headers;
  now?: Date;
}): void {
  applyWaffoIdempotencyKey(input);
  const timestamp = String(Math.floor((input.now ?? new Date()).getTime() / 1000));
  const bodyHash = createHash("sha256").update(input.body).digest("base64");
  const canonicalRequest = `${input.method.toUpperCase()}\n${input.path}\n${timestamp}\n${bodyHash}`;
  const signer = createSign("RSA-SHA256");
  signer.update(canonicalRequest);
  signer.end();
  input.headers.set("x-merchant-id", input.credential.merchantId);
  input.headers.set("x-timestamp", timestamp);
  input.headers.set("x-signature", signer.sign(input.credential.privateKey).toString("base64"));
}

export function mapWaffoExecutionError(error: unknown): ExecutionResult {
  return toProviderExecutionError(error, "Waffo request failed");
}

async function requestWaffoData(input: WaffoRequestInput): Promise<Record<string, unknown>> {
  const payload = await requestWaffoJson(input);
  return requireOutputObject(payload.data, "Waffo response data");
}

async function queryWaffoData(
  query: string,
  variables: Record<string, unknown>,
  context: WaffoActionContext,
): Promise<Record<string, unknown>> {
  const payload = await requestWaffoJson({
    path: "/v1/graphql",
    body: { query, variables },
    context,
    phase: "execute",
  });
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new ProviderRequestError(502, readWaffoErrorMessage(payload) ?? "Waffo GraphQL query failed");
  }
  return requireOutputObject(payload.data, "Waffo GraphQL data");
}

function buildGraphqlFilter(
  input: Record<string, unknown>,
  stringFields: ReadonlyArray<readonly [string, string]>,
  baseFields: string[] = [],
): string | undefined {
  const fields = [...baseFields];
  for (const [inputField, apiField] of stringFields) {
    const value = optionalString(input[inputField]);
    if (value) fields.push(`${apiField}: { eq: ${JSON.stringify(value)} }`);
  }
  const createdAt = [
    ["gte", optionalString(input.createdAfter)],
    ["lte", optionalString(input.createdBefore)],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([operator, value]) => `${operator}: ${JSON.stringify(value)}`);
  if (createdAt.length > 0) fields.push(`createdAt: { ${createdAt.join(" ")} }`);
  return fields.length > 0 ? `{ ${fields.join(" ")} }` : undefined;
}

function readPagination(input: Record<string, unknown>): { limit: number; offset: number } {
  return { limit: optionalNumber(input.limit) ?? 50, offset: optionalNumber(input.offset) ?? 0 };
}

function requireProductType(value: unknown): "one_time" | "subscription" {
  if (value === "one_time" || value === "subscription") return value;
  throw providerInputError("productType must be one_time or subscription");
}

function requireOrderType(value: unknown): "one_time" | "subscription" {
  if (value === "one_time" || value === "subscription") return value;
  throw providerInputError("orderType must be one_time or subscription");
}

function productActionPath(
  productType: "one_time" | "subscription",
  operation: "update-product" | "update-status" | "publish-product",
): string {
  const resource = productType === "one_time" ? "onetime-product" : "subscription-product";
  return `/v1/actions/${resource}/${operation}`;
}

function normalizeProductInput(input: Record<string, unknown>, subscription: boolean): Record<string, unknown> {
  const output = { ...input, prices: normalizePrices(input.prices) };
  if (Object.hasOwn(input, "successUrl")) validateProductSuccessUrl(input.successUrl);
  if (Object.hasOwn(input, "metadata")) {
    const metadata = requiredRecord(input.metadata, "metadata", providerInputError);
    if (subscription) validateTrialDays(metadata);
    else if (Object.keys(metadata).length > 50)
      throw providerInputError("product metadata must contain at most 50 keys");
  }
  return output;
}

function normalizeProductUpdate(
  input: Record<string, unknown>,
  productType: "one_time" | "subscription",
): Record<string, unknown> {
  const editableFields = ["name", "description", "prices", "media", "successUrl", "metadata", "billingPeriod"];
  if (!editableFields.some((field) => Object.hasOwn(input, field))) {
    throw providerInputError("at least one product field must be provided");
  }
  if (productType === "one_time" && Object.hasOwn(input, "billingPeriod")) {
    throw providerInputError("billingPeriod is only supported for subscription products");
  }
  const output = { ...input };
  if (Object.hasOwn(input, "prices")) output.prices = normalizePrices(input.prices);
  if (Object.hasOwn(input, "successUrl")) validateProductSuccessUrl(input.successUrl);
  if (productType === "subscription" && Object.hasOwn(input, "metadata")) {
    validateTrialDays(requiredRecord(input.metadata, "metadata", providerInputError));
  }
  return output;
}

function normalizePrices(value: unknown): Record<string, unknown> {
  const prices = requiredRecord(value, "prices", providerInputError);
  const entries = Object.entries(prices);
  if (entries.length === 0)
    throw providerInputError("prices must contain at least one uppercase ISO 4217 currency code");
  return Object.fromEntries(
    entries.map(([currency, price]) => {
      if (!isUppercaseCode(currency, 3)) {
        throw providerInputError("prices must contain at least one uppercase ISO 4217 currency code");
      }
      const item = requiredRecord(price, `prices.${currency}`, providerInputError);
      return [currency, { ...item, amount: normalizePositiveAmount(item.amount) }];
    }),
  );
}

function normalizeCheckoutInput(input: Record<string, unknown>): Record<string, unknown> {
  if (Object.hasOwn(input, "includePaymentMethods") && Object.hasOwn(input, "excludePaymentMethods")) {
    throw providerInputError("includePaymentMethods and excludePaymentMethods cannot be used together");
  }
  const output: Record<string, unknown> = {
    ...input,
    currency: normalizeCurrency(input.currency, "currency", 3),
  };
  if (Object.hasOwn(input, "priceSnapshot")) {
    const price = requiredRecord(input.priceSnapshot, "priceSnapshot", providerInputError);
    output.priceSnapshot = { ...price, amount: normalizePositiveAmount(price.amount) };
  }
  if (Object.hasOwn(input, "billingDetail")) {
    const billing = requiredRecord(input.billingDetail, "billingDetail", providerInputError);
    output.billingDetail = {
      ...billing,
      country: normalizeCurrency(billing.country, "billingDetail.country", 2),
    };
  }
  return output;
}

function normalizeRefundInput(input: Record<string, unknown>): Record<string, unknown> {
  const amount = requiredRecord(input.requestedAmount, "requestedAmount", providerInputError);
  return {
    ...input,
    requestedAmount: {
      ...amount,
      amount: normalizePositiveAmount(amount.amount),
      currency: normalizeCurrency(amount.currency, "requestedAmount.currency", 3),
    },
  };
}

function normalizePositiveAmount(value: unknown): string {
  const amount = requiredString(value, "amount", providerInputError);
  const parts = amount.split(".");
  const digitsOnly = parts.every((part) => [...part].every((character) => character >= "0" && character <= "9"));
  if (parts.length > 2 || !parts[0] || (parts.length === 2 && !parts[1]) || !digitsOnly || Number(amount) <= 0) {
    throw providerInputError("amount must be a positive decimal string");
  }
  return amount;
}

function normalizeCurrency(value: unknown, fieldName: string, length: number): string {
  const currency = requiredString(value, fieldName, providerInputError).toUpperCase();
  if (!isUppercaseCode(currency, length)) throw providerInputError(`${fieldName} must be an uppercase currency code`);
  return currency;
}

function isUppercaseCode(value: string, length: number): boolean {
  return value.length === length && [...value].every((character) => character >= "A" && character <= "Z");
}

function validateProductSuccessUrl(value: unknown): void {
  if (value === null || value === "") return;
  if (typeof value !== "string") throw providerInputError("successUrl must be a valid HTTP(S) URL");
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return;
  } catch {
    // Return the normalized field error below.
  }
  throw providerInputError("successUrl must be a valid HTTP(S) URL");
}

function validateTrialDays(metadata: Record<string, unknown>): void {
  const trialDays = metadata.trialDays;
  if (
    trialDays !== undefined &&
    (typeof trialDays !== "number" || !Number.isInteger(trialDays) || trialDays < 1 || trialDays > 365)
  ) {
    throw providerInputError("metadata.trialDays must be an integer from 1 to 365");
  }
}

function validatePaymentSearchInput(input: Record<string, unknown>): void {
  if (
    Object.hasOwn(input, "paymentId") &&
    ["status", "orderMerchantExternalId", "createdAfter", "createdBefore", "limit", "offset"].some((field) =>
      Object.hasOwn(input, field),
    )
  ) {
    throw providerInputError("paymentId cannot be combined with other payment search parameters");
  }
}

function applyWaffoIdempotencyKey(input: {
  credential: WaffoCredential;
  method: string;
  path: string;
  body: string;
  headers: Headers;
}): void {
  if (input.method.toUpperCase() !== "POST" || input.path === "/v1/graphql" || input.headers.has("x-idempotency-key")) {
    return;
  }
  const hash = createHash("sha256").update(`${input.credential.merchantId}${input.path}${input.body}`).digest("hex");
  input.headers.set("x-idempotency-key", `waffo-${hash}`);
}

function buildWaffoError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readWaffoErrorMessage(payload) ?? `Waffo request failed with ${status}`;
  if (status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if (status === 403) return new ProviderRequestError(403, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 409 && (message.includes("already being processed") || message.includes("not yet fully processed"))) {
    return new ProviderRequestError(409, message, payload);
  }
  if (status === 404) return new ProviderRequestError(404, message, payload);
  if (status === 400 || status === 409) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readWaffoErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) return undefined;
  const errors = Array.isArray(object.errors) ? object.errors : [];
  for (const error of errors) {
    const message = optionalString(optionalRecord(error)?.message);
    if (message) return message;
  }
  return optionalString(object.message) ?? optionalString(object.error);
}

function requireOutputObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `${label} is missing`);
  return object;
}

function requireOutputArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${label} is missing`);
  return value;
}

function requireOutputObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  return requireOutputArray(value, label).map((item) => requireOutputObject(item, label));
}

function requireOutputNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") throw new ProviderRequestError(502, `Waffo response is missing ${fieldName}`);
  return value;
}

function requireOutputString(value: unknown, fieldName: string): string {
  const string = optionalString(value);
  if (!string) throw new ProviderRequestError(502, `Waffo response is missing ${fieldName}`);
  return string;
}
