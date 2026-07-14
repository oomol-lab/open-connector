import type { CredentialValidationResult } from "../../core/types.ts";
import type { RazorpayActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const razorpayApiBaseUrl = "https://api.razorpay.com/v1";
const razorpayValidationPath = "/payments";
const razorpayDefaultRequestTimeoutMs = 30_000;

const asOptionalInteger = optionalInteger;
const asOptionalString = optionalString;
const asOptionalObject = optionalRecord;
function createTimeoutSignal(input: { timeoutMs: number }): {
  signal: AbortSignal;
  didTimeout: boolean;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, input.timeoutMs);
  return {
    signal: controller.signal,
    get didTimeout() {
      return didTimeout;
    },
    cleanup: () => clearTimeout(timer),
  };
}

type RazorpayRequestPhase = "validate" | "execute";
type RazorpayActionInput = {
  apiKey: string;
  values?: Record<string, string>;
  metadata?: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  actionName: RazorpayActionName;
  input: Record<string, unknown>;
};
type RazorpayActionHandler = (input: Record<string, unknown>, context: RazorpayActionContext) => Promise<unknown>;

type RazorpayActionContext = {
  keyId: string;
  keySecret: string;
  fetcher: typeof fetch;
};

export const razorpayActionHandlers: Record<RazorpayActionName, RazorpayActionHandler> = {
  create_order(input, context) {
    return createOrder(input, context);
  },
  list_orders(input, context) {
    return listOrders(input, context);
  },
  get_order(input, context) {
    return getOrder(input, context);
  },
  get_payment(input, context) {
    return getPayment(input, context);
  },
  list_payments(input, context) {
    return listPayments(input, context);
  },
  create_refund(input, context) {
    return createRefund(input, context);
  },
};

export async function validateRazorpayCredential(
  input: Record<string, string>,
  fetcher: typeof fetch = providerFetch,
): Promise<CredentialValidationResult> {
  const keySecret = input.apiKey;
  const keyId = requireRazorpayKeyId(input);
  const payload = await requestRazorpayJson({
    method: "GET",
    path: razorpayValidationPath,
    keyId,
    keySecret,
    query: {
      count: "1",
    },
    phase: "validate",
    fetcher,
  });

  const record = requireRecord(payload, "Razorpay payments response");
  const firstPayment = asOptionalObject(readFirstCollectionItem(record));

  return {
    profile: { accountId: keyId, displayName: "Razorpay API Key", grantedScopes: [] },
    metadata: compactObject({
      apiBaseUrl: razorpayApiBaseUrl,
      validationEndpoint: `${razorpayValidationPath}?count=1`,
      keyId,
      firstPaymentId: trimOptionalString(firstPayment?.id),
      firstPaymentEmail: trimOptionalString(firstPayment?.email),
      firstPaymentStatus: trimOptionalString(firstPayment?.status),
    }),
  };
}

