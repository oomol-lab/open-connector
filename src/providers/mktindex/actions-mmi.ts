import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mktindex";

const platformSchema = s.nonEmptyString(
  "The Moojing platform ID, such as all, tmall, jd, pdd, or meituan. Supported platforms vary by endpoint and subscription.",
);
const categoryIdSchema = s.nonEmptyString(
  "The Moojing category ID. Use 0 only when the selected endpoint supports all categories.",
);
const brandIdSchema = s.nonEmptyString("The Moojing brand ID. Use all to include every brand when supported.");
const monthSchema = s.nonEmptyString("The data month in YYYY-MM format.", {
  pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
});
const underscoreMonthSchema = s.nonEmptyString(
  "The data month in the YYYY_MM format required by this Moojing endpoint.",
  { pattern: "^\\d{4}_(0[1-9]|1[0-2])$" },
);
const languageSchema = s.stringEnum("The response language.", ["zh", "en"] as const);
const currencySchema = s.stringEnum("The currency used for monetary values.", [
  "CNY",
  "JPY",
  "GBP",
  "EUR",
  "USD",
] as const);
const periodSchema = s.stringEnum("The aggregation period used for the trend.", ["month", "quarter", "year"] as const);
const pageSchema = s.positiveInteger("The one-based result page number.", { default: 1 });
const pageSizeSchema = s.positiveInteger("The number of rows requested per page.", {
  maximum: 100,
  default: 10,
});
const rawObjectSchema = s.looseObject("The raw object returned by Moojing.");

const categorySchema = s.object("A normalized Moojing category.", {
  id: s.string("The category ID."),
  name: s.nullable(s.string("The Chinese category name when available.")),
  englishName: s.nullable(s.string("The English category name when available.")),
  parentId: s.nullable(s.string("The parent category ID when available.")),
  level: s.nullable(s.integer("The category tree level when available.")),
  childIds: s.array("The IDs of direct child categories.", s.string("A child category ID.")),
  hasBrand: s.nullable(s.boolean("Whether the category has brand data when reported.")),
  raw: rawObjectSchema,
});

const marketSelectorFields = {
  platform: platformSchema,
  categoryId: categoryIdSchema,
  brandId: brandIdSchema,
};

const paginatedMarketFields = {
  ...marketSelectorFields,
  month: monthSchema,
  page: pageSchema,
  pageSize: pageSizeSchema,
  currency: currencySchema,
};

const regionFields = {
  ...marketSelectorFields,
  province: s.nonWhitespaceString("The province name used to limit the regional market."),
  city: s.nonWhitespaceString("The city name, or all to include every city in the province."),
};

const comparisonRangeSchema = s.object("One inclusive comparison range.", {
  startMonth: monthSchema,
  endMonth: monthSchema,
});

const comparisonRangesSchema = s.array("Exactly two date ranges to compare.", comparisonRangeSchema, {
  minItems: 2,
  maxItems: 2,
});

function defineRawReadAction<const TName extends string>(input: {
  name: TName;
  description: string;
  inputSchema: JsonSchema;
  outputDescription: string;
  dataDescription: string;
}) {
  return defineProviderAction(service, {
    name: input.name,
    description: input.description,
    operationType: "read",
    inputSchema: input.inputSchema,
    outputSchema: s.object(input.outputDescription, {
      data: s.looseObject(input.dataDescription),
    }),
  });
}

const listCategoriesAction = defineProviderAction(service, {
  name: "list_categories",
  description: "List Moojing categories for an e-commerce platform.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Moojing categories.",
    {
      platform: platformSchema,
      rootCategoryId: s.nonEmptyString(
        "An optional category ID used to limit the response to that branch plus top-level categories.",
      ),
      language: languageSchema,
      lastUpdatedAt: s.nonEmptyString("An optional category update timestamp in YYYY-MM-DD HH:mm:ss format."),
    },
    { optional: ["rootCategoryId", "language", "lastUpdatedAt"] },
  ),
  outputSchema: s.object("The normalized Moojing category tree response.", {
    rootCategoryIds: s.array("The top-level category IDs returned by Moojing.", s.string("A top-level category ID.")),
    maxDepth: s.nullable(s.integer("The maximum category tree depth when reported.")),
    categories: s.array("The categories returned by Moojing.", categorySchema),
  }),
});

