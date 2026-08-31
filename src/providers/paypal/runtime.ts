import type { CredentialValidationResult } from "../../core/types.ts";

import { randomUUID } from "node:crypto";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  stringArray,
} from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export type PayPalEnvironment = "sandbox" | "live";

const paypalApiBaseUrls = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const satisfies Record<PayPalEnvironment, string>;

type PayPalRequestPhase = "validate" | "execute";

type PayPalCredentialContext = {
  clientId: string;
  clientSecret: string;
  environment: PayPalEnvironment;
  fetcher: typeof fetch;
};

type PayPalActionContext = PayPalCredentialContext & {
  accessToken: string;
};

type PayPalActionHandler = (input: Record<string, unknown>, context: PayPalActionContext) => Promise<unknown>;

type PayPalApiRequestInput = {
  environment: PayPalEnvironment;
  accessToken: string;
  path: string;
  method?: "GET" | "POST" | "PATCH";
  query?: URLSearchParams;
  body?: unknown;
  requestId?: string;
  preferRepresentation?: boolean;
  enforceIso8601?: boolean;
  fetcher: typeof fetch;
};

type PayPalAccessTokenPayload = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  app_id?: unknown;
};

export const paypalActionHandlers: Record<string, PayPalActionHandler> = {
  async list_transactions(input, context) {
    const query = new URLSearchParams({
      start_date: requireString(input.startDate, "startDate"),
      end_date: requireString(input.endDate, "endDate"),
    });
    setOptionalQuery(query, "transaction_id", input.transactionId);
    setOptionalQuery(query, "transaction_type", input.transactionType);
    setOptionalQuery(query, "transaction_status", input.transactionStatus);
    setOptionalQuery(query, "transaction_amount", input.transactionAmountRange);
    setOptionalQuery(query, "transaction_currency", input.currencyCode);
    setOptionalQuery(query, "payment_instrument_type", input.paymentInstrumentType);
    setOptionalQuery(query, "store_id", input.storeId);
    setOptionalQuery(query, "terminal_id", input.terminalId);
    if (input.fields !== undefined) {
      query.set("fields", stringArray(input.fields, "fields").join(","));
    }
    if (typeof input.balanceAffectingRecordsOnly === "boolean") {
      query.set("balance_affecting_records_only", input.balanceAffectingRecordsOnly ? "Y" : "N");
    }
    setOptionalQuery(query, "page_size", input.pageSize);
    setOptionalQuery(query, "page", input.page);

    const result = requirePayPalObject(
      await paypalApiRequest({
        ...context,
        path: "/v1/reporting/transactions",
        query,
        enforceIso8601: true,
      }),
      "transaction search",
    );
    return compactObject({
      transactions: readPayPalObjectArray(result.transaction_details, "transaction_details"),
      accountNumber: optionalString(result.account_number),
      startDate: optionalString(result.start_date),
      endDate: optionalString(result.end_date),
      lastRefreshedAt: optionalString(result.last_refreshed_datetime),
      page: optionalInteger(result.page),
      totalItems: optionalInteger(result.total_items),
      totalPages: optionalInteger(result.total_pages),
    });
  },

  async get_balances(input, context) {
    const query = new URLSearchParams();
    setOptionalQuery(query, "as_of_time", input.asOfTime);
    setOptionalQuery(query, "currency_code", input.currencyCode);
    const result = requirePayPalObject(
      await paypalApiRequest({
        ...context,
        path: "/v1/reporting/balances",
        query,
        enforceIso8601: true,
      }),
      "balances",
    );
    return compactObject({
      balances: readPayPalObjectArray(result.balances, "balances"),
      accountId: optionalString(result.account_id),
      asOfTime: optionalString(result.as_of_time),
      lastRefreshedAt: optionalString(result.last_refresh_time),
    });
  },

  async create_order(input, context) {
    const order = await paypalApiRequest({
      ...context,
      path: "/v2/checkout/orders",
      method: "POST",
      body: buildCreateOrderBody(input),
      requestId: resolveRequestId(input.requestId),
      preferRepresentation: true,
    });
    return { order: requirePayPalObject(order, "order") };
  },

  async get_order(input, context) {
    const query = new URLSearchParams();
    if (input.includePaymentSource === true) {
      query.set("fields", "payment_source");
    }
    const order = await paypalApiRequest({
      ...context,
      path: `/v2/checkout/orders/${encodeId(input.orderId, "orderId")}`,
      query,
    });
    return { order: requirePayPalObject(order, "order") };
  },

  async authorize_order(input, context) {
    const order = await paypalApiRequest({
      ...context,
      path: `/v2/checkout/orders/${encodeId(input.orderId, "orderId")}/authorize`,
      method: "POST",
      body: {},
      requestId: resolveRequestId(input.requestId),
      preferRepresentation: true,
    });
    return { order: requirePayPalObject(order, "order") };
  },

  async capture_order(input, context) {
    const order = await paypalApiRequest({
      ...context,
      path: `/v2/checkout/orders/${encodeId(input.orderId, "orderId")}/capture`,
      method: "POST",
      body: {},
      requestId: resolveRequestId(input.requestId),
      preferRepresentation: true,
    });
    return { order: requirePayPalObject(order, "order") };
  },

  async get_authorization(input, context) {
    const authorization = await paypalApiRequest({
      ...context,
      path: `/v2/payments/authorizations/${encodeId(input.authorizationId, "authorizationId")}`,
    });
    return { authorization: requirePayPalObject(authorization, "authorization") };
  },

  async capture_authorization(input, context) {
    const capture = await paypalApiRequest({
      ...context,
      path: `/v2/payments/authorizations/${encodeId(input.authorizationId, "authorizationId")}/capture`,
      method: "POST",
      body: buildCaptureAuthorizationBody(input),
      requestId: resolveRequestId(input.requestId),
      preferRepresentation: true,
    });
    return { capture: requirePayPalObject(capture, "capture") };
  },

  async void_authorization(input, context) {
    const authorizationId = requireString(input.authorizationId, "authorizationId");
    await paypalApiRequest({
      ...context,
      path: `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`,
      method: "POST",
      requestId: resolveRequestId(input.requestId),
      preferRepresentation: true,
    });
    return { authorizationId, voided: true };
  },

  async get_capture(input, context) {
    const capture = await paypalApiRequest({
      ...context,
      path: `/v2/payments/captures/${encodeId(input.captureId, "captureId")}`,
    });
    return { capture: requirePayPalObject(capture, "capture") };
  },

  async refund_capture(input, context) {
    const refund = await paypalApiRequest({
      ...context,
      path: `/v2/payments/captures/${encodeId(input.captureId, "captureId")}/refund`,
      method: "POST",
      body: buildRefundBody(input),
      requestId: resolveRequestId(input.requestId),
      preferRepresentation: true,
    });
    return { refund: requirePayPalObject(refund, "refund") };
  },

  async get_refund(input, context) {
    const refund = await paypalApiRequest({
      ...context,
      path: `/v2/payments/refunds/${encodeId(input.refundId, "refundId")}`,
    });
    return { refund: requirePayPalObject(refund, "refund") };
  },

  async add_tracking(input, context) {
    const order = await paypalApiRequest({
      ...context,
      path: `/v2/checkout/orders/${encodeId(input.orderId, "orderId")}/track`,
      method: "POST",
      body: buildAddTrackingBody(input),
    });
    return { order: requirePayPalObject(order, "order") };
  },

  async update_tracking(input, context) {
    const orderId = requireString(input.orderId, "orderId");
    const trackerId = requireString(input.trackerId, "trackerId");
    await paypalApiRequest({
      ...context,
      path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/trackers/${encodeURIComponent(trackerId)}`,
      method: "PATCH",
      body: buildUpdateTrackingBody(input),
    });
    return { orderId, trackerId, updated: true };
  },
} satisfies Record<string, PayPalActionHandler>;

export async function validatePayPalCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const context = resolvePayPalCredential(input, fetcher);
  const token = await exchangePayPalAccessToken(context, "validate");
  const appId = optionalString(token.app_id);
  const scope = optionalString(token.scope);
  const providerScopes = scope
    ? scope
        .split(" ")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const environmentLabel = context.environment === "live" ? "Live" : "Sandbox";

  return {
    profile: {
      accountId: `${context.environment}:${context.clientId}`,
      displayName: appId ? `PayPal ${environmentLabel} (${appId})` : `PayPal ${environmentLabel}`,
    },
    grantedScopes: providerScopes,
    metadata: {
      environment: context.environment,
      apiBaseUrl: paypalApiBaseUrls[context.environment],
      tokenEndpoint: `${paypalApiBaseUrls[context.environment]}/v1/oauth2/token`,
      ...(appId ? { appId } : {}),
    },
  };
}

export async function createPayPalActionContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
): Promise<PayPalActionContext> {
  const context = resolvePayPalCredential(values, fetcher);
  const token = await exchangePayPalAccessToken(context, "execute");
  const accessToken = optionalString(token.access_token);
  if (!accessToken) throw new ProviderRequestError(502, "PayPal access token is missing");
  return { ...context, accessToken };
}

function resolvePayPalEnvironment(value: unknown): PayPalEnvironment {
  const environment = optionalString(value)?.trim().toLowerCase();
  if (environment === "sandbox" || environment === "live") {
    return environment;
  }
  throw new ProviderRequestError(400, "environment must be sandbox or live");
}

export function createPayPalAccessTokenRequest(input: {
  clientId: string;
  clientSecret: string;
  environment: PayPalEnvironment;
}): { url: string; init: RequestInit } {
  return {
    url: `${paypalApiBaseUrls[input.environment]}/v1/oauth2/token`,
    init: {
      method: "POST",
      headers: {
        accept: "application/json",
        "accept-language": "en_US",
        authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    } satisfies RequestInit,
  };
}

function resolvePayPalCredential(input: Record<string, string>, fetcher: typeof fetch): PayPalCredentialContext {
  return {
    clientId: requireCredentialField(input.clientId, "clientId"),
    clientSecret: requireCredentialField(input.clientSecret, "clientSecret"),
    environment: resolvePayPalEnvironment(input.environment),
    fetcher,
  };
}

async function exchangePayPalAccessToken(input: PayPalCredentialContext, phase: PayPalRequestPhase) {
  const request = createPayPalAccessTokenRequest(input);
  const { response, payload } = await fetchPayPalPayload(input.fetcher, request.url, request.init);
  if (!response.ok) {
    throw createPayPalError(response, payload, phase);
  }
  const token = optionalRecord(payload) as PayPalAccessTokenPayload | undefined;
  if (!optionalString(token?.access_token)) {
    throw new ProviderRequestError(502, "PayPal access token is missing");
  }
  return token ?? {};
}

async function paypalApiRequest(input: PayPalApiRequestInput) {
  const url = new URL(input.path, paypalApiBaseUrls[input.environment]);
  if (input.query) {
    url.search = input.query.toString();
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (input.requestId) {
    headers["paypal-request-id"] = input.requestId;
  }
  if (input.preferRepresentation) {
    headers.prefer = "return=representation";
  }
  if (input.enforceIso8601) {
    headers["paypal-enforce-iso8601-format"] = "true";
  }

  const { response, payload } = await fetchPayPalPayload(input.fetcher, url, {
    method: input.method ?? "GET",
    headers,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  if (!response.ok) {
    throw createPayPalError(response, payload, "execute");
  }
  return payload;
}

async function fetchPayPalPayload(fetcher: typeof fetch, url: string | URL, init: RequestInit) {
  const timeout = createProviderTimeout(undefined);
  try {
    const response = await fetcher(url, { ...init, signal: timeout.signal });
    return { response, payload: await readPayPalPayload(response) };
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "PayPal request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

async function readPayPalPayload(response: Response) {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) {
      throw new ProviderRequestError(
        502,
        error instanceof Error ? `PayPal returned malformed JSON: ${error.message}` : "PayPal returned malformed JSON",
      );
    }
    return text;
  }
}

function createPayPalError(response: Response, payload: unknown, phase: PayPalRequestPhase) {
  const errorObject = optionalRecord(payload);
  const message = extractPayPalErrorMessage(payload, response.statusText);
  const debugId = optionalString(errorObject?.debug_id);
  const details = Array.isArray(errorObject?.details) ? errorObject.details : undefined;
  const data = debugId || details ? { ...(debugId ? { debugId } : {}), ...(details ? { details } : {}) } : undefined;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, data);
  }
  if (phase === "validate" && [400, 401, 403].includes(response.status)) {
    return new ProviderRequestError(400, message, data);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(409, message, data);
  }
  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message, data);
  }
  if (phase === "execute" && [400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, data);
  }
  return new ProviderRequestError(response.status || 500, message, data);
}

function extractPayPalErrorMessage(payload: unknown, fallback: string) {
  const data = optionalRecord(payload);
  if (!data) {
    return typeof payload === "string" && payload.trim() ? payload.trim() : fallback || "PayPal request failed";
  }

  const firstDetail = Array.isArray(data.details) ? optionalRecord(data.details[0]) : undefined;
  const issue = optionalString(firstDetail?.issue);
  const description = optionalString(firstDetail?.description);
  if (issue && description) {
    return `${issue}: ${description}`;
  }
  return (
    description ??
    optionalString(data.message) ??
    optionalString(data.error_description) ??
    optionalString(data.error) ??
    optionalString(data.name) ??
    fallback ??
    "PayPal request failed"
  );
}

function buildCreateOrderBody(input: Record<string, unknown>) {
  const purchaseUnits = objectArray(input.purchaseUnits, "purchaseUnits").map((purchaseUnit) =>
    compactObject({
      reference_id: purchaseUnit.referenceId,
      amount: mapOrderAmount(purchaseUnit.amount),
      description: purchaseUnit.description,
      custom_id: purchaseUnit.customId,
      invoice_id: purchaseUnit.invoiceId,
      soft_descriptor: purchaseUnit.softDescriptor,
      items: Array.isArray(purchaseUnit.items) ? objectArray(purchaseUnit.items, "items").map(mapItem) : undefined,
      shipping: mapShipping(purchaseUnit.shipping),
    }),
  );
  const experience = mapPayPalExperience(input.paypalExperience);
  return compactObject({
    intent: requireString(input.intent, "intent"),
    purchase_units: purchaseUnits,
    payment_source: experience ? { paypal: { experience_context: experience } } : undefined,
  });
}

function mapOrderAmount(value: unknown) {
  const amount = requireObject(value, "amount");
  const breakdown = optionalRecord(amount.breakdown);
  return compactObject({
    ...mapMoney(amount),
    breakdown: breakdown
      ? compactOptionalObject({
          item_total: mapOptionalMoney(breakdown.itemTotal),
          shipping: mapOptionalMoney(breakdown.shipping),
          handling: mapOptionalMoney(breakdown.handling),
          tax_total: mapOptionalMoney(breakdown.taxTotal),
          insurance: mapOptionalMoney(breakdown.insurance),
          shipping_discount: mapOptionalMoney(breakdown.shippingDiscount),
          discount: mapOptionalMoney(breakdown.discount),
        })
      : undefined,
  });
}

function mapItem(item: Record<string, unknown>) {
  return compactObject({
    name: item.name,
    unit_amount: mapMoney(requireObject(item.unitAmount, "unitAmount")),
    quantity: String(item.quantity),
    tax: mapOptionalMoney(item.tax),
    description: item.description,
    sku: item.sku,
    category: item.category,
    url: item.url,
    image_url: item.imageUrl,
  });
}

function mapShipping(value: unknown) {
  const shipping = optionalRecord(value);
  if (!shipping) {
    return undefined;
  }
  return {
    name: { full_name: shipping.fullName },
    address: compactObject({
      address_line_1: shipping.addressLine1,
      address_line_2: shipping.addressLine2,
      admin_area_2: shipping.city,
      admin_area_1: shipping.state,
      postal_code: shipping.postalCode,
      country_code: shipping.countryCode,
    }),
  };
}

function mapPayPalExperience(value: unknown) {
  const experience = optionalRecord(value);
  if (!experience) {
    return undefined;
  }
  return compactOptionalObject({
    brand_name: experience.brandName,
    locale: experience.locale,
    shipping_preference: experience.shippingPreference,
    return_url: experience.returnUrl,
    cancel_url: experience.cancelUrl,
    landing_page: experience.landingPage,
    user_action: experience.userAction,
    payment_method_preference: experience.paymentMethodPreference,
  });
}

function buildCaptureAuthorizationBody(input: Record<string, unknown>) {
  return compactObject({
    amount: mapOptionalMoney(input.amount),
    invoice_id: input.invoiceId,
    final_capture: optionalBoolean(input.finalCapture),
    note_to_payer: input.noteToPayer,
    soft_descriptor: input.softDescriptor,
  });
}

function buildRefundBody(input: Record<string, unknown>) {
  return compactObject({
    amount: mapOptionalMoney(input.amount),
    custom_id: input.customId,
    invoice_id: input.invoiceId,
    note_to_payer: input.noteToPayer,
  });
}

function buildAddTrackingBody(input: Record<string, unknown>) {
  return compactObject({
    capture_id: requireString(input.captureId, "captureId"),
    tracking_number: requireString(input.trackingNumber, "trackingNumber"),
    carrier: requireString(input.carrier, "carrier"),
    carrier_name_other: input.carrierNameOther,
    notify_payer: optionalBoolean(input.notifyPayer),
    items: Array.isArray(input.items) ? objectArray(input.items, "items").map(mapTrackingItem) : undefined,
  });
}

function buildUpdateTrackingBody(input: Record<string, unknown>) {
  const patches: Record<string, unknown>[] = [];
  if (input.items !== undefined) {
    patches.push({
      op: "replace",
      path: "/items",
      value: objectArray(input.items, "items").map(mapTrackingItem),
    });
  }
  if (typeof input.notifyPayer === "boolean") {
    patches.push({ op: "replace", path: "/notify_payer", value: input.notifyPayer });
  }
  if (input.cancel === true) {
    patches.push({ op: "replace", path: "/status", value: "CANCELLED" });
  }
  if (patches.length === 0) {
    throw new ProviderRequestError(400, "provide cancel, notifyPayer, or items to update tracking information");
  }
  return patches;
}

function mapTrackingItem(item: Record<string, unknown>) {
  const upc = optionalRecord(item.upc);
  return compactObject({
    name: item.name,
    quantity: item.quantity === undefined ? undefined : String(item.quantity),
    sku: item.sku,
    url: item.url,
    image_url: item.imageUrl,
    upc: upc
      ? {
          type: requireString(upc.type, "upc.type"),
          code: requireString(upc.code, "upc.code"),
        }
      : undefined,
  });
}

function mapOptionalMoney(value: unknown) {
  const money = optionalRecord(value);
  return money ? mapMoney(money) : undefined;
}

function mapMoney(value: Record<string, unknown>) {
  return {
    currency_code: requireString(value.currencyCode, "currencyCode"),
    value: requireString(value.value, "value"),
  };
}

function compactOptionalObject(value: Record<string, unknown>) {
  const compacted = compactObject(value);
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function setOptionalQuery(query: URLSearchParams, key: string, value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    query.set(key, String(value));
  }
}

function resolveRequestId(value: unknown) {
  return optionalString(value) ?? randomUUID();
}

function encodeId(value: unknown, fieldName: string) {
  return encodeURIComponent(requireString(value, fieldName));
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function requireCredentialField(value: unknown, fieldName: string) {
  return requireString(value, fieldName);
}

function requireObject(value: unknown, fieldName: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return object;
}

function requirePayPalObject(value: unknown, resourceName: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `PayPal ${resourceName} response is missing`);
  }
  return object;
}

function readPayPalObjectArray(value: unknown, fieldName: string) {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `PayPal ${fieldName} response is invalid`);
  }
  return value.map((item) => {
    const object = optionalRecord(item);
    if (!object) {
      throw new ProviderRequestError(502, `PayPal ${fieldName} response is invalid`);
    }
    return object;
  });
}