export async function executeRazorpayAction(input: RazorpayActionInput, fetcher: typeof fetch): Promise<unknown> {
  const handler = razorpayActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown razorpay action: ${input.actionName}`);
  }

  return handler(input.input, {
    keyId: requireStoredRazorpayKeyId(input),
    keySecret: input.apiKey,
    fetcher,
  });
}

async function createOrder(input: Record<string, unknown>, context: RazorpayActionContext) {
  const payload = await requestRazorpayJson({
    method: "POST",
    path: "/orders",
    keyId: context.keyId,
    keySecret: context.keySecret,
    body: compactObject({
      amount: readRequiredPositiveInteger(input.amount, "amount"),
      currency: requireTrimmedString(input.currency, "currency"),
      receipt: readOptionalTrimmedString(input.receipt),
      notes: readOptionalStringRecord(input.notes),
    }),
    phase: "execute",
    fetcher: context.fetcher,
  });

  return {
    order: normalizeOrder(requireRecord(payload, "Razorpay order response")),
  };
}

async function listOrders(input: Record<string, unknown>, context: RazorpayActionContext) {
  const payload = await requestRazorpayJson({
    method: "GET",
    path: "/orders",
    keyId: context.keyId,
    keySecret: context.keySecret,
    query: compactObject({
      count: stringifyOptionalInteger(asOptionalInteger(input.count)),
      skip: stringifyOptionalInteger(asOptionalInteger(input.skip)),
      from: stringifyOptionalInteger(asOptionalInteger(input.from)),
      to: stringifyOptionalInteger(asOptionalInteger(input.to)),
      authorized: readOptionalAuthorizedFlag(input.authorized),
      receipt: readOptionalTrimmedString(input.receipt),
    }),
    arrayQuery: [["expand[]", readOptionalStringArray(input.expand)]],
    phase: "execute",
    fetcher: context.fetcher,
  });

  const record = requireRecord(payload, "Razorpay orders collection");
  const items = readCollectionItems(record);
  return {
    count: items.length,
    orders: items.map((item, index) => normalizeOrder(requireRecord(item, `orders[${index}]`))),
    raw: record,
  };
}

async function getOrder(input: Record<string, unknown>, context: RazorpayActionContext) {
  const orderId = requireTrimmedString(input.orderId, "orderId");
  const payload = await requestRazorpayJson({
    method: "GET",
    path: `/orders/${encodeURIComponent(orderId)}`,
    keyId: context.keyId,
    keySecret: context.keySecret,
    phase: "execute",
    fetcher: context.fetcher,
  });

  return {
    order: normalizeOrder(requireRecord(payload, "Razorpay order response")),
  };
}

async function getPayment(input: Record<string, unknown>, context: RazorpayActionContext) {
  const paymentId = requireTrimmedString(input.paymentId, "paymentId");
  const payload = await requestRazorpayJson({
    method: "GET",
    path: `/payments/${encodeURIComponent(paymentId)}`,
    keyId: context.keyId,
    keySecret: context.keySecret,
    phase: "execute",
    fetcher: context.fetcher,
  });

  return {
    payment: normalizePayment(requireRecord(payload, "Razorpay payment response")),
  };
}

async function listPayments(input: Record<string, unknown>, context: RazorpayActionContext) {
  const payload = await requestRazorpayJson({
    method: "GET",
    path: "/payments",
    keyId: context.keyId,
    keySecret: context.keySecret,
    query: compactObject({
      count: stringifyOptionalInteger(asOptionalInteger(input.count)),
      skip: stringifyOptionalInteger(asOptionalInteger(input.skip)),
      from: stringifyOptionalInteger(asOptionalInteger(input.from)),
      to: stringifyOptionalInteger(asOptionalInteger(input.to)),
    }),
    phase: "execute",
    fetcher: context.fetcher,
  });

  const record = requireRecord(payload, "Razorpay payments collection");
  const items = readCollectionItems(record);
  return {
    count: items.length,
    payments: items.map((item, index) => normalizePayment(requireRecord(item, `payments[${index}]`))),
    raw: record,
  };
}

async function createRefund(input: Record<string, unknown>, context: RazorpayActionContext) {
  const paymentId = requireTrimmedString(input.paymentId, "paymentId");
  const payload = await requestRazorpayJson({
    method: "POST",
    path: `/payments/${encodeURIComponent(paymentId)}/refund`,
    keyId: context.keyId,
    keySecret: context.keySecret,
    body: compactObject({
      amount: readOptionalPositiveInteger(input.amount, "amount"),
      speed: readOptionalTrimmedString(input.speed),
      receipt: readOptionalTrimmedString(input.receipt),
      notes: readOptionalStringRecord(input.notes),
    }),
    phase: "execute",
    fetcher: context.fetcher,
  });

  return {
    refund: normalizeRefund(requireRecord(payload, "Razorpay refund response")),
  };
}

async function requestRazorpayJson(input: {
  method: "GET" | "POST";
  path: string;
  keyId: string;
  keySecret: string;
  query?: Record<string, string | undefined>;
  arrayQuery?: ReadonlyArray<readonly [string, readonly string[] | undefined]>;
  body?: Record<string, unknown>;
  phase: RazorpayRequestPhase;
  fetcher: typeof fetch;
}) {
  const url = new URL(input.path.replace(/^\//, ""), `${razorpayApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  for (const [key, values] of input.arrayQuery ?? []) {
    for (const value of values ?? []) {
      if (value) {
        url.searchParams.append(key, value);
      }
    }
  }

  const timeout = createTimeoutSignal({
    timeoutMs: razorpayDefaultRequestTimeoutMs,
  });

  try {
    const response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: buildBasicAuthorizationHeader(input.keyId, input.keySecret),
        "Content-Type": "application/json",
        "User-Agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });

    const payload = await parseRazorpayPayload(response);
    if (!response.ok) {
      throw createRazorpayError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if ((error as Error).name === "AbortError" && timeout.didTimeout) {
      throw new ProviderRequestError(504, "Razorpay request timed out after 30 seconds");
    }

    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function parseRazorpayPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Razorpay returned invalid JSON");
  }
}

function createRazorpayError(status: number, payload: unknown, phase: RazorpayRequestPhase) {
  const message = extractRazorpayErrorMessage(payload) ?? `Razorpay request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && [400, 401, 403].includes(status)) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && [401, 403].includes(status)) {
    return new ProviderRequestError(409, message);
  }

  if (phase === "execute" && [400, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(500, message, status || 500);
}

function extractRazorpayErrorMessage(payload: unknown) {
  const record = asOptionalObject(payload);
  const error = asOptionalObject(record?.error);
  return (
    trimOptionalString(error?.description) ??
    trimOptionalString(error?.reason) ??
    trimOptionalString(record?.description) ??
    trimOptionalString(record?.message)
  );
}

function buildBasicAuthorizationHeader(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

function requireRazorpayKeyId(input: Record<string, string>) {
  const keyId = trimOptionalString(input.keyId);
  if (!keyId) {
    throw new ProviderRequestError(400, "keyId is required");
  }
  return keyId;
}

function requireStoredRazorpayKeyId(input: RazorpayActionInput) {
  const keyId =
    trimOptionalString(input.values?.keyId) ??
    trimOptionalString(input.providerMetadata?.keyId) ??
    trimOptionalString((input.providerMetadata as Record<string, unknown> | undefined)?.keyId);
  if (!keyId) {
    throw new ProviderRequestError(500, "stored keyId is missing for razorpay credential");
  }
  return keyId;
}

function readCollectionItems(record: Record<string, unknown>) {
  const items = record.items;
  if (!Array.isArray(items)) {
    throw new ProviderRequestError(502, "Razorpay collection items are missing");
  }
  return items;
}

function readFirstCollectionItem(record: Record<string, unknown>) {
  return readCollectionItems(record)[0];
}

function normalizeOrder(record: Record<string, unknown>) {
  return {
    id: requireStringField(record.id, "id"),
    entity: requireStringField(record.entity, "entity"),
    amount: readRequiredPositiveInteger(record.amount, "amount"),
    amountPaid: asOptionalInteger(record.amount_paid) ?? null,
    amountDue: asOptionalInteger(record.amount_due) ?? null,
    currency: requireStringField(record.currency, "currency"),
    receipt: trimOptionalString(record.receipt) ?? null,
    offerId: trimOptionalString(record.offer_id) ?? null,
    status: trimOptionalString(record.status) ?? null,
    attempts: asOptionalInteger(record.attempts) ?? null,
    notes: record.notes ?? null,
    createdAt: asOptionalInteger(record.created_at) ?? null,
    raw: record,
  };
}

function normalizePayment(record: Record<string, unknown>) {
  return {
    id: requireStringField(record.id, "id"),
    entity: requireStringField(record.entity, "entity"),
    amount: readRequiredPositiveInteger(record.amount, "amount"),
    currency: requireStringField(record.currency, "currency"),
    status: trimOptionalString(record.status) ?? null,
    orderId: trimOptionalString(record.order_id) ?? null,
    invoiceId: trimOptionalString(record.invoice_id) ?? null,
    international: readOptionalBoolean(record.international),
    method: trimOptionalString(record.method) ?? null,
    amountRefunded: asOptionalInteger(record.amount_refunded) ?? null,
    refundStatus: trimOptionalString(record.refund_status) ?? null,
    captured: readOptionalBoolean(record.captured),
    description: trimOptionalString(record.description) ?? null,
    cardId: trimOptionalString(record.card_id) ?? null,
    bank: trimOptionalString(record.bank) ?? null,
    wallet: trimOptionalString(record.wallet) ?? null,
    vpa: trimOptionalString(record.vpa) ?? null,
    email: trimOptionalString(record.email) ?? null,
    contact: trimOptionalString(record.contact) ?? null,
    notes: record.notes ?? null,
    fee: asOptionalInteger(record.fee) ?? null,
    tax: asOptionalInteger(record.tax) ?? null,
    errorCode: trimOptionalString(record.error_code) ?? null,
    errorDescription: trimOptionalString(record.error_description) ?? null,
    errorSource: trimOptionalString(record.error_source) ?? null,
    errorStep: trimOptionalString(record.error_step) ?? null,
    errorReason: trimOptionalString(record.error_reason) ?? null,
    acquirerData: record.acquirer_data ?? null,
    createdAt: asOptionalInteger(record.created_at) ?? null,
    raw: record,
  };
}

function normalizeRefund(record: Record<string, unknown>) {
  return {
    id: requireStringField(record.id, "id"),
    entity: requireStringField(record.entity, "entity"),
    amount: readRequiredPositiveInteger(record.amount, "amount"),
    currency: requireStringField(record.currency, "currency"),
    paymentId: requireStringField(record.payment_id, "payment_id"),
    receipt: trimOptionalString(record.receipt) ?? null,
    notes: record.notes ?? null,
    acquirerData: record.acquirer_data ?? null,
    createdAt: asOptionalInteger(record.created_at) ?? null,
    batchId: trimOptionalString(record.batch_id) ?? null,
    status: trimOptionalString(record.status) ?? null,
    speedRequested: trimOptionalString(record.speed_requested) ?? null,
    speedProcessed: trimOptionalString(record.speed_processed) ?? null,
    raw: record,
  };
}

function requireRecord(value: unknown, context: string) {
  const record = asOptionalObject(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} is missing`);
  }
  return record;
}

