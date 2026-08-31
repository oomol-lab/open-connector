import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const giftUpApiBaseUrl = "https://api.giftup.app";

const giftUpValidationEndpoint = "/company";

type GiftUpRequestPhase = "validate" | "execute";
type GiftUpRuntimeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GiftUpActionHandler = (input: Record<string, unknown>, context: GiftUpRuntimeContext) => Promise<unknown>;
type GiftUpQueryValue = string | number | boolean | readonly string[] | undefined;

export const giftUpActionHandlers: ProviderActionHandlers<"gift_up", GiftUpActionHandler> = {
  get_company(_input, context) {
    return getCompany(context);
  },
  list_gift_cards(input, context) {
    return listGiftCards(input, context);
  },
  get_gift_card(input, context) {
    return getGiftCard(input, context);
  },
  reactivate_gift_card(input, context) {
    return giftCardEvent(input, context, "reactivate");
  },
  void_gift_card(input, context) {
    return giftCardEvent(input, context, "void");
  },
  top_up_gift_card(input, context) {
    return giftCardBalanceOperation(input, context, "top-up");
  },
  redeem_gift_card(input, context) {
    return giftCardBalanceOperation(input, context, "redeem");
  },
  redeem_gift_card_in_full(input, context) {
    return redeemGiftCardInFull(input, context);
  },
  undo_gift_card_redemption(input, context) {
    return undoGiftCardRedemption(input, context);
  },
  list_items(input, context) {
    return listItems(input, context);
  },
  get_item(input, context) {
    return getItem(input, context);
  },
  list_orders(input, context) {
    return listOrders(input, context);
  },
  get_order(input, context) {
    return getOrder(input, context);
  },
  list_locations(_input, context) {
    return listLocations(context);
  },
  list_promotions(_input, context) {
    return listPromotions(context);
  },
  list_report_transactions(input, context) {
    return listReportTransactions(input, context);
  },
  get_report_transaction(input, context) {
    return getReportTransaction(input, context);
  },
};

export async function validateGiftUpCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestGiftUpJson({
    context: {
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    method: "GET",
    path: giftUpValidationEndpoint,
    phase: "validate",
  });
  const company = normalizeCompany(payload);

  return {
    profile: {
      accountId: company.id ?? "gift_up",
      displayName: company.name ?? "Gift Up API Key",
    },
    grantedScopes: [],
    metadata: jsonObject({
      apiBaseUrl: giftUpApiBaseUrl,
      validationEndpoint: giftUpValidationEndpoint,
      companyId: company.id ?? undefined,
      companyName: company.name ?? undefined,
      currency: company.currency ?? undefined,
    }),
  };
}

async function getCompany(context: GiftUpRuntimeContext): Promise<unknown> {
  return {
    company: normalizeCompany(
      await requestGiftUpJson({
        context,
        method: "GET",
        path: "/company",
        phase: "execute",
      }),
    ),
  };
}

async function listGiftCards(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const payload = await requestGiftUpJson({
    context,
    method: "GET",
    path: "/gift-cards",
    query: giftUpQuery({
      status: optionalString(input.status),
      createdOnOrAfter: optionalString(input.createdOnOrAfter),
      updatedOnOrAfter: optionalString(input.updatedOnOrAfter),
      orderId: optionalString(input.orderId),
      sku: optionalString(input.sku),
      recipientEmail: optionalString(input.recipientEmail),
      purchaserEmail: optionalString(input.purchaserEmail),
      paymentTransactionId: optionalString(input.paymentTransactionId),
      limit: readOptionalInteger(input.limit),
      offset: readOptionalInteger(input.offset),
    }),
    phase: "execute",
  });
  const response = optionalRecord(payload);
  return {
    page: normalizePage(response, input),
    giftCards: normalizeObjectArray(response?.giftCards).map(normalizeGiftCard),
    raw: payload,
  };
}