const getDataRangeAction = defineProviderAction(service, {
  name: "get_data_range",
  description: "Get the earliest and latest available Moojing data months for a market.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting the available Moojing data range.",
    {
      platform: platformSchema,
      categoryId: categoryIdSchema,
      brandId: brandIdSchema,
    },
    { optional: ["categoryId", "brandId"] },
  ),
  outputSchema: s.object("The available Moojing data range.", {
    startMonth: s.nullable(s.string("The earliest available data month.")),
    endMonth: s.nullable(s.string("The latest available data month.")),
    raw: rawObjectSchema,
  }),
});

const listSubscriptionsAction = defineProviderAction(service, {
  name: "list_subscriptions",
  description: "List markets subscribed to or followed by the connected Moojing account.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing subscribed or followed Moojing markets.",
    {
      mode: s.stringEnum("Whether to return subscribed or followed markets.", ["subscribed", "followed"] as const),
      language: languageSchema,
    },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The markets available to the connected Moojing account.", {
    subscriptions: s.array("The subscribed or followed market records.", rawObjectSchema),
  }),
});

const getJdDataVersionsAction = defineProviderAction(service, {
  name: "get_jd_data_versions",
  description: "List data-model versions available for a JD-related Moojing platform.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing JD data-model versions.", {
    platform: s.stringEnum("The JD-related Moojing platform ID.", [
      "jd",
      "jd_exclude_self",
      "jd_only_self",
      "jd_hk",
    ] as const),
  }),
  outputSchema: s.object("The available JD data-model versions.", {
    versions: s.array("The available version identifiers.", s.string("A data-model version.")),
  }),
});

const searchBrandsAction = defineProviderAction(service, {
  name: "search_brands",
  description: "Search Moojing brands by keyword or stock code.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching Moojing brands.",
    {
      query: s.nonWhitespaceString("The brand keyword or stock code to search for."),
      currency: currencySchema,
    },
    { optional: ["currency"] },
  ),
  outputSchema: s.object("The Moojing brand search response.", {
    results: s.array("The brand search result groups returned by Moojing.", rawObjectSchema),
  }),
});

const getMarketSummaryAction = defineProviderAction(service, {
  name: "get_market_summary",
  description: "Get monthly sales, volume, price, shop, item, and market-share metrics for a Moojing market.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Moojing market summary.",
    {
      ...marketSelectorFields,
      month: monthSchema,
      language: languageSchema,
      currency: currencySchema,
    },
    { optional: ["currency"] },
  ),
  outputSchema: s.object("The normalized Moojing market summary.", {
    sales: s.nullable(s.number("The market sales amount.")),
    sold: s.nullable(s.number("The market sales volume.")),
    averagePrice: s.nullable(s.number("The average item price.")),
    marketShare: s.nullable(s.number("The market share within the parent market.")),
    shopCount: s.nullable(s.number("The number of shops.")),
    itemCount: s.nullable(s.number("The number of items.")),
    names: rawObjectSchema,
    raw: rawObjectSchema,
  }),
});

const getMarketTrendAction = defineProviderAction(service, {
  name: "get_market_trend",
  description: "Get sales, volume, price, item, shop, and market-share trends for a Moojing market.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting Moojing market trends.",
    {
      ...marketSelectorFields,
      period: periodSchema,
      includeYearOverYear: s.boolean("Whether to request the additional year-over-year and period-over-period series."),
      currency: currencySchema,
    },
    { optional: ["includeYearOverYear", "currency"] },
  ),
  outputSchema: s.object("The Moojing market trend response.", {
    series: rawObjectSchema,
  }),
});

