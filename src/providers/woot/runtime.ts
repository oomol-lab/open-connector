import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const wootApiBaseUrl = "https://developer.woot.com";

const wootRequestTimeoutMs = 30_000;

type WootRequestPhase = "validate" | "execute";

interface WootRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface WootJsonRequest {
  context: WootRequestContext;
  url: URL;
  method: "GET" | "POST";
  body?: unknown;
  phase: WootRequestPhase;
}

export const wootActionHandlers: ProviderActionHandlers<"woot", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_feed(input, context) {
    const feedName = requiredString(input.feedName, "feedName", inputError);
    const page = optionalInteger(input.page);
    const url = new URL(`/feed/${encodeURIComponent(feedName)}`, wootApiBaseUrl);
    if (page !== undefined) url.searchParams.set("page", String(page));

    return normalizeFeedPage(await requestWootJson({ context, url, method: "GET", phase: "execute" }));
  },

  async get_offers(input, context) {
    const offerIds = requiredStringArray(input.offerIds, "offerIds", inputError);
    const payload = await requestWootJson({
      context,
      url: new URL("/getoffers", wootApiBaseUrl),
      method: "POST",
      body: offerIds,
      phase: "execute",
    });

    return {
      offers: requireRecordArray(payload, "Woot getoffers response must be an array").map(normalizeOffer),
    };
  },

  async get_offer(input, context) {
    const offerId = requiredString(input.offerId, "offerId", inputError);
    const payload = await requestWootJson({
      context,
      url: new URL(`/offers/${encodeURIComponent(offerId)}`, wootApiBaseUrl),
      method: "GET",
      phase: "execute",
    });

    return { offer: normalizeOffer(requireRecord(payload, "Woot offer response must be an object")) };
  },
};

export async function validateWootCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const validationUrl = new URL("/feed/Featured", wootApiBaseUrl);
  validationUrl.searchParams.set("page", "1");
  normalizeFeedPage(
    await requestWootJson({
      context: { apiKey, fetcher, signal },
      url: validationUrl,
      method: "GET",
      phase: "validate",
    }),
  );

  return {
    profile: { accountId: "woot-api-key", displayName: "Woot API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: wootApiBaseUrl,
      validationEndpoint: "/feed/Featured?page=1",
    },
  };
}

async function requestWootJson(input: WootJsonRequest): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, wootRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(input.url, {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readWootPayload(response);
    if (!response.ok) throw createWootError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Woot request timed out");
    }
    throw new ProviderRequestError(502, "Woot request failed");
  } finally {
    timeout.cleanup();
  }
}

async function readWootPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Woot response");
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return text.trim();
    throw new ProviderRequestError(502, "Woot returned invalid JSON");
  }
}

