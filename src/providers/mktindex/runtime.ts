import type { CredentialValidationResult } from "../../core/types.ts";

import {
  compactObject,
  looseArray,
  optionalInteger,
  optionalNumber,
  optionalNumberLike,
  optionalRecord,
  optionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import { providerInputError, requiredInputString, requiredResponseRecord } from "../provider-runtime.ts";
import { mktindexApiBaseUrl, requestMktindexEnvelope, requestMktindexResult } from "./request.ts";

type MktindexActionContext = { apiKey: string; fetcher: typeof fetch };
type MktindexActionHandler = (input: Record<string, unknown>, context: MktindexActionContext) => Promise<unknown>;

const breakdownTypeByDimension = {
  category: "cat",
  brand: "brand",
  province: "provice",
} as const;

const regionBreakdownTypeByDimension = {
  category: "cat",
  brand: "brand",
  city: "city",
} as const;

const mktindexMmiActionHandlers = {
  async list_categories(input, context) {
    const result = requiredResponseRecord(
      await requestMktindexResult({
        path: "/cats_tree",
        apiKey: context.apiKey,
        query: compactObject({
          plat: requiredInputString(input.platform, "platform"),
          rcid: optionalString(input.rootCategoryId),
          lang: optionalString(input.language),
          last_time: optionalString(input.lastUpdatedAt),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
      "Moojing category result",
    );
    const children = recordOrEmpty(result.childrenList);

    return {
      rootCategoryIds: looseArray(result.bigCategory).map(String),
      maxDepth: optionalInteger(result.maxDepth) ?? null,
      categories: Object.entries(children).flatMap(([fallbackId, value]) => {
        const category = optionalRecord(value);
        if (!category) {
          return [];
        }
        return [
          {
            id: optionalString(category.category_id) ?? fallbackId,
            name: optionalString(category.name) ?? null,
            englishName: optionalString(category.category_name_en) ?? null,
            parentId: optionalString(category.parent_id) ?? null,
            level: optionalInteger(category.level) ?? null,
            childIds: looseArray(category.chd).map(String),
            hasBrand:
              typeof category.has_brand === "boolean"
                ? category.has_brand
                : typeof category.has_brand === "number"
                  ? category.has_brand !== 0
                  : null,
            raw: category,
          },
        ];
      }),
    };
  },
  async get_data_range(input, context) {
    const result = requiredResponseRecord(
      await requestMktindexResult({
        path: "/latesttime",
        apiKey: context.apiKey,
        query: compactObject({
          plat: requiredInputString(input.platform, "platform"),
          cid: optionalString(input.categoryId),
          bid: optionalString(input.brandId),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
      "Moojing data range result",
    );
    return {
      startMonth: optionalString(result.start) ?? null,
      endMonth: optionalString(result.end) ?? null,
      raw: result,
    };
  },
  async list_subscriptions(input, context) {
    const result = requiredResponseRecord(
      await requestMktindexResult({
        path: "/marked",
        apiKey: context.apiKey,
        query: compactObject({
          isdashboard: input.mode === "subscribed" ? "true" : "false",
          lang: optionalString(input.language),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
      "Moojing subscription result",
    );
    return {
      subscriptions: objectArray(result.data),
    };
  },
  async get_jd_data_versions(input, context) {
    const platform = requiredInputString(input.platform, "platform");
    const result = await requestMktindexResult({
      path: `/platform/${encodeURIComponent(platform)}/version`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { versions: looseArray(result).map(String) };
  },
  async search_brands(input, context) {
    const query = requiredInputString(input.query, "query");
    const result = await requestMktindexResult({
      path: `/search/${encodeURIComponent(query)}`,
      apiKey: context.apiKey,
      query: compactObject({ currency: optionalString(input.currency) }),
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { results: objectArray(result) };
  },
  async get_market_summary(input, context) {
    const result = requiredResponseRecord(
      await requestMarketEndpoint(input, context, "/summary", {
        start: requiredInputString(input.month, "month"),
        lang: requiredInputString(input.language, "language"),
      }),
      "Moojing market summary result",
    );
    return normalizeMarketSummary(result);
  },
  async get_market_trend(input, context) {
    const result = requiredResponseRecord(
      await requestMarketEndpoint(input, context, "/trend", {
        type: requiredInputString(input.period, "period"),
        YoY: input.includeYearOverYear === true ? "true" : undefined,
      }),
      "Moojing market trend result",
    );
    return { series: result };
  },
  async list_market_breakdown(input, context) {
    const dimension = requiredInputString(input.dimension, "dimension");
    const upstreamType = breakdownTypeByDimension[dimension as keyof typeof breakdownTypeByDimension];
    if (!upstreamType) {
      throw providerInputError(`unsupported dimension: ${dimension}`);
    }
    const result = await requestPaginatedMarketEndpoint(input, context, "/list", {
      type: upstreamType,
    });
    return { count: result.count, rows: result.rows };
  },
  async list_hot_shops(input, context) {
    const result = await requestPaginatedMarketEndpoint(input, context, "/hot_shops");
    return { count: result.count, shops: result.rows };
  },
  async list_hot_items(input, context) {
    const result = await requestPaginatedMarketEndpoint(input, context, "/hot_items");
    return { count: result.count, items: result.rows };
  },
  async compare_market_periods(input, context) {
    return rawData(
      await requestMarketEndpoint(input, context, "/compare", {
        compare_range: serializeComparisonRanges(input.ranges),
      }),
    );
  },
  async get_region_market_summary(input, context) {
    return rawData(
      await requestRegionMarketEndpoint(input, context, "/summary", {
        start: requiredInputString(input.month, "month"),
        lang: requiredInputString(input.language, "language"),
      }),
    );
  },
  async get_region_market_trend(input, context) {
    return rawData(
      await requestRegionMarketEndpoint(input, context, "/trend", {
        type: requiredInputString(input.period, "period"),
      }),
    );
  },
  async list_region_market_breakdown(input, context) {
    const dimension = requiredInputString(input.dimension, "dimension");
    const upstreamType = regionBreakdownTypeByDimension[dimension as keyof typeof regionBreakdownTypeByDimension];
    if (!upstreamType) {
      throw providerInputError(`unsupported region dimension: ${dimension}`);
    }
    return rawData(
      await requestRegionMarketEndpoint(input, context, "/list", {
        start: requiredInputString(input.month, "month"),
        type: upstreamType,
        page: String(optionalInteger(input.page) ?? 1),
        page_size: String(optionalInteger(input.pageSize) ?? 10),
      }),
    );
  },
  async list_region_hot_shops(input, context) {
    return rawData(
      await requestRegionMarketEndpoint(input, context, "/hot_shops", {
        start: requiredInputString(input.month, "month"),
        page: String(optionalInteger(input.page) ?? 1),
        page_size: String(optionalInteger(input.pageSize) ?? 10),
      }),
    );
  },
  async list_region_hot_items(input, context) {
    return rawData(
      await requestRegionMarketEndpoint(input, context, "/hot_items", {
        start: requiredInputString(input.month, "month"),
        page: String(optionalInteger(input.page) ?? 1),
        page_size: String(optionalInteger(input.pageSize) ?? 10),
      }),
    );
  },
  async compare_region_market_periods(input, context) {
    return rawData(
      await requestRegionMarketEndpoint(input, context, "/compare", {
        compare_range: serializeComparisonRanges(input.ranges),
      }),
    );
  },
  async get_comment_trend(input, context) {
    return rawData(
      await requestMarketEndpoint(input, context, "/comment_trend", {
        type: requiredInputString(input.period, "period"),
      }),
    );
  },
  async list_brand_categories(input, context) {
    const platform = requiredInputString(input.platform, "platform");
    const brandId = requiredInputString(input.brandId, "brandId");
    const result = await requestMktindexResult({
      path: `/brandcat/platform/${encodeURIComponent(platform)}/brand/${encodeURIComponent(brandId)}/cats`,
      apiKey: context.apiKey,
      query: compactObject({ currency: optionalString(input.currency) }),
      fetcher: context.fetcher,
      phase: "execute",
    });
    return { categories: objectArray(result) };
  },
  async get_price_distribution(input, context) {
    assertPriceDistributionInput(input);
    const result = requiredResponseRecord(
      await requestMarketEndpoint(input, context, "/price_range", {
        start: requiredInputString(input.month, "month"),
        pricelist: Array.isArray(input.priceBreakpoints) ? input.priceBreakpoints.map(String).join(",") : undefined,
        interval_size: optionalNumberString(input.intervalSize),
        min_price: optionalNumberString(input.minPrice),
        max_price: optionalNumberString(input.maxPrice),
        range_length: optionalNumberString(input.rangeCount),
      }),
      "Moojing price distribution result",
    );
    return {
      ranges: looseArray(result.price_range).flatMap((value) => {
        if (!Array.isArray(value)) {
          return [];
        }
        return [
          {
            label: String(value[0] ?? ""),
            itemShare: optionalNumberLike(value[1]) ?? null,
            sold: optionalNumberLike(value[2]) ?? null,
            sales: optionalNumberLike(value[3]) ?? null,
            raw: value,
          },
        ];
      }),
    };
  },
  async get_platform_sales_trends(input, context) {
    return rawData(
      await requestMktindexResult({
        path: "/summary",
        apiKey: context.apiKey,
        query: compactObject({
          type: requiredInputString(input.period, "period"),
          start: requiredInputString(input.startMonth, "startMonth"),
          currency: optionalString(input.currency),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async list_spus(input, context) {
    return rawData(
      await requestMarketEndpoint(input, context, "/spu", {
        start: requiredInputString(input.month, "month"),
      }),
    );
  },
  async get_spu(input, context) {
    const platform = requiredInputString(input.platform, "platform");
    const spuId = requiredInputString(input.spuId, "spuId");
    return rawData(
      await requestMktindexResult({
        path: `/platform/${encodeURIComponent(platform)}/spu/${encodeURIComponent(spuId)}`,
        apiKey: context.apiKey,
        query: compactObject({
          start: requiredInputString(input.month, "month"),
          currency: optionalString(input.currency),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async list_category_attributes(input, context) {
    const platform = requiredInputString(input.platform, "platform");
    const categoryId = requiredInputString(input.categoryId, "categoryId");
    return rawData(
      await requestMktindexResult({
        path: `/platform/${encodeURIComponent(platform)}/cats/${encodeURIComponent(categoryId)}/attrtable`,
        apiKey: context.apiKey,
        query: { start: requiredInputString(input.month, "month") },
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async list_attribute_performance(input, context) {
    if (input.mode === "single_attribute" && optionalString(input.attributeName) === undefined) {
      throw providerInputError("attributeName is required when mode is single_attribute");
    }
    const platform = requiredInputString(input.platform, "platform");
    const categoryId = requiredInputString(input.categoryId, "categoryId");
    return rawData(
      await requestMktindexResult({
        path: `/platform/${encodeURIComponent(platform)}/cats/${encodeURIComponent(categoryId)}/attr_top`,
        apiKey: context.apiKey,
        query: compactObject({
          start: requiredInputString(input.month, "month"),
          type: input.mode === "single_attribute" ? "single" : "couple",
          attr_name: optionalString(input.attributeName),
          currency: optionalString(input.currency),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async get_attribute_summary(input, context) {
    const attributeCount = Object.keys(recordOrEmpty(input.attributes)).length;
    if (attributeCount < 1 || attributeCount > 2) {
      throw providerInputError("attributes must contain one or two selections");
    }
    const platform = requiredInputString(input.platform, "platform");
    const categoryId = requiredInputString(input.categoryId, "categoryId");
    return rawData(
      await requestMktindexResult({
        path: `/platform/${encodeURIComponent(platform)}/cats/${encodeURIComponent(categoryId)}/attr_summary`,
        apiKey: context.apiKey,
        query: compactObject({
          brandid: requiredInputString(input.brandId, "brandId"),
          attrs: JSON.stringify(recordOrEmpty(input.attributes)),
          start: requiredInputString(input.month, "month"),
          currency: optionalString(input.currency),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async get_shop_sales_trend(input, context) {
    return rawData(
      await requestMktindexResult({
        path: "/shop/sale/trend",
        apiKey: context.apiKey,
        query: compactObject({
          plat: requiredInputString(input.platform, "platform"),
          uid: requiredInputString(input.shopId, "shopId"),
          cat_id: requiredInputString(input.categoryId, "categoryId"),
          brand_id: requiredInputString(input.brandId, "brandId"),
          start: requiredInputString(input.startMonth, "startMonth"),
          currency: optionalString(input.currency),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async get_item_sales_trend(input, context) {
    return rawData(
      await requestMktindexResult({
        path: "/item/sale/trend",
        apiKey: context.apiKey,
        query: compactObject({
          plat: requiredInputString(input.platform, "platform"),
          item_id: requiredInputString(input.itemId, "itemId"),
          start: requiredInputString(input.startMonth, "startMonth"),
          currency: optionalString(input.currency),
        }),
        fetcher: context.fetcher,
        phase: "execute",
      }),
    );
  },
  async get_shop_details(input, context) {
    assertShopDetailsInput(input);
    const envelope = await requestMktindexEnvelope({
      path: "/shopdetail",
      apiKey: context.apiKey,
      query: compactObject({
        plat: requiredInputString(input.platform, "platform"),
        start: requiredInputString(input.startMonth, "startMonth"),
        end: optionalString(input.endMonth),
        shopname: optionalStringList(input.shopNames),
        id: optionalStringList(input.shopIds),
        currency: optionalString(input.currency),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });
    return {
      shops: objectArray(envelope.result),
      errors: looseArray(envelope.errors).map(String),
    };
  },
} satisfies Record<string, MktindexActionHandler>;

export const mktindexActionHandlers: Record<string, MktindexActionHandler> = { ...mktindexMmiActionHandlers };

export async function validateMktindexCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  requiredResponseRecord(
    await requestMktindexResult({
      path: "/marked",
      apiKey: requiredInputString(input.apiKey, "apiKey"),
      query: { isdashboard: "true", lang: "zh" },
      fetcher,
      phase: "validate",
    }),
    "Moojing credential validation result",
  );

  return {
    profile: { displayName: "Moojing Insights API Key" },
    metadata: {
      apiBaseUrl: mktindexApiBaseUrl,
      validationEndpoint: "/marked",
    },
  };
}

async function requestPaginatedMarketEndpoint(
  input: Record<string, unknown>,
  context: MktindexActionContext,
  suffix: string,
  extraQuery: Record<string, string | undefined> = {},
) {
  const result = requiredResponseRecord(
    await requestMarketEndpoint(input, context, suffix, {
      start: requiredInputString(input.month, "month"),
      page: String(optionalInteger(input.page) ?? 1),
      page_size: String(optionalInteger(input.pageSize) ?? 10),
      ...extraQuery,
    }),
    "Moojing paginated market result",
  );
  return {
    count: optionalInteger(result.count) ?? 0,
    rows: objectArray(result.data),
  };
}

function requestMarketEndpoint(
  input: Record<string, unknown>,
  context: MktindexActionContext,
  suffix: string,
  query: Record<string, string | undefined>,
) {
  const platform = requiredInputString(input.platform, "platform");
  const categoryId = requiredInputString(input.categoryId, "categoryId");
  const brandId = requiredInputString(input.brandId, "brandId");
  return requestMktindexResult({
    path: `/platform/${encodeURIComponent(platform)}/cats/${encodeURIComponent(categoryId)}/brands/${encodeURIComponent(brandId)}${suffix}`,
    apiKey: context.apiKey,
    query: compactObject({ ...query, currency: optionalString(input.currency) }),
    fetcher: context.fetcher,
    phase: "execute",
  });
}

function requestRegionMarketEndpoint(
  input: Record<string, unknown>,
  context: MktindexActionContext,
  suffix: string,
  query: Record<string, string | undefined>,
) {
  const platform = requiredInputString(input.platform, "platform");
  const province = requiredInputString(input.province, "province");
  const city = requiredInputString(input.city, "city");
  const categoryId = requiredInputString(input.categoryId, "categoryId");
  const brandId = requiredInputString(input.brandId, "brandId");
  return requestMktindexResult({
    path: `/platform/${encodeURIComponent(platform)}/province/${encodeURIComponent(province)}/city/${encodeURIComponent(city)}/cats/${encodeURIComponent(categoryId)}/brands/${encodeURIComponent(brandId)}${suffix}`,
    apiKey: context.apiKey,
    query: compactObject({ ...query, currency: optionalString(input.currency) }),
    fetcher: context.fetcher,
    phase: "execute",
  });
}

function normalizeMarketSummary(result: Record<string, unknown>) {
  return {
    sales: optionalNumber(result.sales) ?? optionalNumber(result.sale) ?? null,
    sold: optionalNumber(result.sold) ?? null,
    averagePrice: optionalNumber(result.avg_price) ?? null,
    marketShare: optionalNumber(result.market_share) ?? null,
    shopCount: optionalNumber(result.shop_num) ?? null,
    itemCount: optionalNumber(result.item_num) ?? null,
    names: recordOrEmpty(result.names),
    raw: result,
  };
}

function serializeComparisonRanges(value: unknown) {
  return JSON.stringify(
    looseArray(value).map((item) => {
      const range = requiredResponseRecord(item, "comparison range");
      const startMonth = requiredInputString(range.startMonth, "startMonth");
      const endMonth = requiredInputString(range.endMonth, "endMonth");
      if (monthIndex(endMonth) < monthIndex(startMonth)) {
        throw providerInputError("endMonth must not be earlier than startMonth");
      }
      return `${startMonth},${endMonth}`;
    }),
  );
}

function assertPriceDistributionInput(input: Record<string, unknown>) {
  const hasBreakpoints = Array.isArray(input.priceBreakpoints);
  const hasGeneratedRange = [input.intervalSize, input.minPrice, input.maxPrice, input.rangeCount].every(
    (value) => value !== undefined,
  );
  const generatedRangeIsOrdered =
    !hasGeneratedRange || (optionalNumber(input.maxPrice) ?? 0) > (optionalNumber(input.minPrice) ?? 0);
  if (input.categoryId === "0" || hasBreakpoints === hasGeneratedRange || !generatedRangeIsOrdered) {
    throw providerInputError(
      "categoryId cannot be 0; provide priceBreakpoints or complete generated-range parameters, with maxPrice greater than minPrice",
    );
  }
}

function assertShopDetailsInput(input: Record<string, unknown>) {
  if (Array.isArray(input.shopNames) === Array.isArray(input.shopIds)) {
    throw providerInputError("Provide exactly one of shopNames or shopIds");
  }
  const endMonth = optionalString(input.endMonth);
  if (endMonth === undefined) return;
  const startMonth = requiredInputString(input.startMonth, "startMonth");
  const monthSpan = monthIndex(endMonth) - monthIndex(startMonth);
  if (monthSpan < 0 || monthSpan > 12) {
    throw providerInputError("endMonth must be between startMonth and 12 months after it");
  }
}

function monthIndex(value: string) {
  const separator = value.includes("-") ? "-" : "_";
  const [year, month] = value.split(separator).map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month === undefined || month < 1 || month > 12) {
    throw providerInputError("month must use YYYY-MM or YYYY_MM format");
  }
  return year! * 12 + month;
}

function rawData(data: unknown) {
  return { data };
}

function objectArray(value: unknown) {
  return looseArray(value).flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function optionalNumberString(value: unknown) {
  const number = optionalNumber(value);
  return number === undefined ? undefined : String(number);
}

function optionalStringList(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(",") : undefined;
}