const listMarketBreakdownAction = defineProviderAction(service, {
  name: "list_market_breakdown",
  description: "List category, brand, or province rows within a Moojing market for one month.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing a Moojing market breakdown.",
    {
      ...paginatedMarketFields,
      dimension: s.stringEnum("The dimension used to break down the market.", [
        "category",
        "brand",
        "province",
      ] as const),
    },
    { optional: ["page", "pageSize", "currency"] },
  ),
  outputSchema: s.object("The paginated Moojing market breakdown.", {
    count: s.integer("The total number of available rows."),
    rows: s.array("The market breakdown rows returned by Moojing.", rawObjectSchema),
  }),
});

const listHotShopsAction = defineProviderAction(service, {
  name: "list_hot_shops",
  description: "List top-selling shops within a Moojing market for one month.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing top-selling Moojing shops.", paginatedMarketFields, {
    optional: ["page", "pageSize", "currency"],
  }),
  outputSchema: s.object("The paginated top-selling Moojing shops.", {
    count: s.integer("The total number of available shops."),
    shops: s.array("The shop rows returned by Moojing.", rawObjectSchema),
  }),
});

const listHotItemsAction = defineProviderAction(service, {
  name: "list_hot_items",
  description: "List top-selling items within a Moojing market for one month.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing top-selling Moojing items.", paginatedMarketFields, {
    optional: ["page", "pageSize", "currency"],
  }),
  outputSchema: s.object("The paginated top-selling Moojing items.", {
    count: s.integer("The total number of available items."),
    items: s.array("The item rows returned by Moojing.", rawObjectSchema),
  }),
});

const compareMarketPeriodsAction = defineRawReadAction({
  name: "compare_market_periods",
  description: "Compare sales and volume for two date ranges in a Moojing market.",
  inputSchema: s.object(
    "The input payload for comparing two Moojing market periods.",
    { ...marketSelectorFields, ranges: comparisonRangesSchema, currency: currencySchema },
    { optional: ["currency"] },
  ),
  outputDescription: "The two-period Moojing market comparison.",
  dataDescription: "The comparison metrics keyed by the requested ranges.",
});

const getRegionMarketSummaryAction = defineRawReadAction({
  name: "get_region_market_summary",
  description: "Get monthly summary metrics for a province or city within a Moojing market.",
  inputSchema: s.object(
    "The input payload for a regional Moojing market summary.",
    { ...regionFields, month: monthSchema, language: languageSchema, currency: currencySchema },
    { optional: ["currency"] },
  ),
  outputDescription: "The regional Moojing market summary.",
  dataDescription: "The provider-defined regional summary metrics.",
});

const getRegionMarketTrendAction = defineRawReadAction({
  name: "get_region_market_trend",
  description: "Get trend series for a province or city within a Moojing market.",
  inputSchema: s.object(
    "The input payload for a regional Moojing market trend.",
    { ...regionFields, period: periodSchema, currency: currencySchema },
    { optional: ["currency"] },
  ),
  outputDescription: "The regional Moojing market trend.",
  dataDescription: "The provider-defined regional trend series.",
});

const listRegionMarketBreakdownAction = defineRawReadAction({
  name: "list_region_market_breakdown",
  description: "List category, brand, or city rows within a regional Moojing market.",
  inputSchema: s.object(
    "The input payload for a regional Moojing market breakdown.",
    {
      ...regionFields,
      month: monthSchema,
      dimension: s.stringEnum("The dimension used to break down the regional market.", [
        "category",
        "brand",
        "city",
      ] as const),
      page: pageSchema,
      pageSize: pageSizeSchema,
      currency: currencySchema,
    },
    { optional: ["page", "pageSize", "currency"] },
  ),
  outputDescription: "The regional Moojing market breakdown.",
  dataDescription: "The provider-defined paginated regional rows.",
});

