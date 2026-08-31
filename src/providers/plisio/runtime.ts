import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

type PlisioActionContext = ApiKeyProviderContext;
type PlisioActionHandler = (input: Record<string, unknown>, context: PlisioActionContext) => Promise<unknown>;
type PlisioRequestMode = "validate" | "execute";
type PlisioQueryValue = string | number | boolean | undefined;

interface PlisioLinksPayload {
  self?: unknown;
  next?: unknown;
  prev?: unknown;
}

export const plisioApiBaseUrl = "https://api.plisio.net";

export const plisioActionHandlers: ProviderActionHandlers<"plisio", PlisioActionHandler> = {
  create_invoice(input, context) {
    return createInvoice(input, context);
  },
  list_operations(input, context) {
    return listOperations(input, context);
  },
  get_operation(input, context) {
    return getOperation(input, context);
  },
  get_balance(input, context) {
    return getBalance(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("plisio", plisioActionHandlers);

export async function validatePlisioCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPlisioData("/api/v1/balances/BTC", {}, apiKey, fetcher, "validate");
  const balance = normalizeBalance(payload);

  return {
    profile: {
      accountId: "plisio-api-key",
      displayName: "Plisio API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: plisioApiBaseUrl,
      validationEndpoint: "/api/v1/balances/BTC",
      validationCurrency: balance.currency,
      balance: balance.balance,
    },
  };
}

async function createInvoice(input: Record<string, unknown>, context: PlisioActionContext): Promise<unknown> {
  const payload = await requestPlisioData(
    "/api/v1/invoices/new",
    compactObject({
      currency: optionalString(input.currency),
      order_name: requiredInputString(input.order_name, "order_name"),
      order_number: requiredIdentifier(input.order_number, "order_number"),
      amount: optionalNumber(input.amount),
      source_currency: optionalString(input.source_currency),
      source_amount: optionalNumber(input.source_amount),
      allowed_psys_cids: optionalString(input.allowed_psys_cids),
      description: optionalString(input.description),
      callback_url: optionalString(input.callback_url),
      success_callback_url: optionalString(input.success_callback_url),
      fail_callback_url: optionalString(input.fail_callback_url),
      success_invoice_url: optionalString(input.success_invoice_url),
      fail_invoice_url: optionalString(input.fail_invoice_url),
      email: optionalString(input.email),
      language: optionalString(input.language),
      expire_min: optionalInteger(input.expire_min),
      return_existing: optionalBoolean(input.return_existing),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );

  return { invoice: normalizeInvoice(payload) };
}

async function listOperations(input: Record<string, unknown>, context: PlisioActionContext): Promise<unknown> {
  const payload = await requestPlisioData(
    "/api/v1/operations",
    compactObject({
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
      shop_id: optionalString(input.shop_id),
      type: optionalString(input.type),
      status: optionalString(input.status),
      currency: optionalString(input.currency),
      search: optionalString(input.search),
    }),
    context.apiKey,
    context.fetcher,
    "execute",
  );

  return {
    operations: normalizeOperations(payload.operations),
    pagination: normalizePagination(payload._meta),
    links: normalizeLinks(payload._links),
  };
}

async function getOperation(input: Record<string, unknown>, context: PlisioActionContext): Promise<unknown> {
  const id = requiredInputString(input.id, "id");
  const payload = await requestPlisioData(
    `/api/v1/operations/${encodeURIComponent(id)}`,
    {},
    context.apiKey,
    context.fetcher,
    "execute",
  );

  return { operation: normalizeOperation(payload) };
}

async function getBalance(input: Record<string, unknown>, context: PlisioActionContext): Promise<unknown> {
  const psysCid = requiredInputString(input.psys_cid, "psys_cid");
  const payload = await requestPlisioData(
    `/api/v1/balances/${encodeURIComponent(psysCid)}`,
    {},
    context.apiKey,
    context.fetcher,
    "execute",
  );

  return { balance: normalizeBalance(payload) };
}

async function requestPlisioData(
  path: string,
  query: Record<string, PlisioQueryValue>,
  apiKey: string,
  fetcher: typeof fetch,
  mode: PlisioRequestMode,
): Promise<Record<string, unknown>> {
  const response = await fetchPlisio(path, query, apiKey, fetcher);
  const payload = await readPlisioPayload(response);

  if (!response.ok || isPlisioErrorPayload(payload)) {
    throw createPlisioError(response.status, payload, mode);
  }

  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  if (!data) {
    throw new ProviderRequestError(502, "Plisio returned an invalid payload", payload);
  }

  return data;
}

async function fetchPlisio(
  path: string,
  query: Record<string, PlisioQueryValue>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<Response> {
  const url = new URL(path, plisioApiBaseUrl);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Plisio request failed: ${error.message}` : "Plisio request failed",
    );
  }
}

async function readPlisioPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    throw new ProviderRequestError(502, "Plisio returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Plisio returned invalid JSON");
  }
}

function isPlisioErrorPayload(payload: unknown): boolean {
  return optionalRecord(payload)?.status === "error";
}

function createPlisioError(status: number, payload: unknown, mode: PlisioRequestMode): ProviderRequestError {
  const message = extractPlisioErrorMessage(payload) ?? `Plisio request failed with ${status || 500}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (mode === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (mode === "execute" && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractPlisioErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  return optionalString(data?.message) ?? optionalString(record?.message);
}

function normalizeInvoice(value: unknown): Record<string, unknown> {
  const record = requireProviderRecord(value, "invoice");
  return {
    txn_id: optionalString(record.txn_id) ?? null,
    invoice_url: optionalString(record.invoice_url) ?? null,
    invoice_total_sum: optionalString(record.invoice_total_sum) ?? null,
    amount: optionalString(record.amount) ?? null,
    pending_amount: optionalString(record.pending_amount) ?? null,
    currency: optionalString(record.currency) ?? null,
    source_currency: optionalString(record.source_currency) ?? null,
    source_amount: optionalString(record.source_amount) ?? null,
    invoice_sum: optionalString(record.invoice_sum) ?? null,
    invoice_commission: optionalString(record.invoice_commission) ?? null,
    params: optionalRecord(record.params) ?? null,
    qr_code: optionalString(record.qr_code) ?? null,
    verify_hash: optionalString(record.verify_hash) ?? null,
  };
}

function normalizeOperations(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => normalizeOperation(item)) : [];
}

function normalizeOperation(value: unknown): Record<string, unknown> {
  const record = requireProviderRecord(value, "operation");
  return {
    user_id: optionalInteger(record.user_id) ?? null,
    shop_id: optionalString(record.shop_id) ?? null,
    type: optionalString(record.type) ?? null,
    status: optionalString(record.status) ?? null,
    pending_sum: optionalString(record.pending_sum) ?? null,
    psys_cid: optionalString(record.psys_cid) ?? null,
    currency: optionalString(record.currency) ?? null,
    source_currency: optionalString(record.source_currency) ?? null,
    source_rate: optionalString(record.source_rate) ?? null,
    fee: optionalString(record.fee) ?? null,
    wallet_hash: optionalString(record.wallet_hash) ?? null,
    sendmany: record.sendmany ?? null,
    expire_at_utc: optionalInteger(record.expire_at_utc) ?? null,
    created_at_utc: optionalInteger(record.created_at_utc) ?? null,
    amount: optionalString(record.amount) ?? null,
    sum: optionalNumber(record.sum) ?? null,
    commission: optionalString(record.commission) ?? null,
    actual_sum: optionalString(record.actual_sum) ?? null,
    actual_commission: optionalString(record.actual_commission) ?? null,
    actual_fee: optionalString(record.actual_fee) ?? null,
    actual_invoice_sum: optionalString(record.actual_invoice_sum) ?? null,
    tx_id: normalizeStringOrStringArray(record.tx_id),
    tx_url: normalizeStringOrStringArray(record.tx_url),
    confirmations: optionalInteger(record.confirmations) ?? null,
    status_code: optionalInteger(record.status_code) ?? null,
    parent_id: optionalString(record.parent_id) ?? null,
    child_ids: normalizeStringArray(record.child_ids),
    params: optionalRecord(record.params) ?? null,
    id: optionalString(record.id) ?? null,
  };
}

function normalizePagination(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  return {
    totalCount: optionalInteger(record?.totalCount) ?? null,
    pageCount: optionalInteger(record?.pageCount) ?? null,
    currentPage: optionalInteger(record?.currentPage) ?? null,
    perPage: optionalInteger(record?.perPage) ?? null,
  };
}

function normalizeLinks(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) as PlisioLinksPayload | undefined;
  return {
    self: extractHref(record?.self),
    next: extractHref(record?.next),
    prev: extractHref(record?.prev),
  };
}

function normalizeBalance(value: unknown): Record<string, unknown> {
  const record = requireProviderRecord(value, "balance");
  return {
    currency: requiredProviderString(record.currency, "currency"),
    balance: requiredProviderString(record.balance, "balance"),
  };
}

function extractHref(value: unknown): string | null {
  return optionalString(optionalRecord(value)?.href) ?? null;
}

function normalizeStringArray(value: unknown): string[] | null {
  return Array.isArray(value)
    ? value.map((item) => optionalString(item)).filter((item): item is string => !!item)
    : null;
}

function normalizeStringOrStringArray(value: unknown): string | string[] | null {
  if (Array.isArray(value)) {
    return value.map((item) => optionalString(item)).filter((item): item is string => !!item);
  }
  return optionalString(value) ?? null;
}

function requireProviderRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Plisio returned an invalid ${fieldName} payload`, value);
  }
  return record;
}

function requiredIdentifier(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return requiredInputString(value, fieldName);
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredProviderString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, () => new ProviderRequestError(502, `Plisio response missing ${fieldName}`));
}
