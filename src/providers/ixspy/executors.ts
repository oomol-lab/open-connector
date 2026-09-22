import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "ixspy";
const baseUrl = "https://open.ixspy.com";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type Kind =
  | "category_resource"
  | "category_children"
  | "list"
  | "product_statistics"
  | "store_statistics"
  | "product_trends"
  | "store_trends"
  | "rank_dates";
const configs: Record<string, { path: string; kind: Kind; method?: "GET" }> = {
  get_category_resource: { path: "/api/v1/aliexpress/category-resource", kind: "category_resource" },
  list_category_children: { path: "/api/v1/aliexpress/category-children", kind: "category_children" },
  search_categories: { path: "/api/v1/aliexpress/category-lookup", kind: "list" },
  search_products: { path: "/api/v1/aliexpress/product-search", kind: "list" },
  get_product_details: { path: "/api/v1/aliexpress/product-detail", kind: "list" },
  search_stores: { path: "/api/v1/aliexpress/store-search", kind: "list" },
  get_store_details: { path: "/api/v1/aliexpress/store-detail", kind: "list" },
  get_product_sku_sales: { path: "/api/v1/aliexpress/product-orders-sku-stat", kind: "product_statistics" },
  get_product_shipping_stats: { path: "/api/v1/aliexpress/product-orders-shipping-stat", kind: "product_statistics" },
  get_product_region_sales: { path: "/api/v1/aliexpress/product-orders-region-stat", kind: "product_statistics" },
  get_product_trends: { path: "/api/v1/aliexpress/product-trend-data", kind: "product_trends" },
  get_store_category_distribution: { path: "/api/v1/aliexpress/store-category-stat", kind: "store_statistics" },
  get_store_region_sales: { path: "/api/v1/aliexpress/store-orders-region-stat", kind: "store_statistics" },
  get_store_trends: { path: "/api/v1/aliexpress/store-trend-data", kind: "store_trends" },
  get_product_rank: { path: "/api/v1/aliexpress/product-rank", kind: "list" },
  get_region_product_rank: { path: "/api/v1/aliexpress/product-rank-by-region", kind: "list" },
  get_store_rank: { path: "/api/v1/aliexpress/store-rank", kind: "list" },
  get_keyword_rank: { path: "/api/v1/aliexpress/keyword-rank", kind: "list" },
  list_rank_dates: { path: "/api/v1/aliexpress/rank-date-list", kind: "rank_dates", method: "GET" },
  research_categories: { path: "/api/v1/aliexpress/category-research", kind: "list" },
  get_market_insights: { path: "/api/v1/aliexpress/market-insights", kind: "list" },
};
const keyOverrides: Record<string, string> = {
  averagePriceMax: "avg_price_max",
  averagePriceMin: "avg_price_min",
  choiceTypes: "choice_type",
  createdAfter: "created_time_min",
  createdBefore: "created_time_max",
  discoveredAfter: "discovered_time_start",
  discoveredBefore: "discovered_time_end",
  linkIds: "store_link_id",
  merchantIds: "store_merchant_id",
  productIds: "product_id_list",
  sales7dMax: "sales_count_7d_max",
  sales7dMin: "sales_count_7d_min",
  updatedAfter: "updated_time_min",
  updatedBefore: "updated_time_max",
};
const orderValues: Record<string, string> = {
  clickRate: "click_rate",
  conversionRate: "conversion_rate",
  createdTime: "created_time",
  discoveredTime: "discovered_time",
  sales7d: "sales_count_7d",
  searchGrowth: "searches_rise_index",
  searchPopularity: "search_cookies_count",
  totalFollowers: "total_followers",
  totalReviews: "total_reviews",
  totalSales: "total_sales",
};
const rankValues: Record<string, string> = {
  holidayNew: "holiday_new",
  holidayNormal: "holiday_normal",
  holidayRank: "holiday_rank",
  keywordRank: "keyword_rank",
  newGrowth: "new_inc",
  newHot: "new_hot",
  normalGrowth: "normal_inc",
  normalHot: "normal_hot",
  normalRank: "normal_rank",
};
const handlers = Object.fromEntries(
  Object.entries(configs).map(([name, config]) => [
    name,
    async (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
      normalize(config.kind, await request(name, config, input, context, false)),
  ]),
) as ProviderActionHandlers<"ixspy", Handler>;
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    const payload = await request(
      "list_category_children",
      configs.list_category_children!,
      { parentId: 0 },
      { ...context, apiKey: input.apiKey },
      true,
    );
    const data = requiredResponseRecord(payload.data, "IXSPY category data");
    return {
      profile: { accountId: "ixspy-api-key", displayName: "IXSPY API Key" },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: baseUrl,
        validationEndpoint: configs.list_category_children!.path,
        categoryCount: optionalInteger(data.count) ?? looseArray(data.children).length,
      },
    };
  },
};
async function request(
  name: string,
  config: { path: string; method?: "GET" },
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  validating: boolean,
) {
  const method = config.method ?? "POST";
  const body = upstream(name, input);
  return runProviderRequest({ signal: context.signal, label: "IXSPY" }, async (signal) => {
    const url = new URL(config.path, baseUrl);
    if (method === "GET")
      for (const [key, value] of Object.entries(body)) {
        if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
        else url.searchParams.set(key, String(value));
      }
    const response = await context.fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: method === "POST" ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = requiredResponseRecord(
      await readProviderJsonBody(response, { emptyBody: {}, invalidJsonMessage: "IXSPY returned invalid JSON" }),
      "IXSPY response",
    );
    const error = optionalRecord(payload.error);
    const code = optionalInteger(error?.code);
    if (code !== undefined && code !== 0) throw ixspyError(code, optionalString(error?.message), validating);
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        optionalString(error?.message) ?? `IXSPY request failed with HTTP ${response.status}`,
        payload,
      );
    if (code !== 0) throw providerResponseError("IXSPY response is missing a success code");
    return payload;
  });
}
function upstream(name: string, input: Record<string, unknown>) {
  return compactObject(
    Object.fromEntries(
      Object.entries(input).map(([key, value]) => {
        let field = keyOverrides[key] ?? snake(key);
        if (
          (name === "get_product_rank" || name === "get_region_product_rank") &&
          (key === "priceMin" || key === "priceMax")
        )
          field = key === "priceMin" ? "product_price_min" : "product_price_max";
        if (key === "hasVideo") value = value === true ? 1 : value === false ? 2 : value;
        if ((key === "isLeaf" || key === "styleZone") && typeof value === "boolean") value = value ? 1 : 0;
        if (key === "orderBy" && typeof value === "string") value = orderValues[value] ?? value;
        if (key === "rankType" && typeof value === "string") value = rankValues[value] ?? value;
        return [field, value];
      }),
    ),
  );
}
function snake(value: string) {
  let result = "";
  for (const character of value)
    result += character === character.toLowerCase() ? character : `_${character.toLowerCase()}`;
  return result;
}
function ixspyError(code: number, message: string | undefined, validating: boolean) {
  const detail = message?.trim() || `IXSPY error ${code}`;
  if (code === 10402 || code === 10404)
    return validating ? providerInputError(detail) : new ProviderRequestError(409, detail);
  if (code === 10429) return new ProviderRequestError(429, detail);
  if (code === 5024) return new ProviderRequestError(402, detail);
  if (code === 10422) return providerInputError(detail);
  return new ProviderRequestError(code === 5016 ? 404 : 502, detail);
}
function normalize(kind: Kind, payload: Record<string, unknown>) {
  const data = requiredResponseRecord(payload.data, "IXSPY data");
  const credits = optionalNumber(payload.credits) ?? null;
  if (kind === "category_resource") return { url: responseString(data.link, "category resource link"), credits };
  if (kind === "category_children")
    return {
      parentId: identifier(data.parent_id, "parent category ID"),
      count: optionalInteger(data.count) ?? looseArray(data.children).length,
      categories: looseArray(data.children),
      credits,
    };
  if (kind === "rank_dates")
    return {
      rankType: responseString(data.rank_type, "rank type"),
      dateTypes: looseArray(data.date_type_list),
      credits,
    };
  if (kind === "product_statistics" || kind === "store_statistics")
    return {
      entityId: identifier(data[kind === "product_statistics" ? "product_id" : "store_merchant_id"], "entity ID"),
      statistics: looseArray(data.stat_data),
      credits,
    };
  if (kind === "product_trends" || kind === "store_trends")
    return {
      entityId: identifier(data[kind === "product_trends" ? "product_id" : "store_merchant_id"], "entity ID"),
      startDate: optionalString(data.start_date) ?? null,
      endDate: optionalString(data.end_date) ?? null,
      points: looseArray(data.trend_data),
      credits,
    };
  return {
    items: looseArray(data.list),
    page: numberLike(data.page),
    pages: numberLike(data.pages),
    total: numberLike(data.total),
    credits,
  };
}
function identifier(value: unknown, label: string) {
  if (typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) return value;
  throw providerResponseError(`IXSPY ${label} is required`);
}
function responseString(value: unknown, label: string) {
  const result = optionalString(value);
  if (result != null) return result;
  throw providerResponseError(`IXSPY ${label} is required`);
}
function numberLike(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const result = Number(value);
    if (Number.isFinite(result)) return result;
  }
  return null;
}
