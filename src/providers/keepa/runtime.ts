import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { keepaDealPriceTypes, keepaHistoryTypes, keepaMarketplaces } from "./actions.ts";

import { compactObject, optionalRawString, optionalRecord, rawStringOrNull } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
  requiredInputString,
} from "../provider-runtime.ts";
import { keepaDealPriceTypes as dealPriceTypes, keepaHistoryTypes as historyTypes } from "./actions.ts";

export const keepaApiBaseUrl = "https://api.keepa.com";

type KeepaMarketplace = (typeof keepaMarketplaces)[number];
type KeepaHistoryType = (typeof keepaHistoryTypes)[number];
type KeepaDealPriceType = (typeof keepaDealPriceTypes)[number];
type KeepaPhase = "validate" | "execute";
type KeepaActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface KeepaRequest {
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: KeepaPhase;
}

interface KeepaMetricDefinition {
  type: KeepaHistoryType;
  index: number;
  isPrice: boolean;
  includesShipping: boolean;
  unit: "minor_currency_unit" | "sales_rank" | "count" | "rating_tenths" | "metadata";
}

const keepaTimeStartMinutes = 21_564_000;
const keepaDefaultTimeoutMs = 120_000;

const marketplaceDomainIdByCode: Record<KeepaMarketplace, number> = {
  US: 1,
  GB: 2,
  DE: 3,
  FR: 4,
  JP: 5,
  CA: 6,
  IT: 8,
  ES: 9,
  IN: 10,
  MX: 11,
  BR: 12,
};

const keepaMetrics: KeepaMetricDefinition[] = [
  metric("AMAZON", 0, true),
  metric("NEW", 1, true),
  metric("USED", 2, true),
  metric("SALES", 3, false, false, "sales_rank"),
  metric("LISTPRICE", 4, true),
  metric("COLLECTIBLE", 5, true),
  metric("REFURBISHED", 6, true),
  metric("NEW_FBM_SHIPPING", 7, true, true),
  metric("LIGHTNING_DEAL", 8, true),
  metric("WAREHOUSE", 9, true),
  metric("NEW_FBA", 10, true),
  metric("COUNT_NEW", 11, false, false, "count"),
  metric("COUNT_USED", 12, false, false, "count"),
  metric("COUNT_REFURBISHED", 13, false, false, "count"),
  metric("COUNT_COLLECTIBLE", 14, false, false, "count"),
  metric("EXTRA_INFO_UPDATES", 15, false, false, "metadata"),
  metric("RATING", 16, false, false, "rating_tenths"),
  metric("COUNT_REVIEWS", 17, false, false, "count"),
  metric("BUY_BOX_SHIPPING", 18, true, true),
  metric("USED_NEW_SHIPPING", 19, true, true),
  metric("USED_VERY_GOOD_SHIPPING", 20, true, true),
  metric("USED_GOOD_SHIPPING", 21, true, true),
  metric("USED_ACCEPTABLE_SHIPPING", 22, true, true),
  metric("COLLECTIBLE_NEW_SHIPPING", 23, true, true),
  metric("COLLECTIBLE_VERY_GOOD_SHIPPING", 24, true, true),
  metric("COLLECTIBLE_GOOD_SHIPPING", 25, true, true),
  metric("COLLECTIBLE_ACCEPTABLE_SHIPPING", 26, true, true),
  metric("REFURBISHED_SHIPPING", 27, true, true),
  metric("EBAY_NEW_SHIPPING", 28, true, true),
  metric("EBAY_USED_SHIPPING", 29, true, true),
  metric("TRADE_IN", 30, true),
  metric("RENT", 31, true),
  metric("BUY_BOX_USED_SHIPPING", 32, true, true),
  metric("PRIME_EXCL", 33, true),
  metric("COUNT_NEW_FBA", 34, false, false, "count"),
  metric("COUNT_NEW_FBM", 35, false, false, "count"),
];

const keepaMetricByType = new Map(keepaMetrics.map((item) => [item.type, item]));
const keepaHistoryTypeSet = new Set<KeepaHistoryType>(historyTypes);
const keepaDealPriceTypeSet = new Set<KeepaDealPriceType>(dealPriceTypes);

