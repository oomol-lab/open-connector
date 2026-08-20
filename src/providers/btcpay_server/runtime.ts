import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const btcpayApiSegment = "api/v1";
const btcpayValidationPath = "/stores";
const btcpayApiKeyHelpUrl = "https://docs.btcpayserver.org/API/Greenfield/v1/";

type BtcpayRequestPhase = "validate" | "execute";
type BtcpayQueryValue = string | number | boolean | readonly string[] | undefined;
type BtcpayActionHandler = (input: Record<string, unknown>, context: BtcpayServerContext) => Promise<unknown>;

export interface BtcpayServerContext {
  apiKey: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const btcpayServerActionHandlers: ProviderActionHandlers<"btcpay_server", BtcpayActionHandler> = {
  list_stores(_input, context) {
    return listStores(context);
  },
  get_store(input, context) {
    return getStore(input, context);
  },
  list_invoices(input, context) {
    return listInvoices(input, context);
  },
  get_invoice(input, context) {
    return getInvoice(input, context);
  },
  create_invoice(input, context) {
    return createInvoice(input, context);
  },
  update_invoice_metadata(input, context) {
    return updateInvoiceMetadata(input, context);
  },
  mark_invoice_status(input, context) {
    return markInvoiceStatus(input, context);
  },
};

export async function validateBtcpayServerCredential(
  input: { apiKey: string; baseUrl?: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requireInputString(input.apiKey, "apiKey");
  const baseUrl = normalizeBtcpayBaseUrl(input.baseUrl);
  const stores = await requestBtcpayJson<unknown>({
    apiKey,
    baseUrl,
    path: btcpayValidationPath,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: `btcpay_server:${buildInstanceKey(baseUrl)}`,
      displayName: buildAccountLabel(baseUrl, stores),
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      validationEndpoint: buildValidationEndpoint(baseUrl, btcpayValidationPath),
      credentialHelpUrl: btcpayApiKeyHelpUrl,
      storeCount: normalizeArray(stores, "btcpay_server stores response").length,
    }),
  };
}

export function normalizeBtcpayBaseUrl(
  value: string | undefined,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, "Base URL is required");
  }

  const parsed = assertPublicHttpUrl(trimmed, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
    allowPrivateNetwork,
  });

  parsed.search = "";
  parsed.hash = "";

  let pathname = parsed.pathname;
  while (pathname.endsWith("/") && pathname !== "/") {
    pathname = pathname.slice(0, -1);
  }

  const apiSuffix = `/${btcpayApiSegment}`;
  if (pathname.toLowerCase().endsWith(apiSuffix)) {
    pathname = pathname.slice(0, -apiSuffix.length) || "/";
  }

  while (pathname.endsWith("/") && pathname !== "/") {
    pathname = pathname.slice(0, -1);
  }

  parsed.pathname = pathname === "/" ? "/" : pathname;
  return `${parsed.origin}${parsed.pathname === "/" ? "" : parsed.pathname}`;
}

async function listStores(context: BtcpayServerContext): Promise<{ stores: Array<Record<string, unknown>> }> {
  const payload = await requestBtcpayJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: "/stores",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { stores: normalizeArray(payload, "btcpay_server stores response") };
}