const listRegionHotShopsAction = defineRawReadAction({
  name: "list_region_hot_shops",
  description: "List top-selling shops within a regional Moojing market.",
  inputSchema: s.object(
    "The input payload for regional top-selling shops.",
    {
      ...regionFields,
      month: monthSchema,
      page: pageSchema,
      pageSize: pageSizeSchema,
      currency: currencySchema,
    },
    { optional: ["page", "pageSize", "currency"] },
  ),
  outputDescription: "The regional top-selling Moojing shops.",
  dataDescription: "The provider-defined paginated regional shop rows.",
});

const listRegionHotItemsAction = defineRawReadAction({
  name: "list_region_hot_items",
  description: "List top-selling items within a regional Moojing market.",
  inputSchema: s.object(
    "The input payload for regional top-selling items.",
    {
      ...regionFields,
      month: monthSchema,
      page: pageSchema,
      pageSize: pageSizeSchema,
      currency: currencySchema,
    },
    { optional: ["page", "pageSize", "currency"] },
  ),
  outputDescription: "The regional top-selling Moojing items.",
  dataDescription: "The provider-defined paginated regional item rows.",
});

const compareRegionMarketPeriodsAction = defineRawReadAction({
  name: "compare_region_market_periods",
  description: "Compare sales and volume for two date ranges in a regional Moojing market.",
  inputSchema: s.object(
    "The input payload for comparing regional Moojing market periods.",
    { ...regionFields, ranges: comparisonRangesSchema, currency: currencySchema },
    { optional: ["currency"] },
  ),
  outputDescription: "The two-period regional Moojing market comparison.",
  dataDescription: "The regional comparison metrics keyed by the requested ranges.",
});

const getCommentTrendAction = defineRawReadAction({
  name: "get_comment_trend",
  description: "Get review-count and sentiment-rate trends for a Moojing market.",
  inputSchema: s.object("The input payload for getting Moojing comment trends.", {
    ...marketSelectorFields,
    period: periodSchema,
  }),
  outputDescription: "The Moojing comment trend response.",
  dataDescription: "The good, neutral, bad, and comment-count series available for the platform.",
});

const listBrandCategoriesAction = defineProviderAction(service, {
  name: "list_brand_categories",
  description: "List categories and sales associated with a Moojing brand on a platform.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing categories associated with a brand.",
    { platform: platformSchema, brandId: brandIdSchema, currency: currencySchema },
    { optional: ["currency"] },
  ),
  outputSchema: s.object("The categories associated with the Moojing brand.", {
    categories: s.array("The provider-defined brand category rows.", rawObjectSchema),
  }),
});

const priceDistributionInputSchema = s.object(
  "The input payload for calculating a Moojing price distribution.",
  {
    ...marketSelectorFields,
    month: monthSchema,
    priceBreakpoints: s.array(
      "Custom price breakpoints used to build ranges.",
      s.number("One custom price breakpoint.", { minimum: 0 }),
      { minItems: 1 },
    ),
    intervalSize: s.number("The fixed size of each generated price interval.", {
      exclusiveMinimum: 0,
    }),
    minPrice: s.number("The minimum price included in generated intervals.", { minimum: 0 }),
    maxPrice: s.number("The maximum price included in generated intervals.", {
      exclusiveMinimum: 0,
    }),
    rangeCount: s.positiveInteger("The number of generated price intervals."),
    currency: currencySchema,
  },
  {
    optional: ["priceBreakpoints", "intervalSize", "minPrice", "maxPrice", "rangeCount", "currency"],
  },
);