const dealSortTypeByName = {
  newest: 1,
  absolute_delta: 2,
  sales_rank: 3,
  percentage_delta: 4,
} as const;

export const keepaActionHandlers: ProviderActionHandlers<"keepa", KeepaActionHandler> = {
  async get_token_status(_input, context) {
    const payload = await requestKeepa({
      path: "/token",
      context,
      phase: "execute",
    });
    return { meta: normalizeMeta(payload) };
  },

  async get_product_snapshot(input, context) {
    const marketplace = requireMarketplace(input.marketplace);
    const payload = await requestKeepa({
      path: "/product",
      query: buildProductQuery(input, marketplace, false),
      context,
      phase: "execute",
    });
    return {
      marketplace,
      priceValuesUseMinorUnits: true,
      products: readObjectArray(payload.products).map(normalizeProductSnapshot),
      meta: normalizeMeta(payload),
    };
  },

  async get_product_history(input, context) {
    const marketplace = requireMarketplace(input.marketplace);
    const requestedTypes = readRequestedHistoryTypes(input.historyTypes);
    const payload = await requestKeepa({
      path: "/product",
      query: {
        ...buildProductQuery(input, marketplace, true),
        ...(typeof input.days === "number" ? { days: input.days } : {}),
      },
      context,
      phase: "execute",
    });
    return {
      marketplace,
      priceValuesUseMinorUnits: true,
      products: readObjectArray(payload.products).map((product) => normalizeProductHistory(product, requestedTypes)),
      meta: normalizeMeta(payload),
    };
  },

  async find_products(input, context) {
    const marketplace = requireMarketplace(input.marketplace);
    const filters = requireInputObject(input.filters, "filters");
    const payload = await requestKeepa({
      path: "/query",
      query: {
        domain: marketplaceDomainIdByCode[marketplace],
        selection: JSON.stringify(filters),
      },
      context,
      phase: "execute",
    });
    return {
      marketplace,
      asins: readStringArray(payload.asinList),
      totalResults: asNullableInteger(payload.totalResults),
      meta: normalizeMeta(payload),
    };
  },

  async search_categories(input, context) {
    const marketplace = requireMarketplace(input.marketplace);
    const term = requiredInputString(input.term, "term");
    validateCategorySearchTerm(term);
    const payload = await requestKeepa({
      path: "/search",
      query: {
        domain: marketplaceDomainIdByCode[marketplace],
        type: "category",
        term,
        ...(input.includeParents === true ? { parents: 1 } : {}),
      },
      context,
      phase: "execute",
    });
    return {
      marketplace,
      categories: objectMapValues(payload.categories),
      categoryParents: objectMapValues(payload.categoryParents),
      meta: normalizeMeta(payload),
    };
  },

  async get_best_sellers(input, context) {
    const marketplace = requireMarketplace(input.marketplace);
    const category = input.category;
    if (typeof category !== "string" && typeof category !== "number") {
      throw new ProviderRequestError(400, "category is required");
    }
    const payload = await requestKeepa({
      path: "/bestsellers",
      query: {
        domain: marketplaceDomainIdByCode[marketplace],
        category,
      },
      context,
      phase: "execute",
    });
    const bestSellers = optionalRecord(payload.bestSellersList) ?? {};
    return {
      marketplace,
      categoryId: asNullableInteger(bestSellers.categoryId),
      lastUpdate: asNullableInteger(bestSellers.lastUpdate),
      asins: readStringArray(bestSellers.asinList),
      raw: bestSellers,
      meta: normalizeMeta(payload),
    };
  },

  async find_deals(input, context) {
    const marketplace = requireMarketplace(input.marketplace);
    const priceType = requireDealPriceType(input.priceType);
    const payload = await requestKeepa({
      path: "/deal",
      body: buildDealRequest(input, marketplace, priceType),
      context,
      phase: "execute",
    });
    const deals = optionalRecord(payload.deals) ?? {};
    return {
      marketplace,
      deals: readObjectArray(deals.dr),
      categoryIds: readIntegerArray(deals.categoryIds),
      categoryNames: readStringArray(deals.categoryNames),
      categoryCount: readIntegerArray(deals.categoryCount),
      raw: deals,
      meta: normalizeMeta(payload),
    };
  },

  async get_seller_snapshot(input, context) {
    const marketplace = requireMarketplace(input.marketplace);
    const sellerIds = readStringArray(input.sellerIds);
    const payload = await requestKeepa({
      path: "/seller",
      query: {
        domain: marketplaceDomainIdByCode[marketplace],
        seller: sellerIds.join(","),
      },
      context,
      phase: "execute",
    });
    return {
      marketplace,
      sellers: objectMapEntries(payload.sellers).map(([sellerId, raw]) => normalizeSeller(sellerId, raw)),
      meta: normalizeMeta(payload),
    };
  },
};

