import type { SorftimeActionName } from "./actions.ts";

import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface SorftimeCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const sorftimeApiBaseUrl = "https://cli.sorftime.com/api/";

const endpointByActionName = {
  get_product_details: "ProductRequest",
  search_products_by_name: "ProductSearchFromName",
  search_categories_by_name: "CategorySearchFromName",
  get_category_best_sellers: "CategoryRequest",
  get_category_trend: "CategoryTrend",
  get_keyword_details: "KeywordRequest",
  extend_keywords: "KeywordExtends",
  reverse_lookup_asin_keywords: "ASINRequestKeyword",
  get_credit_balance: "CoinQuery",
  list_credit_usage: "CoinStream",
  get_request_usage: "RequestStreamMonth",
  search_products: "ProductSearch",
  get_asin_sales_history: "AsinSalesVolume",
  get_product_variations: "ProductVariations",
  get_product_review_summary: "ProductCustomersSay",
  list_product_reviews: "ProductReviewsQuery",
  list_category_products: "CategoryProducts",
  search_keywords: "KeywordQuery",
  get_keyword_search_results: "KeywordSearchResults",
  get_keyword_search_result_trend: "KeywordSearchResultTrend",
  reverse_lookup_category_keywords: "CategoryRequestKeyword",
  get_keyword_product_rankings: "KeywordProductRanking",
  get_asin_keyword_rankings: "ASINKeywordRanking",
} as const satisfies Record<SorftimeActionName, string>;

type SorftimeRequestPhase = "validate" | "execute";

export async function validateSorftimeCredential(
  input: { apiKey?: string },
  fetcher: typeof fetch,
): Promise<SorftimeCredentialCheck> {
  const payload = await requestSorftime({
    endpoint: "RequestStreamMonth",
    domain: 1,
    body: {},
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    fetcher,
    phase: "validate",
  });

  return {
    accountLabel: "Sorftime Account-SK",
    providerScopes: [],
    providerMetadata: compactObject({
      apiBaseUrl: sorftimeApiBaseUrl,
      validationEndpoint: "RequestStreamMonth",
      requestLeft: optionalNumber(payload.RequestLeft),
    }),
  };
}

export function executeSorftimeAction(
  actionName: SorftimeActionName,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  input = normalizeSorftimeInput(input);
  validateSorftimeInput(actionName, input);
  return requestSorftime({
    endpoint: endpointByActionName[actionName],
    domain: optionalInteger(input.domain) ?? 1,
    body: buildSorftimeBody(actionName, input),
    apiKey,
    fetcher,
    phase: "execute",
  });
}

function normalizeSorftimeInput(input: Record<string, unknown>): Record<string, unknown> {
  const normalize = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return key?.toLowerCase() === "asin" ? trimmed.toUpperCase() : trimmed;
    }
    if (Array.isArray(value)) return value.map((item) => normalize(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, normalize(item, name)]));
    }
    return value;
  };
  return normalize(input) as Record<string, unknown>;
}