const getPriceDistributionAction = defineProviderAction(service, {
  name: "get_price_distribution",
  description: "Get item share, volume, and sales across price ranges in a Moojing market.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: priceDistributionInputSchema,
  outputSchema: s.object("The normalized Moojing price distribution.", {
    ranges: s.array(
      "The returned price ranges.",
      s.object("One price range and its market metrics.", {
        label: s.string("The provider-defined price range label."),
        itemShare: s.nullable(s.number("The share of items in the range.")),
        sold: s.nullable(s.number("The sales volume in the range.")),
        sales: s.nullable(s.number("The sales amount in the range.")),
        raw: s.array("The raw tuple returned for the range.", s.unknown("A raw tuple value.")),
      }),
    ),
  }),
});

const getPlatformSalesTrendsAction = defineRawReadAction({
  name: "get_platform_sales_trends",
  description: "Get total sales trend series for each Moojing e-commerce platform.",
  inputSchema: s.object(
    "The input payload for total platform sales trends.",
    { period: periodSchema, startMonth: monthSchema, currency: currencySchema },
    { optional: ["currency"] },
  ),
  outputDescription: "The total sales trends grouped by platform.",
  dataDescription: "The provider-defined map from platform IDs to sales series.",
});

const listSpusAction = defineRawReadAction({
  name: "list_spus",
  description: "List product models or SPUs for a Tmall category and brand in one month.",
  inputSchema: s.object(
    "The input payload for listing Moojing SPUs.",
    {
      platform: s.literal("tmall", { description: "The Tmall platform supported by the official SPU endpoint." }),
      categoryId: categoryIdSchema,
      brandId: brandIdSchema,
      month: monthSchema,
      currency: currencySchema,
    },
    { optional: ["currency"] },
  ),
  outputDescription: "The Moojing SPU list.",
  dataDescription: "The provider-defined SPU count and rows.",
});

const getSpuAction = defineRawReadAction({
  name: "get_spu",
  description: "Get one Tmall product model or SPU with its items and shops.",
  inputSchema: s.object(
    "The input payload for getting one Moojing SPU.",
    {
      platform: s.literal("tmall", { description: "The Tmall platform supported by the official SPU endpoint." }),
      spuId: s.nonWhitespaceString("The Moojing SPU identifier."),
      month: monthSchema,
      currency: currencySchema,
    },
    { optional: ["currency"] },
  ),
  outputDescription: "The Moojing SPU detail response.",
  dataDescription: "The provider-defined SPU detail, item, shop, and breadcrumb fields.",
});

const listCategoryAttributesAction = defineRawReadAction({
  name: "list_category_attributes",
  description: "List attribute groups and values available for a Moojing category in one month.",
  inputSchema: s.object("The input payload for listing category attributes.", {
    platform: platformSchema,
    categoryId: categoryIdSchema,
    month: monthSchema,
  }),
  outputDescription: "The Moojing category attribute dictionary.",
  dataDescription: "The provider-defined map from attribute group names to values.",
});

const attributePerformanceInputSchema = s.object(
  "The input payload for listing Moojing attribute performance.",
  {
    platform: platformSchema,
    categoryId: categoryIdSchema,
    month: monthSchema,
    mode: s.stringEnum("Whether to rank combinations or values in one attribute group.", [
      "combinations",
      "single_attribute",
    ] as const),
    attributeName: s.nonWhitespaceString("The attribute group used when mode is single_attribute."),
    currency: currencySchema,
  },
  { optional: ["attributeName", "currency"] },
);

const listAttributePerformanceAction = defineRawReadAction({
  name: "list_attribute_performance",
  description: "List sales performance for attribute values or combinations in a Moojing category.",
  inputSchema: attributePerformanceInputSchema,
  outputDescription: "The Moojing attribute performance result.",
  dataDescription: "The provider-defined attribute performance count and rows.",
});

const attributeSelectionsSchema = s.record(
  "One or two attribute group-to-value selections.",
  s.nonWhitespaceString("The selected value for an attribute group."),
);