export async function validateKeepaCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestKeepa({
    path: "/token",
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });
  const meta = normalizeMeta(payload);
  return {
    profile: {
      accountId: "keepa-api-key",
      displayName: "Keepa API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: keepaApiBaseUrl,
      validationEndpoint: "/token",
      tokenStatus: meta,
    },
  };
}

function buildProductQuery(
  input: Record<string, unknown>,
  marketplace: KeepaMarketplace,
  history: boolean,
): Record<string, string | number> {
  const asins = readAsinArray(input.asins);
  assertProductRequestRules(input, asins);
  return {
    asin: asins.join(","),
    domain: marketplaceDomainIdByCode[marketplace],
    history: history ? 1 : 0,
    ...(typeof input.statsDays === "number" ? { stats: input.statsDays } : {}),
    ...(typeof input.updateHours === "number" ? { update: input.updateHours } : {}),
    ...(typeof input.offers === "number" ? { offers: input.offers } : {}),
    ...(input.onlyLiveOffers === true ? { "only-live-offers": 1 } : {}),
    ...(input.includeBuyBox === true ? { buybox: 1 } : {}),
    ...(input.includeRating === true ? { rating: 1 } : {}),
  };
}

function buildDealRequest(
  input: Record<string, unknown>,
  marketplace: KeepaMarketplace,
  priceType: KeepaDealPriceType,
): Record<string, unknown> {
  const metricDefinition = keepaMetricByType.get(priceType);
  if (!metricDefinition) {
    throw new ProviderRequestError(400, `unsupported deal price type: ${priceType}`);
  }
  const sortName =
    typeof input.sortBy === "string" && input.sortBy in dealSortTypeByName
      ? (input.sortBy as keyof typeof dealSortTypeByName)
      : "newest";
  const sortType = dealSortTypeByName[sortName];
  if (sortType === 1 && input.invertSort === true) {
    throw new ProviderRequestError(400, "newest deal sorting cannot be inverted");
  }
  const ranges = {
    currentRange: readOptionalIntegerArray(input.currentRange),
    deltaRange: readOptionalIntegerArray(input.deltaRange),
    deltaPercentRange: readOptionalIntegerArray(input.deltaPercentRange),
    salesRankRange: readOptionalIntegerArray(input.salesRankRange),
  };
  return compactObject({
    page: typeof input.page === "number" ? input.page : 0,
    domainId: marketplaceDomainIdByCode[marketplace],
    priceTypes: [metricDefinition.index],
    dateRange: typeof input.dateRange === "number" ? input.dateRange : 0,
    sortType: input.invertSort === true ? -sortType : sortType,
    isLowest: input.isLowestEver === true,
    isLowest90: input.isLowest90Days === true,
    isLowestOffer: input.isLowestOffer === true,
    isBackInStock: input.isBackInStock === true,
    isOutOfStock: input.isOutOfStock === true,
    hasReviews: input.hasReviews === true,
    isPrimeExclusive: input.isPrimeExclusive === true,
    mustHaveAmazonOffer: input.mustHaveAmazonOffer === true,
    mustNotHaveAmazonOffer: input.mustNotHaveAmazonOffer === true,
    filterErotic: true,
    isRangeEnabled: Object.values(ranges).some((value) => value !== undefined),
    isFilterEnabled: [
      input.isLowestEver,
      input.isLowest90Days,
      input.isLowestOffer,
      input.isBackInStock,
      input.isOutOfStock,
      input.hasReviews,
      input.isPrimeExclusive,
      input.mustHaveAmazonOffer,
      input.mustNotHaveAmazonOffer,
      input.minimumRating,
      input.titleSearch,
    ].some((value) => value !== undefined && value !== false),
    includeCategories: readOptionalIntegerArray(input.includeCategories),
    excludeCategories: readOptionalIntegerArray(input.excludeCategories),
    titleSearch: optionalRawString(input.titleSearch),
    minRating: typeof input.minimumRating === "number" ? input.minimumRating : undefined,
    ...ranges,
  });
}