async function getGiftCard(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const code = readRequiredString(input.code, "code");
  return {
    giftCard: normalizeGiftCard(
      await requestGiftUpJson({
        context,
        method: "GET",
        path: `/gift-cards/${encodeURIComponent(code)}`,
        phase: "execute",
      }),
    ),
  };
}

async function giftCardEvent(
  input: Record<string, unknown>,
  context: GiftUpRuntimeContext,
  event: "reactivate" | "void",
): Promise<unknown> {
  const code = readRequiredString(input.code, "code");
  const payload = await requestGiftUpJson({
    context,
    method: "POST",
    path: `/gift-cards/${encodeURIComponent(code)}/${event}`,
    body: optionalBody(eventBody(input)),
    phase: "execute",
  });
  return {
    success: true,
    raw: optionalRecord(payload) ?? {},
  };
}

async function giftCardBalanceOperation(
  input: Record<string, unknown>,
  context: GiftUpRuntimeContext,
  operation: "top-up" | "redeem",
): Promise<unknown> {
  const code = readRequiredString(input.code, "code");
  return normalizeTransactionResult(
    await requestGiftUpJson({
      context,
      method: "POST",
      path: `/gift-cards/${encodeURIComponent(code)}/${operation}`,
      body: balanceOperationBody(input, { includeRedeemedOn: operation === "redeem" }),
      phase: "execute",
    }),
  );
}

async function redeemGiftCardInFull(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const code = readRequiredString(input.code, "code");
  return normalizeTransactionResult(
    await requestGiftUpJson({
      context,
      method: "POST",
      path: `/gift-cards/${encodeURIComponent(code)}/redeem-in-full`,
      body: optionalBody(redemptionEventBody(input)),
      phase: "execute",
    }),
  );
}

async function undoGiftCardRedemption(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const code = readRequiredString(input.code, "code");
  return normalizeTransactionResult(
    await requestGiftUpJson({
      context,
      method: "POST",
      path: `/gift-cards/${encodeURIComponent(code)}/undo-redemption`,
      body: {
        transactionId: readRequiredString(input.transactionId, "transactionId"),
        ...eventBody(input),
      },
      phase: "execute",
    }),
  );
}

async function listItems(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const payload = await requestGiftUpJson({
    context,
    method: "GET",
    path: "/items",
    query: giftUpQuery({ groupId: optionalString(input.groupId) }),
    phase: "execute",
  });
  return {
    items: normalizeObjectArray(payload).map(normalizeItem),
    raw: payload,
  };
}

async function getItem(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const id = readRequiredString(input.id, "id");
  return {
    item: normalizeItem(
      await requestGiftUpJson({
        context,
        method: "GET",
        path: `/items/${encodeURIComponent(id)}`,
        phase: "execute",
      }),
    ),
  };
}

async function listOrders(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const payload = await requestGiftUpJson({
    context,
    method: "GET",
    path: "/orders",
    query: giftUpQuery({
      createdOnOrAfter: optionalString(input.createdOnOrAfter),
      purchaserEmail: optionalString(input.purchaserEmail),
      source: optionalString(input.source),
      limit: readOptionalInteger(input.limit),
      offset: readOptionalInteger(input.offset),
    }),
    phase: "execute",
  });
  const response = optionalRecord(payload);
  return {
    page: normalizePage(response, input),
    orders: normalizeObjectArray(response?.orders).map(normalizeOrder),
    raw: payload,
  };
}

async function getOrder(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const id = readRequiredString(input.id, "id");
  return {
    order: normalizeOrder(
      await requestGiftUpJson({
        context,
        method: "GET",
        path: `/orders/${encodeURIComponent(id)}`,
        phase: "execute",
      }),
    ),
  };
}

async function listLocations(context: GiftUpRuntimeContext): Promise<unknown> {
  const payload = await requestGiftUpJson({
    context,
    method: "GET",
    path: "/locations",
    phase: "execute",
  });
  return {
    locations: normalizeObjectArray(payload).map(normalizeLocation),
    raw: payload,
  };
}