function validateSorftimeInput(actionName: SorftimeActionName, input: Record<string, unknown>): void {
  switch (actionName) {
    case "get_product_details":
      requireStartWhenEnd(input, "query_trend_start_date", "query_trend_end_date");
      if (input.trend === 2 && (input.query_trend_start_date || input.query_trend_end_date)) {
        throw new ProviderRequestError(400, "trend must be 1 when a trend date range is provided");
      }
      return;
    case "get_category_best_sellers": {
      requirePaired(input, "query_start", "query_date");
      if (input.query_start && input.query_date) {
        const domain = optionalInteger(input.domain) ?? 1;
        if ([5, 12, 14].includes(domain)) {
          throw new ProviderRequestError(400, "historical category lookup is not supported for domains 5, 12, or 14");
        }
        const dayCount =
          (Date.parse(String(input.query_date)) - Date.parse(String(input.query_start))) / 86_400_000 + 1;
        if (dayCount < 3 || dayCount > 40) {
          throw new ProviderRequestError(400, "historical category date ranges must span 3 to 40 days");
        }
      }
      return;
    }
    case "list_credit_usage":
      requirePaired(input, "query_start_date", "query_end_date");
      requireOrdered(input, "query_start_date", "query_end_date");
      return;
    case "search_products": {
      const domain = optionalInteger(input.domain) ?? 1;
      if (input.query_month && [5, 12, 13].includes(domain)) {
        throw new ProviderRequestError(400, "historical product search is not supported for domains 5, 12, or 13");
      }
      for (const [minimum, maximum] of [
        ["price_min", "price_max"],
        ["monthly_sales_min", "monthly_sales_max"],
        ["rating_min", "rating_max"],
        ["reviews_min", "reviews_max"],
        ["subcategory_rank_min", "subcategory_rank_max"],
        ["variation_count_min", "variation_count_max"],
        ["category_rank_min", "category_rank_max"],
      ] as const) {
        if (
          typeof input[minimum] === "number" &&
          typeof input[maximum] === "number" &&
          input[minimum] > input[maximum]
        ) {
          throw new ProviderRequestError(400, `${minimum} must not be greater than ${maximum}`);
        }
      }
      requireOrdered(input, "listed_from", "listed_to", "listed_from must not be later than listed_to");
      return;
    }
    case "get_asin_sales_history":
      requireStartWhenEnd(input, "query_start_date", "query_end_date");
      requireOrdered(input, "query_start_date", "query_end_date");
      return;
    case "get_keyword_search_result_trend":
    case "get_asin_keyword_rankings":
      requireStartWhenEnd(input, "query_start", "query_end");
      requireOrdered(input, "query_start", "query_end", "query_start must not be later than query_end");
      return;
    case "get_keyword_product_rankings": {
      const domain = optionalInteger(input.domain) ?? 1;
      if (domain === 1 && !input.month) throw new ProviderRequestError(400, "month is required for the US marketplace");
      if (domain !== 1 && input.month)
        throw new ProviderRequestError(400, "month is only supported for the US marketplace");
      return;
    }
    default:
      return;
  }
}

function requirePaired(input: Record<string, unknown>, start: string, end: string): void {
  if (Boolean(input[start]) !== Boolean(input[end])) {
    throw new ProviderRequestError(400, `${start} and ${end} must be provided together`);
  }
}

function requireStartWhenEnd(input: Record<string, unknown>, start: string, end: string): void {
  if (input[end] && !input[start]) throw new ProviderRequestError(400, `${start} is required when ${end} is provided`);
}

function requireOrdered(
  input: Record<string, unknown>,
  start: string,
  end: string,
  message = `${start} must not be later than ${end}`,
): void {
  if (typeof input[start] === "string" && typeof input[end] === "string" && input[start] > input[end]) {
    throw new ProviderRequestError(400, message);
  }
}