const getAttributeSummaryAction = defineRawReadAction({
  name: "get_attribute_summary",
  description: "Get sales metrics and top items for one or two selected Moojing attributes.",
  inputSchema: s.object(
    "The input payload for a Moojing attribute summary.",
    {
      platform: platformSchema,
      categoryId: categoryIdSchema,
      brandId: brandIdSchema,
      attributes: attributeSelectionsSchema,
      month: monthSchema,
      currency: currencySchema,
    },
    { optional: ["currency"] },
  ),
  outputDescription: "The Moojing attribute summary.",
  dataDescription: "The provider-defined attribute metrics, breadcrumbs, and top items.",
});

const getShopSalesTrendAction = defineRawReadAction({
  name: "get_shop_sales_trend",
  description: "Get sales trends for one Moojing shop within a category and brand.",
  inputSchema: s.object(
    "The input payload for a Moojing shop sales trend.",
    {
      platform: platformSchema,
      shopId: s.nonWhitespaceString("The Moojing shop identifier."),
      categoryId: categoryIdSchema,
      brandId: brandIdSchema,
      startMonth: underscoreMonthSchema,
      currency: currencySchema,
    },
    { optional: ["currency"] },
  ),
  outputDescription: "The Moojing shop sales trend.",
  dataDescription: "The provider-defined shop identity and trend data.",
});

const getItemSalesTrendAction = defineRawReadAction({
  name: "get_item_sales_trend",
  description: "Get price, sales, volume, and comment trends for one Moojing item.",
  inputSchema: s.object(
    "The input payload for a Moojing item sales trend.",
    {
      platform: platformSchema,
      itemId: s.nonWhitespaceString("The provider item identifier."),
      startMonth: underscoreMonthSchema,
      currency: currencySchema,
    },
    { optional: ["currency"] },
  ),
  outputDescription: "The Moojing item sales trend.",
  dataDescription: "The provider-defined item trend data.",
});

const shopDetailsInputSchema = s.object(
  "The input payload for getting Moojing shop details.",
  {
    platform: platformSchema,
    startMonth: monthSchema,
    endMonth: monthSchema,
    shopNames: s.stringArray("The shop names to query.", {
      minItems: 1,
      itemDescription: "One shop name.",
    }),
    shopIds: s.stringArray("The shop IDs to query.", {
      minItems: 1,
      itemDescription: "One shop ID.",
    }),
    currency: currencySchema,
  },
  { optional: ["endMonth", "shopNames", "shopIds", "currency"] },
);

const getShopDetailsAction = defineProviderAction(service, {
  name: "get_shop_details",
  description: "Get category, brand, location, and service details for one or more Moojing shops.",
  operationType: "read",
  requiredScopes: [],
  inputSchema: shopDetailsInputSchema,
  outputSchema: s.object("The Moojing shop detail response.", {
    shops: s.array("The shop detail records returned by Moojing.", rawObjectSchema),
    errors: s.array("Shop lookup errors reported by Moojing.", s.string("One shop lookup error.")),
  }),
});

export const mktindexMmiActions: readonly ActionDefinition[] = [
  listCategoriesAction,
  getDataRangeAction,
  listSubscriptionsAction,
  getJdDataVersionsAction,
  searchBrandsAction,
  getMarketSummaryAction,
  getMarketTrendAction,
  listMarketBreakdownAction,
  listHotShopsAction,
  listHotItemsAction,
  compareMarketPeriodsAction,
  getRegionMarketSummaryAction,
  getRegionMarketTrendAction,
  listRegionMarketBreakdownAction,
  listRegionHotShopsAction,
  listRegionHotItemsAction,
  compareRegionMarketPeriodsAction,
  getCommentTrendAction,
  listBrandCategoriesAction,
  getPriceDistributionAction,
  getPlatformSalesTrendsAction,
  listSpusAction,
  getSpuAction,
  listCategoryAttributesAction,
  listAttributePerformanceAction,
  getAttributeSummaryAction,
  getShopSalesTrendAction,
  getItemSalesTrendAction,
  getShopDetailsAction,
];