async function listPromotions(context: GiftUpRuntimeContext): Promise<unknown> {
  const payload = await requestGiftUpJson({
    context,
    method: "GET",
    path: "/promotions",
    phase: "execute",
  });
  return {
    promotions: normalizeObjectArray(payload).map(normalizePromotion),
    raw: payload,
  };
}

async function listReportTransactions(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const payload = await requestGiftUpJson({
    context,
    method: "GET",
    path: "/reports/transactions",
    query: giftUpQuery({
      eventOccurredOnOrAfter: optionalString(input.eventOccurredOnOrAfter),
      eventOccurredOnOrBefore: optionalString(input.eventOccurredOnOrBefore),
      events: readOptionalStringArray(input.events),
      users: readOptionalStringArray(input.users),
      locations: readOptionalStringArray(input.locations),
      code: optionalString(input.code),
      limit: readOptionalInteger(input.limit),
      offset: readOptionalInteger(input.offset),
    }),
    phase: "execute",
  });
  const response = optionalRecord(payload);
  return {
    page: normalizePage(response, input),
    transactions: normalizeObjectArray(response?.transactions ?? response?.tranasctions).map(normalizeTransaction),
    raw: payload,
  };
}

async function getReportTransaction(input: Record<string, unknown>, context: GiftUpRuntimeContext): Promise<unknown> {
  const id = readRequiredString(input.id, "id");
  return {
    transaction: normalizeTransaction(
      await requestGiftUpJson({
        context,
        method: "GET",
        path: `/reports/transactions/${encodeURIComponent(id)}`,
        phase: "execute",
      }),
    ),
  };
}

async function requestGiftUpJson(input: {
  context: GiftUpRuntimeContext;
  method: "GET" | "POST";
  path: string;
  phase: GiftUpRequestPhase;
  query?: Record<string, GiftUpQueryValue>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildGiftUpUrl(input.path, input.query), {
      method: input.method,
      headers: giftUpHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readGiftUpPayload(response);
    if (!response.ok) {
      throw createGiftUpError(response.status, payload, input.phase);
    }

    if (payload !== null && typeof payload !== "object") {
      throw new ProviderRequestError(502, "Gift Up returned an invalid payload", payload);
    }
    return payload ?? {};
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Gift Up request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gift Up request failed: ${error.message}` : "Gift Up request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildGiftUpUrl(path: string, query: Record<string, GiftUpQueryValue> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${giftUpApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
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
  return url;
}

function giftUpHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function giftUpQuery(input: Record<string, GiftUpQueryValue>): Record<string, GiftUpQueryValue> {
  const output: Record<string, GiftUpQueryValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

async function readGiftUpPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Gift Up returned invalid JSON");
  }
}

function createGiftUpError(status: number, payload: unknown, phase: GiftUpRequestPhase): ProviderRequestError {
  const message = extractGiftUpErrorMessage(payload) ?? `Gift Up request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractGiftUpErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message =
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title) ??
    optionalString(record.detail);
  if (message) {
    return message;
  }

  const serialized = JSON.stringify(record);
  return serialized === "{}" ? undefined : serialized;
}

function eventBody(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject({
    reason: optionalString(input.reason),
    locationId: optionalString(input.locationId),
    metadata: optionalRecord(input.metadata),
  });
}

function redemptionEventBody(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject({
    ...eventBody(input),
    redeemedOn: optionalString(input.redeemedOn),
  });
}

function balanceOperationBody(
  input: Record<string, unknown>,
  options: { includeRedeemedOn: boolean },
): Record<string, unknown> {
  return jsonObject({
    amount: readOptionalNumber(input.amount),
    units: readOptionalInteger(input.units),
    ...eventBody(input),
    redeemedOn: options.includeRedeemedOn ? optionalString(input.redeemedOn) : undefined,
  });
}

function optionalBody(body: Record<string, unknown>): Record<string, unknown> | undefined {
  return Object.keys(body).length > 0 ? body : undefined;
}

function normalizeCompany(value: unknown): {
  id: string | null;
  name: string | null;
  currency: string | null;
  onboardingCompleted: boolean | null;
  canShowCheckout: boolean | null;
  isCheckoutLive: boolean | null;
  raw: Record<string, unknown>;
} {
  const record = optionalRecord(value) ?? {};
  return {
    id: asNullableString(record.id),
    name: asNullableString(record.name),
    currency: asNullableString(record.currency),
    onboardingCompleted: asNullableBoolean(record.onboardingCompleted),
    canShowCheckout: asNullableBoolean(record.canShowCheckout),
    isCheckoutLive: asNullableBoolean(record.isCheckoutLive),
    raw: record,
  };
}

function normalizeGiftCard(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    code: asNullableString(record.code),
    title: asNullableString(record.title),
    subTitle: asNullableString(record.subTitle),
    message: asNullableString(record.message),
    recipientName: asNullableString(record.recipientName),
    recipientEmail: asNullableString(record.recipientEmail),
    backingType: asNullableString(record.backingType),
    remainingValue: asNullableNumber(record.remainingValue),
    remainingUnits: asNullableInteger(record.remainingUnits),
    initialValue: asNullableNumber(record.initialValue),
    initialUnits: asNullableInteger(record.initialUnits),
    equivalentValuePerUnit: asNullableNumber(record.equivalentValuePerUnit),
    canBeRedeemed: asNullableBoolean(record.canBeRedeemed),
    hasExpired: asNullableBoolean(record.hasExpired),
    notYetValid: asNullableBoolean(record.notYetValid),
    isVoided: asNullableBoolean(record.isVoided),
    fulfilledOn: asNullableString(record.fulfilledOn),
    expiresOn: asNullableString(record.expiresOn),
    validFrom: asNullableString(record.validFrom),
    voidedOn: asNullableString(record.voidedOn),
    fulfilledBy: asNullableString(record.fulfilledBy),
    terms: asNullableString(record.terms),
    sku: asNullableString(record.sku),
    order: asNullableObject(record.order),
    postalFulfilment: asNullableObject(record.postalFulfilment),
    emailFulfilment: asNullableObject(record.emailFulfilment),
    downloadLinks: asNullableObject(record.downloadLinks),
    ledger: normalizeObjectArray(record.ledger),
    raw: record,
  };
}