function createWootError(status: number, payload: unknown, phase: WootRequestPhase): ProviderRequestError {
  const message = extractWootErrorMessage(payload) ?? `Woot request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message);
  if (status === 401 || status === 403) return new ProviderRequestError(status, message);
  if (status === 400 || status === 404) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractWootErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  for (const key of ["message", "Message", "error", "Error"]) {
    const value = optionalRawString(record[key]);
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function normalizeFeedPage(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) {
    return {
      items: requireRecordArray(payload, "Woot feed response must contain offer objects").map(normalizeFeedItem),
      marketingName: null,
      totalPages: null,
    };
  }

  const record = requireRecord(payload, "Woot feed response must be an object or array");
  return {
    items: requireRecordArray(record.Items, "Woot feed response is missing Items").map(normalizeFeedItem),
    marketingName: nullableString(record.MarketingName),
    totalPages: nullableInteger(record.TotalPages),
  };
}

function normalizeFeedItem(value: Record<string, unknown>): Record<string, unknown> {
  return {
    offerId: nullableString(value.OfferId),
    title: nullableString(value.Title),
    subtitle: nullableString(value.Subtitle),
    condition: nullableString(value.Condition),
    categories: stringArray(value.Categories),
    photo: nullableString(value.Photo),
    url: nullableString(value.Url),
    forumUrl: nullableString(value.ForumUrl),
    startDate: nullableString(value.StartDate),
    endDate: nullableString(value.EndDate),
    listPrice: normalizeNullablePriceRange(value.ListPrice),
    salePrice: normalizeNullablePriceRange(value.SalePrice),
    isSoldOut: nullableBoolean(value.IsSoldOut),
    isWootOff: nullableBoolean(value.IsWootOff),
    isFeatured: nullableBoolean(value.IsFeatured),
    isFulfilledByAmazon: nullableBoolean(value.IsFulfilledByAmazon),
    isAvailableOnMobileAppOnly: nullableBoolean(value.IsAvailableOnMobileAppOnly),
    raw: value,
  };
}

function normalizeOffer(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableString(value.Id),
    eventId: nullableString(value.EventId),
    title: nullableString(value.Title),
    fullTitle: nullableString(value.FullTitle),
    subtitle: nullableString(value.Subtitle),
    teaser: nullableString(value.Teaser),
    slug: nullableString(value.Slug),
    url: nullableString(value.Url),
    win: nullableString(value.Win),
    features: nullableString(value.Features),
    specs: nullableString(value.Specs),
    snippet: nullableString(value.Snippet),
    writeUpIntro: nullableString(value.WriteUpIntro),
    writeUpBody: nullableString(value.WriteUpBody),
    extendedWarranty: nullableString(value.ExtendedWarranty),
    purchaseLimit: nullableInteger(value.PurchaseLimit),
    quantityLimit: nullableInteger(value.QuantityLimit),
    percentageRemainingBlurred: nullableInteger(value.PercentageRemainingBlurred),
    isSoldOut: nullableBoolean(value.IsSoldOut),
    isWootOff: nullableBoolean(value.IsWootOff),
    items: recordArray(value.Items).map(normalizeOfferItem),
    photos: recordArray(value.Photos).map(normalizePhoto),
    shippingMethods: recordArray(value.ShippingMethods).map(normalizeShippingMethod),
    raw: value,
  };
}

function normalizeOfferItem(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: nullableString(value.Id),
    asin: nullableString(value.Asin),
    title: nullableString(value.Title),
    win: nullableString(value.Win),
    listPrice: nullableNumber(value.ListPrice),
    salePrice: nullableNumber(value.SalePrice),
    attributes: recordArray(value.Attributes).map(normalizeAttribute),
    photos: recordArray(value.Photos).map(normalizePhoto),
    raw: value,
  };
}

function normalizeAttribute(value: Record<string, unknown>): Record<string, unknown> {
  return { key: nullableString(value.Key), value: nullableString(value.Value), raw: value };
}

function normalizePhoto(value: Record<string, unknown>): Record<string, unknown> {
  return {
    url: nullableString(value.Url),
    caption: nullableString(value.Caption),
    tags: stringArray(value.Tags),
    height: nullableInteger(value.Height),
    width: nullableInteger(value.Width),
    raw: value,
  };
}

function normalizeShippingMethod(value: Record<string, unknown>): Record<string, unknown> {
  return {
    name: nullableString(value.Name),
    excludePOBox: nullableBoolean(value.ExcludePOBox),
    excludedStates: stringArray(value.ExcludedStates),
    excludedPostalCodes: stringArray(value.ExcludedPostalCodes),
    raw: value,
  };
}

function normalizeNullablePriceRange(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  const record = optionalRecord(Array.isArray(value) ? value[0] : value);
  return record ? { minimum: nullableNumber(record.Minimum), maximum: nullableNumber(record.Maximum) } : null;
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function requireRecordArray(value: unknown, message: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, message);
  return value.map((item) => {
    const record = optionalRecord(item);
    if (!record) throw new ProviderRequestError(502, message);
    return record;
  });
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function nullableString(value: unknown): string | null {
  return optionalRawString(value) ?? null;
}

function nullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}

function nullableInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}

function nullableBoolean(value: unknown): boolean | null {
  return optionalBoolean(value) ?? null;
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