function buildSorftimeBody(actionName: SorftimeActionName, input: Record<string, unknown>) {
  switch (actionName) {
    case "get_product_details":
      return compactObject({
        ASIN: input.asin,
        Trend: input.trend,
        QueryTrendStartDt: input.query_trend_start_date,
        QueryTrendEndDt: input.query_trend_end_date,
      });
    case "search_products_by_name":
      return compactObject({
        Name: input.name,
        PageIndex: input.page_index,
      });
    case "search_categories_by_name":
      return { Name: input.name };
    case "get_category_best_sellers":
      return compactObject({
        NodeId: input.node_id,
        QueryStart: input.query_start,
        QueryDate: input.query_date,
      });
    case "get_category_trend":
      return {
        NodeId: input.node_id,
        TrendIndex: input.trend_index,
      };
    case "get_keyword_details":
      return { Keyword: input.keyword };
    case "extend_keywords":
      return compactObject({
        Keyword: input.keyword,
        PageIndex: input.page_index,
        PageSize: input.page_size,
      });
    case "reverse_lookup_asin_keywords":
      return compactObject({
        ASIN: input.asin,
        PageIndex: input.page_index,
        PageSize: input.page_size,
      });
    case "get_credit_balance":
    case "get_request_usage":
      return {};
    case "list_credit_usage":
      return compactObject({
        Platform:
          input.platform === "amazon"
            ? 0
            : input.platform === "shopee"
              ? 1
              : input.platform === "walmart"
                ? 2
                : undefined,
        QueryDate:
          input.query_start_date && input.query_end_date ? [input.query_start_date, input.query_end_date] : undefined,
        PageIndex: input.page_index,
        PageSize: input.page_size,
      });
    case "search_products":
      return compactObject({
        QueryMonth: input.query_month,
        Page: input.page,
        ASIN: input.asin,
        NodeId: input.node_id,
        Brand: input.brand,
        SellerName: input.seller_name,
        SellerId: input.seller_id,
        Keyword: input.keyword,
        AttributeName: input.attribute_name,
        PeakSellingSeason: Array.isArray(input.peak_selling_months) ? input.peak_selling_months.join(",") : undefined,
        ShippingType: input.shipping_type,
        PriceRangeMin: input.price_min,
        PriceRangeMax: input.price_max,
        MonthSaleVolumeRangeMin: input.monthly_sales_min,
        MonthSaleVolumeRangeMax: input.monthly_sales_max,
        OnlineDateRangeMin: input.listed_from,
        OnlineDateRangeMax: input.listed_to,
        StarRangeMin: input.rating_min,
        StarRangeMax: input.rating_max,
        CommentCountRangeMin: input.reviews_min,
        CommentCountRangeMax: input.reviews_max,
        SubCategoryRankRangeMin: input.subcategory_rank_min,
        SubCategoryRankRangeMax: input.subcategory_rank_max,
        VariationCountRangeMin: input.variation_count_min,
        VariationCountRangeMax: input.variation_count_max,
        CategoryRankRangeMin: input.category_rank_min,
        CategoryRankRangeMax: input.category_rank_max,
      });
    case "get_asin_sales_history":
      return compactObject({
        ASIN: input.asin,
        Page: input.page,
        QueryDate: input.query_start_date,
        QueryEndDate: input.query_end_date,
      });
    case "get_product_variations":
      return compactObject({
        Asin: input.asin,
        PageIndex: input.page_index,
        IsSalesVolume: input.include_sales_volume,
      });
    case "get_product_review_summary":
      return { Asin: input.asin };
    case "list_product_reviews":
      return compactObject({
        ASIN: input.asin,
        Querystartdt: input.query_start_date,
        PageIndex: input.page_index,
        Star: Array.isArray(input.stars) ? input.stars.join(",") : undefined,
        OnlyPurchase:
          typeof input.verified_purchase_only === "boolean" ? Number(input.verified_purchase_only) : undefined,
      });
    case "list_category_products":
      return compactObject({
        NodeId: input.node_id,
        Page: input.page,
        Range: input.range,
      });
    case "search_keywords":
      return compactObject({
        Pattern: compactObject({
          Keyword: input.keyword,
          NodeIdRange: Array.isArray(input.node_ids) ? input.node_ids.join(",") : undefined,
          RankCondition: input.rank_condition,
          SearchVolumeCondition: input.search_volume_condition,
          RankChangeOfWeeklyCondition: input.weekly_rank_change_condition,
          History: input.history,
        }),
        PageIndex: input.page_index,
        PageSize: input.page_size,
      });
    case "get_keyword_search_results":
      return compactObject({
        Keyword: input.keyword,
        PositionType:
          input.position_type === "all"
            ? 0
            : input.position_type === "organic"
              ? 1
              : input.position_type === "ad"
                ? 2
                : undefined,
        PageIndex: input.page_index,
        PageSize: input.page_size,
      });
    case "get_keyword_search_result_trend":
      return compactObject({
        Keyword: input.keyword,
        QueryStart: input.query_start,
        QueryEnd: input.query_end,
      });
    case "reverse_lookup_category_keywords":
      return compactObject({
        Nodeid: input.node_id,
        PageIndex: input.page_index,
        PageSize: input.page_size,
      });
    case "get_keyword_product_rankings":
      return compactObject({
        Keyword: input.keyword,
        Month: input.month,
        Page: input.page,
      });
    case "get_asin_keyword_rankings":
      return compactObject({
        Keyword: input.keyword,
        ASIN: input.asin,
        QueryStart: input.query_start,
        QueryEnd: input.query_end,
        Page: input.page,
      });
  }
}