function normalizeItem(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: asNullableString(record.id),
    name: asNullableString(record.name),
    description: asNullableString(record.description),
    backingType: asNullableString(record.backingType),
    priceType: asNullableString(record.priceType),
    price: asNullableNumber(record.price),
    value: asNullableNumber(record.value),
    units: asNullableInteger(record.units),
    equivalentValuePerUnit: asNullableNumber(record.equivalentValuePerUnit),
    minimumPrice: asNullableNumber(record.minimumPrice),
    maximumPrice: asNullableNumber(record.maximumPrice),
    availableFrom: asNullableString(record.availableFrom),
    availableUntil: asNullableString(record.availableUntil),
    group: asNullableString(record.group),
    groupId: asNullableString(record.groupId),
    detailsURL: asNullableString(record.detailsURL),
    artworkURL: asNullableString(record.artworkURL),
    stockLevel: asNullableInteger(record.stockLevel),
    codes: normalizeStringArray(record.codes),
    perOrderLimit: asNullableInteger(record.perOrderLimit),
    additionalTerms: asNullableString(record.additionalTerms),
    sku: asNullableString(record.sku),
    raw: record,
  };
}

function normalizeOrder(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: asNullableString(record.id),
    orderNumber: asNullableString(record.orderNumber),
    createdOn: asNullableString(record.createdOn),
    selectedRecipient: asNullableString(record.selectedRecipient),
    purchaserEmail: asNullableString(record.purchaserEmail),
    purchaserName: asNullableString(record.purchaserName),
    currency: asNullableString(record.currency),
    revenue: asNullableNumber(record.revenue),
    tip: asNullableNumber(record.tip),
    serviceFee: asNullableNumber(record.serviceFee),
    discount: asNullableNumber(record.discount),
    shippingFee: asNullableNumber(record.shippingFee),
    referrer: asNullableString(record.referrer),
    source: asNullableString(record.source),
    promotions: normalizeObjectArray(record.promotions),
    customFields: normalizeObjectArray(record.customFields),
    salesTaxes: normalizeObjectArray(record.salesTaxes),
    notes: normalizeObjectArray(record.notes),
    metadata: asNullableObject(record.metadata),
    downloadLinks: asNullableObject(record.downloadLinks),
    payment: asNullableObject(record.payment),
    fulfilments: normalizeObjectArray(record.fulfilments),
    giftCards: normalizeObjectArray(record.giftCards),
    raw: record,
  };
}