async function requestKeepa(input: KeepaRequest): Promise<Record<string, unknown>> {
  const url = new URL(input.path, keepaApiBaseUrl);
  url.searchParams.set("key", input.context.apiKey);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const timeoutHandle = createProviderTimeout(input.context.signal, keepaDefaultTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: input.body ? "POST" : "GET",
      headers: {
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json;charset=UTF-8" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      signal: timeoutHandle.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Keepa request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Keepa request failed: ${error.message}` : "Keepa request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }

  const envelope = optionalRecord(payload);
  if (!envelope) {
    throw new ProviderRequestError(502, "Keepa returned an invalid response envelope", payload);
  }
  if (!response.ok || envelope.error) {
    throw createKeepaError(response.status, envelope, input.phase);
  }
  return envelope;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Keepa response");
  if (text.trim() === "") {
    throw new ProviderRequestError(502, "Keepa returned an empty response");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Keepa returned invalid JSON");
  }
}

function createKeepaError(status: number, envelope: Record<string, unknown>, phase: KeepaPhase): ProviderRequestError {
  const error = optionalRecord(envelope.error);
  const providerType = optionalRawString(error?.type);
  const details = optionalRawString(error?.details);
  const message =
    optionalRawString(error?.message) ??
    details ??
    (providerType ? `Keepa request failed with ${providerType}` : `Keepa request failed (${status})`);
  const data = {
    providerType: providerType ?? null,
    details: details ?? null,
    tokensLeft: asNullableInteger(envelope.tokensLeft),
    refillInMs: asNullableInteger(envelope.refillIn),
  };

  if (status === 429) {
    return new ProviderRequestError(429, message, {
      ...data,
      reason: "token_budget_exhausted",
    });
  }
  if (status === 503) {
    return new ProviderRequestError(503, message, {
      ...data,
      reason: "service_unavailable",
    });
  }
  if (status === 401 || status === 403 || status === 402) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message, data);
    }
    return new ProviderRequestError(status === 402 ? 403 : status, message, {
      ...data,
      providerStatus: status,
    });
  }
  if (status === 400 || status === 405) {
    return new ProviderRequestError(400, message, data);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, data);
}

function normalizeMeta(payload: Record<string, unknown>): Record<string, number | null> {
  return {
    timestamp: asNullableInteger(payload.timestamp),
    tokensLeft: asNullableInteger(payload.tokensLeft),
    refillInMs: asNullableInteger(payload.refillIn),
    refillRatePerMinute: asNullableInteger(payload.refillRate),
    tokensConsumed: asNullableInteger(payload.tokensConsumed),
    processingTimeMs: asNullableInteger(payload.processingTimeInMs),
  };
}

function normalizeProductSnapshot(product: Record<string, unknown>): Record<string, unknown> {
  const asin = requireUpstreamString(product.asin, "product.asin");
  const stats = optionalRecord(product.stats);
  return {
    asin,
    domainId: asNullableInteger(product.domainId),
    title: rawStringOrNull(product.title),
    brand: rawStringOrNull(product.brand),
    manufacturer: rawStringOrNull(product.manufacturer),
    productGroup: rawStringOrNull(product.productGroup),
    parentAsin: rawStringOrNull(product.parentAsin),
    rootCategory: asNullableInteger(product.rootCategory),
    categories: readIntegerArray(product.categories),
    imageUrls: collectImageUrls(product),
    monthlySold: asNullableInteger(product.monthlySold),
    lastUpdate: asNullableInteger(product.lastUpdate),
    stats: stats ? normalizeStats(stats) : null,
    raw: product,
  };
}