function requireStringField(value: unknown, fieldName: string) {
  const trimmed = trimOptionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(502, `Razorpay field ${fieldName} is missing`);
  }
  return trimmed;
}

function requireTrimmedString(value: unknown, fieldName: string) {
  const trimmed = trimOptionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readOptionalTrimmedString(value: unknown) {
  return trimOptionalString(value);
}

function trimOptionalString(value: unknown) {
  const stringValue = asOptionalString(value);
  if (!stringValue) {
    return undefined;
  }
  const trimmed = stringValue.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string) {
  const parsed = asOptionalInteger(value);
  if (!parsed || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string) {
  if (value == null || value === "") {
    return undefined;
  }
  return readRequiredPositiveInteger(value, fieldName);
}

function readOptionalAuthorizedFlag(value: unknown) {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = asOptionalInteger(value);
  if (parsed !== 0 && parsed !== 1) {
    throw new ProviderRequestError(400, "authorized must be 0 or 1");
  }
  return String(parsed);
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.map((item) => trimOptionalString(item)).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

function readOptionalStringRecord(value: unknown) {
  const record = asOptionalObject(value);
  if (!record) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(record)
      .map(([key, child]) => [key, trimOptionalString(child)] as const)
      .filter(([, child]) => child !== undefined),
  );
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function stringifyOptionalInteger(value: number | undefined) {
  return value == null ? undefined : String(value);
}