async function requestSorftime(input: {
  endpoint: string;
  domain: number;
  body: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  phase: SorftimeRequestPhase;
}) {
  const url = new URL(input.endpoint, sorftimeApiBaseUrl);
  url.searchParams.set("domain", String(input.domain));

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: "POST",
      headers: sorftimeHeaders(input.apiKey),
      body: JSON.stringify(input.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Sorftime request failed: ${error.message}` : "Sorftime request failed",
    );
  }

  const text = await response.text().catch(() => "");
  const payload = decodeSorftimePayload(text);
  if (!response.ok) {
    throw createSorftimeHttpError(response, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Sorftime returned an invalid response");
  }

  const code = optionalInteger(record.Code) ?? optionalInteger(record.code);
  if (code === undefined) {
    throw new ProviderRequestError(502, "Sorftime response did not include a status code");
  }
  if (code !== 0) {
    throw createSorftimeBusinessError(code, extractSorftimeMessage(record), input.phase);
  }

  return {
    ...record,
    RequestLeft:
      optionalNumber(record.RequestLeft) ?? optionalNumber(record.requestLeft) ?? optionalNumber(record.requestleft),
    RequestConsumed:
      optionalNumber(record.RequestConsumed) ??
      optionalNumber(record.requestConsumed) ??
      optionalNumber(record.requestconsumed),
    Code: 0,
    Message: optionalString(record.Message) ?? optionalString(record.message) ?? null,
    Data: record.Data !== undefined ? record.Data : record.data,
  };
}

function sorftimeHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `BasicAuth ${apiKey}`,
    browser: "Cli",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function decodeSorftimePayload(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const direct = parseJson(trimmed);
  if (direct.ok && typeof direct.value !== "string") {
    return direct.value;
  }

  const encoded = direct.ok && typeof direct.value === "string" ? direct.value : trimmed;
  const buffer = Buffer.from(encoded, "base64");
  for (const decompress of [gunzipSync, inflateSync, inflateRawSync]) {
    try {
      const decoded = parseJson(decompress(buffer).toString("utf8"));
      if (decoded.ok) {
        return decoded.value;
      }
    } catch {
      continue;
    }
  }

  return direct.ok ? direct.value : trimmed;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function createSorftimeHttpError(response: Response, payload: unknown, phase: SorftimeRequestPhase) {
  const message = extractSorftimeMessage(optionalRecord(payload)) ?? "Sorftime request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return phase === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(401, message);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function createSorftimeBusinessError(code: number, message: string | undefined, phase: SorftimeRequestPhase) {
  const detail = message ?? `Sorftime request failed with code ${code}`;
  if (phase === "validate") {
    return new ProviderRequestError(400, detail);
  }
  if ([500, 501, 502].includes(code)) {
    return new ProviderRequestError(429, detail);
  }
  if ([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 97].includes(code)) {
    return new ProviderRequestError(400, detail);
  }
  if ([4, 694].includes(code)) {
    return new ProviderRequestError(402, detail);
  }
  if ([20, 21, 98, 99].includes(code)) {
    return new ProviderRequestError(409, detail);
  }
  if ([400, 401, 402].includes(code)) {
    return new ProviderRequestError(403, detail);
  }
  return new ProviderRequestError(502, detail);
}

function extractSorftimeMessage(payload: Record<string, unknown> | undefined) {
  if (!payload) {
    return undefined;
  }
  return optionalString(payload.Message) ?? optionalString(payload.message);
}