function normalizeStats(stats: Record<string, unknown>): Record<string, unknown> {
  return {
    current: normalizeMetricIntegerArray(stats.current),
    average: normalizeMetricIntegerArray(stats.avg),
    average30Days: normalizeMetricIntegerArray(stats.avg30),
    average90Days: normalizeMetricIntegerArray(stats.avg90),
    average180Days: normalizeMetricIntegerArray(stats.avg180),
    average365Days: normalizeMetricIntegerArray(stats.avg365),
    atIntervalStart: normalizeMetricIntegerArray(stats.atIntervalStart),
    isLowestEver: normalizeMetricBooleanArray(stats.isLowest),
    isLowest90Days: normalizeMetricBooleanArray(stats.isLowest90),
    raw: stats,
  };
}

function normalizeMetricIntegerArray(value: unknown): Record<string, number | null> {
  if (!Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    keepaMetrics
      .filter((item) => item.index < value.length)
      .map((item) => [item.type, asNullableInteger(value[item.index])]),
  );
}

function normalizeMetricBooleanArray(value: unknown): Record<string, boolean> {
  if (!Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    keepaMetrics
      .filter((item) => item.index < value.length && typeof value[item.index] === "boolean")
      .map((item) => [item.type, value[item.index] as boolean]),
  );
}

function normalizeProductHistory(
  product: Record<string, unknown>,
  requestedTypes: Set<KeepaHistoryType> | undefined,
): Record<string, unknown> {
  const csv = Array.isArray(product.csv) ? product.csv : [];
  return {
    asin: requireUpstreamString(product.asin, "product.asin"),
    title: rawStringOrNull(product.title),
    brand: rawStringOrNull(product.brand),
    series: keepaMetrics
      .filter((definition) => !requestedTypes || requestedTypes.has(definition.type))
      .flatMap((definition) => {
        const rawSeries = csv[definition.index];
        if (!Array.isArray(rawSeries)) {
          return [];
        }
        return [
          {
            type: definition.type,
            index: definition.index,
            unit: definition.unit,
            includesShipping: definition.includesShipping,
            points: normalizeHistoryPoints(rawSeries, definition.includesShipping),
          },
        ];
      }),
    raw: product,
  };
}

function normalizeHistoryPoints(
  value: unknown[],
  includesShipping: boolean,
): Array<{
  keepaTime: number;
  timestamp: string;
  value: number;
  shipping: number | null;
}> {
  const stride = includesShipping ? 3 : 2;
  const points: Array<{
    keepaTime: number;
    timestamp: string;
    value: number;
    shipping: number | null;
  }> = [];
  for (let index = 0; index + stride - 1 < value.length; index += stride) {
    const keepaTime = value[index];
    const historyValue = value[index + 1];
    const shipping = includesShipping ? value[index + 2] : null;
    if (
      typeof keepaTime !== "number" ||
      !Number.isInteger(keepaTime) ||
      typeof historyValue !== "number" ||
      !Number.isInteger(historyValue) ||
      (shipping !== null && (typeof shipping !== "number" || !Number.isInteger(shipping)))
    ) {
      continue;
    }
    points.push({
      keepaTime,
      timestamp: keepaTimeToIso(keepaTime),
      value: historyValue,
      shipping,
    });
  }
  return points;
}

function collectImageUrls(product: Record<string, unknown>): string[] {
  const imageNames: string[] = [];
  if (Array.isArray(product.images)) {
    for (const item of product.images) {
      const image = optionalRecord(item);
      const name = optionalRawString(image?.l) ?? optionalRawString(image?.m);
      if (name) {
        imageNames.push(name);
      }
    }
  }
  const legacyImages = optionalRawString(product.imagesCSV);
  if (legacyImages) {
    imageNames.push(...legacyImages.split(",").map((value) => value.trim()));
  }
  return [...new Set(imageNames.filter(Boolean))].map((name) => `https://m.media-amazon.com/images/I/${name}`);
}