async function getStore(
  input: Record<string, unknown>,
  context: BtcpayServerContext,
): Promise<{ store: Record<string, unknown> }> {
  const storeId = requireInputString(input.storeId, "storeId");
  const payload = await requestBtcpayJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/stores/${encodeURIComponent(storeId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { store: payload };
}

async function listInvoices(
  input: Record<string, unknown>,
  context: BtcpayServerContext,
): Promise<{ invoices: Array<Record<string, unknown>> }> {
  const storeId = requireInputString(input.storeId, "storeId");
  const payload = await requestBtcpayJson<unknown>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/stores/${encodeURIComponent(storeId)}/invoices`,
    query: compactObject({
      orderId: normalizeOptionalStringArray(input.orderIds, "orderIds"),
      textSearch: optionalString(input.textSearch),
      status: optionalString(input.status),
      startDate: optionalNumber(input.startDate),
      endDate: optionalNumber(input.endDate),
      includePaymentMethods: optionalBoolean(input.includePaymentMethods),
      take: readOptionalInteger(input.take, "take"),
      skip: readOptionalInteger(input.skip, "skip"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { invoices: normalizeArray(payload, "btcpay_server invoices response") };
}

async function getInvoice(
  input: Record<string, unknown>,
  context: BtcpayServerContext,
): Promise<{ invoice: Record<string, unknown> }> {
  const storeId = requireInputString(input.storeId, "storeId");
  const invoiceId = requireInputString(input.invoiceId, "invoiceId");
  const payload = await requestBtcpayJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/stores/${encodeURIComponent(storeId)}/invoices/${encodeURIComponent(invoiceId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { invoice: payload };
}

async function createInvoice(
  input: Record<string, unknown>,
  context: BtcpayServerContext,
): Promise<{ invoice: Record<string, unknown> }> {
  const storeId = requireInputString(input.storeId, "storeId");
  const payload = await requestBtcpayJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/stores/${encodeURIComponent(storeId)}/invoices`,
    method: "POST",
    body: compactObject({
      amount: optionalString(input.amount),
      currency: optionalString(input.currency),
      metadata: optionalRecord(input.metadata),
      additionalSearchTerms: normalizeOptionalStringArray(input.additionalSearchTerms, "additionalSearchTerms"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { invoice: payload };
}

async function updateInvoiceMetadata(
  input: Record<string, unknown>,
  context: BtcpayServerContext,
): Promise<{ invoice: Record<string, unknown> }> {
  const storeId = requireInputString(input.storeId, "storeId");
  const invoiceId = requireInputString(input.invoiceId, "invoiceId");
  const payload = await requestBtcpayJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/stores/${encodeURIComponent(storeId)}/invoices/${encodeURIComponent(invoiceId)}`,
    method: "PUT",
    body: {
      metadata: optionalRecord(input.metadata) ?? {},
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { invoice: payload };
}

async function markInvoiceStatus(
  input: Record<string, unknown>,
  context: BtcpayServerContext,
): Promise<{ invoice: Record<string, unknown> }> {
  const storeId = requireInputString(input.storeId, "storeId");
  const invoiceId = requireInputString(input.invoiceId, "invoiceId");
  const payload = await requestBtcpayJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    baseUrl: context.baseUrl,
    path: `/stores/${encodeURIComponent(storeId)}/invoices/${encodeURIComponent(invoiceId)}/status`,
    method: "POST",
    body: {
      status: requireInputString(input.status, "status"),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { invoice: payload };
}

async function requestBtcpayJson<T>(input: {
  apiKey: string;
  baseUrl: string;
  path: string;
  fetcher: ProviderFetch;
  phase: BtcpayRequestPhase;
  method?: string;
  query?: Record<string, BtcpayQueryValue>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  let response: Response;
  try {
    response = await btcpayFetch(input);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `btcpay_server request failed: ${error.message}` : "btcpay_server request failed",
      error,
    );
  }

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw toBtcpayError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload as T;
}

async function btcpayFetch(input: {
  apiKey: string;
  baseUrl: string;
  path: string;
  fetcher: ProviderFetch;
  method?: string;
  query?: Record<string, BtcpayQueryValue>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<Response> {
  const url = buildBtcpayApiUrl(input.baseUrl, input.path, input.query);
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `token ${input.apiKey}`,
    "User-Agent": providerUserAgent,
  });

  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.body);
  }

  return input.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body,
    signal: input.signal,
  });
}

function buildBtcpayApiUrl(baseUrl: string, path: string, query?: Record<string, BtcpayQueryValue>): string {
  const url = new URL(pathWithoutLeadingSlash(path), buildBtcpayApiBaseUrl(baseUrl));
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(key, child);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function buildBtcpayApiBaseUrl(baseUrl: string): URL {
  return new URL(`${btcpayApiSegment}/`, ensureTrailingSlash(baseUrl));
}

function buildValidationEndpoint(baseUrl: string, path: string): string {
  return new URL(pathWithoutLeadingSlash(path), buildBtcpayApiBaseUrl(baseUrl)).pathname;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function toBtcpayError(
  response: Response,
  payload: unknown,
  phase: BtcpayRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.detail) ??
    optionalString(record?.title) ??
    optionalString(record?.error) ??
    `btcpay_server request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function normalizeArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`, value);
  }
  return value.map((item) => optionalRecord(item) ?? {});
}

function normalizeOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`, value);
  }

  return value.map((item) => requireInputString(item, fieldName));
}

function requireInputString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return normalized;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function buildAccountLabel(baseUrl: string, stores: unknown): string {
  const storeList = Array.isArray(stores) ? stores : [];
  if (storeList.length === 1) {
    const store = optionalRecord(storeList[0]);
    const name = optionalString(store?.name);
    if (name) {
      return name;
    }
  }

  return `BTCPay Server ${new URL(baseUrl).host}`;
}

function buildInstanceKey(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  const pathname = parsed.pathname === "/" ? "" : parsed.pathname;
  return `${parsed.host}${pathname}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function pathWithoutLeadingSlash(value: string): string {
  let normalized = value;
  while (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}