function normalizeLocation(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: asNullableString(record.id),
    name: asNullableString(record.name),
    raw: record,
  };
}

function normalizePromotion(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: asNullableString(record.id),
    name: asNullableString(record.name),
    noBenefit: asNullableBoolean(record.noBenefit),
    publishedOn: asNullableString(record.publishedOn),
    stoppedOn: asNullableString(record.stoppedOn),
    benefits: asNullableObject(record.benefits),
    usage: asNullableObject(record.usage),
    limitations: asNullableObject(record.limitations),
    triggers: asNullableObject(record.triggers),
    raw: record,
  };
}

function normalizeTransaction(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    id: asNullableString(record.id),
    eventOccurredOn: asNullableString(record.eventOccurredOn ?? record.eventOccuredOn),
    eventOccurredAtLocationId: asNullableString(record.eventOccurredAtLocationId ?? record.eventOccuredAtLocationId),
    eventType: asNullableString(record.eventType),
    reason: asNullableString(record.reason),
    referrer: asNullableString(record.referrer),
    metadata: asNullableObject(record.metadata),
    orderId: asNullableString(record.orderId),
    currency: asNullableString(record.currency),
    giftUpFee: asNullableNumber(record.giftUpFee),
    whoName: asNullableString(record.whoName),
    whoEmail: asNullableString(record.whoEmail),
    orderDetails: asNullableObject(record.orderDetails),
    giftCard: asNullableObject(record.giftCard),
    raw: record,
  };
}

function normalizeTransactionResult(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    transactionId: asNullableString(record.transactionId),
    remainingCredit: asNullableNumber(record.remainingCredit),
    remainingUnits: asNullableInteger(record.remainingUnits),
    redeemedAmount: asNullableNumber(record.redeemedAmount),
    redeemedUnits: asNullableInteger(record.redeemedUnits),
    amountReversed: asNullableNumber(record.amountReversed),
    unitsReversed: asNullableInteger(record.unitsReversed),
    alreadyReversed: asNullableBoolean(record.alreadyReversed),
    raw: record,
  };
}

function normalizePage(
  response: Record<string, unknown> | undefined,
  input: Record<string, unknown>,
): Record<string, unknown> {
  return {
    total: asNullableInteger(response?.total),
    hasMore: asNullableBoolean(response?.hasMore),
    offset: readOptionalInteger(input.offset) ?? null,
    limit: readOptionalInteger(input.limit) ?? null,
  };
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalNumber(value: unknown): number | undefined {
  return optionalNumber(value);
}

function readOptionalInteger(value: unknown): number | undefined {
  return optionalInteger(value);
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Array.isArray(value) ? value.flatMap((item) => (typeof item === "string" ? [item] : [])) : undefined;
}

function asNullableString(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return optionalString(value) ?? null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  return optionalNumber(value) ?? null;
}

function asNullableInteger(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  const numberValue = optionalNumber(value);
  return numberValue !== undefined && Number.isInteger(numberValue) ? numberValue : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  if (value === null) {
    return null;
  }
  return optionalBoolean(value) ?? null;
}

function asNullableObject(value: unknown): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  return optionalRecord(value) ?? null;
}