function normalizeSeller(sellerId: string, raw: Record<string, unknown>): Record<string, unknown> {
  return {
    sellerId: optionalRawString(raw.sellerId) ?? sellerId,
    sellerName: rawStringOrNull(raw.sellerName),
    currentRating: asNullableInteger(raw.currentRating),
    ratingCount: Array.isArray(raw.ratingCount) ? readIntegerArray(raw.ratingCount) : null,
    hasFba: typeof raw.hasFBA === "boolean" ? raw.hasFBA : null,
    shipsFromChina: typeof raw.shipsFromChina === "boolean" ? raw.shipsFromChina : null,
    raw,
  };
}

function keepaTimeToIso(keepaTime: number): string {
  return new Date((keepaTime + keepaTimeStartMinutes) * 60_000).toISOString();
}

function requireMarketplace(value: unknown): KeepaMarketplace {
  if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(marketplaceDomainIdByCode, value)) {
    throw new ProviderRequestError(400, "unsupported Keepa marketplace");
  }
  return value as KeepaMarketplace;
}

function requireDealPriceType(value: unknown): KeepaDealPriceType {
  if (typeof value !== "string" || !keepaDealPriceTypeSet.has(value as KeepaDealPriceType)) {
    throw new ProviderRequestError(400, "unsupported Keepa deal price type");
  }
  return value as KeepaDealPriceType;
}

function readRequestedHistoryTypes(value: unknown): Set<KeepaHistoryType> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const types = value.filter(
    (item): item is KeepaHistoryType => typeof item === "string" && keepaHistoryTypeSet.has(item as KeepaHistoryType),
  );
  return new Set(types);
}

function validateCategorySearchTerm(term: string): void {
  const keywords = term.split(" ").filter(Boolean);
  if (keywords.length === 0 || keywords.some((keyword) => keyword.length < 3)) {
    throw new ProviderRequestError(400, "each category search keyword must contain at least three characters");
  }
}

function assertProductRequestRules(input: Record<string, unknown>, asins: string[]): void {
  if (typeof input.offers === "number" && asins.length > 20) {
    throw new ProviderRequestError(400, "offers can only be requested for up to 20 ASINs");
  }
  if (input.onlyLiveOffers === true && typeof input.offers !== "number") {
    throw new ProviderRequestError(400, "onlyLiveOffers requires offers");
  }
}

function requireInputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return object;
}

function requireUpstreamString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ProviderRequestError(502, `Keepa response is missing ${fieldName}`);
  }
  return value;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const object = optionalRecord(item);
    return object ? [object] : [];
  });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readAsinArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "asins must be an array");
  }
  return value.map(normalizeAsin);
}

function normalizeAsin(value: unknown): string {
  if (typeof value !== "string" || value.length !== 10) {
    throw new ProviderRequestError(400, "ASIN must contain 10 ASCII letters or digits");
  }
  const asin = value.toUpperCase();
  for (const character of asin) {
    const code = character.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUppercaseLetter = code >= 65 && code <= 90;
    if (!isDigit && !isUppercaseLetter) {
      throw new ProviderRequestError(400, "ASIN must contain 10 ASCII letters or digits");
    }
  }
  return asin;
}

function readIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === "number" && Number.isInteger(item));
}

function readOptionalIntegerArray(value: unknown): number[] | undefined {
  return Array.isArray(value) ? readIntegerArray(value) : undefined;
}

function objectMapValues(value: unknown): Array<Record<string, unknown>> {
  const object = optionalRecord(value);
  if (!object) {
    return [];
  }
  return Object.values(object).flatMap((item) => {
    const child = optionalRecord(item);
    return child ? [child] : [];
  });
}

function objectMapEntries(value: unknown): Array<[string, Record<string, unknown>]> {
  const object = optionalRecord(value);
  if (!object) {
    return [];
  }
  return Object.entries(object).flatMap(([key, item]) => {
    const child = optionalRecord(item);
    return child ? [[key, child] as [string, Record<string, unknown>]] : [];
  });
}

function asNullableInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function metric(
  type: KeepaHistoryType,
  index: number,
  isPrice: boolean,
  includesShipping = false,
  unit: KeepaMetricDefinition["unit"] = "minor_currency_unit",
): KeepaMetricDefinition {
  return {
    type,
    index,
    isPrice,
    includesShipping,
    unit: isPrice ? "minor_currency_unit" : unit,
  };
}
