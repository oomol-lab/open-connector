import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ixspy" as const;

const positiveId = (description: string) => s.positiveInteger(description);
const nonNegativeNumber = (description: string) => s.number(description, { minimum: 0 });
const nonNegativeInteger = (description: string) => s.nonNegativeInteger(description);
const pageSchema = s.positiveInteger("The one-based result page number.", { default: 1 });
const pageSizeSchema = s.integer("The number of results per page, up to 50.", {
  minimum: 1,
  maximum: 50,
  default: 50,
});
const orderKindSchema = s.stringEnum("The result sort direction.", ["asc", "desc"]);
const choiceTypeSchema = s.integer(
  "The AliExpress fulfillment type: 0 for POP, 1 for semi-managed, or 2 for fully managed.",
  { minimum: 0, maximum: 2 },
);
const choiceTypesSchema = s.array("The AliExpress fulfillment types to include.", choiceTypeSchema, {
  minItems: 1,
  maxItems: 3,
  uniqueItems: true,
});
const productOriginSchema = s.stringEnum("The documented IXSPY product origin code.", [
  "US",
  "FR",
  "RU",
  "ES",
  "AU",
  "PL",
  "IT",
  "CZ",
  "GB",
  "BE",
  "DE",
  "IL",
  "TR",
  "UA",
  "BR",
  "KR",
  "HU",
  "SA",
  "ID",
  "AE",
  "CL",
  "ZA",
  "MX",
  "China",
]);
const regionalRankCodeSchema = s.stringEnum("The documented IXSPY buyer-region code.", [
  "RU",
  "ES",
  "FR",
  "US",
  "CL",
  "UA",
  "NL",
  "PL",
  "BR",
  "IT",
  "DE",
  "KR",
  "SA",
  "IL",
  "RO",
  "KH",
  "PE",
  "JP",
  "TR",
  "UK",
  "CA",
  "BY",
  "MX",
  "AE",
  "FI",
  "LT",
  "NO",
  "SE",
  "PT",
  "BG",
  "HU",
  "ZA",
  "AU",
]);
const localDateSchema = (description: string) => s.date(description);
const unixTimestampSchema = (description: string) =>
  s.nonNegativeInteger(`${description} as a Unix timestamp in seconds.`);
const creditsSchema = s.nullable(
  s.number("The IXSPY credit delta reported for the request. A negative value means credits were deducted."),
);
const providerItemSchema = (description: string) => s.looseObject(description);
const pagedOutputSchema = (description: string, itemDescription: string) =>
  s.object(description, {
    items: s.array("The records returned by IXSPY.", providerItemSchema(itemDescription)),
    page: s.nullable(s.integer("The current one-based page number when IXSPY supplies pagination.")),
    pages: s.nullable(s.integer("The total number of pages when IXSPY supplies pagination.")),
    total: s.nullable(s.integer("The total matching record count when IXSPY supplies it.")),
    credits: creditsSchema,
  });

const statisticsOutputSchema = (entityDescription: string, itemDescription: string) =>
  s.object(`The ${entityDescription} statistics returned by IXSPY.`, {
    entityId: s.union([s.integer("An integer IXSPY identifier."), s.string("A string IXSPY identifier.")], {
      description: `The ${entityDescription} identifier returned by IXSPY.`,
    }),
    statistics: s.array(
      `The ${entityDescription} statistic rows returned by IXSPY.`,
      providerItemSchema(itemDescription),
    ),
    credits: creditsSchema,
  });

const trendOutputSchema = (entityDescription: string) =>
  s.object(`The ${entityDescription} trend series returned by IXSPY.`, {
    entityId: s.union([s.integer("An integer IXSPY identifier."), s.string("A string IXSPY identifier.")], {
      description: `The ${entityDescription} identifier returned by IXSPY.`,
    }),
    startDate: s.nullable(s.date("The first date represented in the trend series.")),
    endDate: s.nullable(s.date("The last date represented in the trend series.")),
    points: s.array(
      `The daily ${entityDescription} trend points returned by IXSPY.`,
      providerItemSchema(`One ${entityDescription} trend point with provider-defined metrics.`),
    ),
    credits: creditsSchema,
  });

function defineIxspyAction<const TName extends string>(input: {
  name: TName;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}) {
  return defineProviderAction(service, {
    name: input.name,
    description: input.description,
    operationType: "read",
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
  });
}

const categoryResourceAction = defineIxspyAction({
  name: "get_category_resource",
  description: "Get the current IXSPY CDN URL for the complete AliExpress category tree resource.",
  inputSchema: s.object("No input is required to get the category tree resource.", {}),
  outputSchema: s.object("The current AliExpress category tree resource returned by IXSPY.", {
    url: s.url("The CDN URL for downloading the complete category tree JSON resource."),
    credits: creditsSchema,
  }),
});

const categoryChildrenAction = defineIxspyAction({
  name: "list_category_children",
  description: "List the immediate AliExpress child categories under an IXSPY category, including root categories.",
  inputSchema: s.object("The parent category whose immediate children should be listed.", {
    parentId: s.nonNegativeInteger("The parent category ID. Use 0 for root categories."),
  }),
  outputSchema: s.object("The AliExpress child categories returned by IXSPY.", {
    parentId: s.union([s.integer("An integer category identifier."), s.string("A string category identifier.")], {
      description: "The parent category identifier returned by IXSPY.",
    }),
    count: s.integer("The number of immediate child categories returned."),
    categories: s.array(
      "The immediate child categories.",
      providerItemSchema("One AliExpress category with names, hierarchy, and leaf metadata."),
    ),
    credits: creditsSchema,
  }),
});

const searchCategoriesAction = defineIxspyAction({
  name: "search_categories",
  description: "Search AliExpress categories in IXSPY by Chinese or English name, path, or fuzzy keyword.",
  inputSchema: s.object(
    "Filters for searching AliExpress categories.",
    {
      keyword: s.nonWhitespaceString("The Chinese or English category keyword or path to search."),
      level: s.integer("The exact category depth to return when supplied.", { minimum: 1 }),
      isLeaf: s.boolean("Whether to return only leaf categories."),
      limit: s.integer("The maximum number of matching categories to return.", {
        minimum: 1,
        maximum: 100,
      }),
    },
    { optional: ["level", "isLeaf", "limit"] },
  ),
  outputSchema: pagedOutputSchema(
    "The matching AliExpress categories returned by IXSPY.",
    "One matching AliExpress category with names and hierarchy metadata.",
  ),
});

const searchProductsAction = defineIxspyAction({
  name: "search_products",
  description:
    "Search IXSPY AliExpress products with keyword, category, price, sales, review, rating, fulfillment, discovery, and update filters.",
  inputSchema: s.object(
    "Filters and pagination for searching AliExpress products.",
    {
      categoryId: positiveId("The category ID whose descendants should also be searched."),
      nameKeyword: s.nonWhitespaceString("An English product-title keyword."),
      choiceTypes: choiceTypesSchema,
      shipsFrom: productOriginSchema,
      discoveredAfter: unixTimestampSchema("The earliest IXSPY discovery time"),
      discoveredBefore: unixTimestampSchema("The latest IXSPY discovery time"),
      priceMin: nonNegativeNumber("The minimum product price in USD."),
      priceMax: nonNegativeNumber("The maximum product price in USD."),
      totalSalesMin: nonNegativeInteger("The minimum one-year total sales count."),
      totalSalesMax: nonNegativeInteger("The maximum one-year total sales count."),
      sales7dMin: nonNegativeInteger("The minimum seven-day sales count."),
      sales7dMax: nonNegativeInteger("The maximum seven-day sales count."),
      totalReviewsMin: nonNegativeInteger("The minimum one-year review count."),
      totalReviewsMax: nonNegativeInteger("The maximum one-year review count."),
      salesReviewRatioMin: nonNegativeNumber("The minimum sales-to-review ratio."),
      salesReviewRatioMax: nonNegativeNumber("The maximum sales-to-review ratio."),
      ratingMin: s.number("The minimum product rating.", { minimum: 0, maximum: 5 }),
      ratingMax: s.number("The maximum product rating.", { minimum: 0, maximum: 5 }),
      hasVideo: s.boolean("Whether products must contain a video."),
      storeMerchantId: positiveId("The merchant ID used to restrict results to one store."),
      updatedAfter: unixTimestampSchema("The earliest data update time"),
      updatedBefore: unixTimestampSchema("The latest data update time"),
      orderBy: s.stringEnum("The product field used for sorting.", [
        "totalSales",
        "totalReviews",
        "sales7d",
        "discoveredTime",
      ]),
      orderKind: orderKindSchema,
      page: pageSchema,
      size: pageSizeSchema,
    },
    {
      optional: [
        "categoryId",
        "nameKeyword",
        "choiceTypes",
        "shipsFrom",
        "discoveredAfter",
        "discoveredBefore",
        "priceMin",
        "priceMax",
        "totalSalesMin",
        "totalSalesMax",
        "sales7dMin",
        "sales7dMax",
        "totalReviewsMin",
        "totalReviewsMax",
        "salesReviewRatioMin",
        "salesReviewRatioMax",
        "ratingMin",
        "ratingMax",
        "hasVideo",
        "storeMerchantId",
        "updatedAfter",
        "updatedBefore",
        "orderBy",
        "orderKind",
        "page",
        "size",
      ],
    },
  ),
  outputSchema: pagedOutputSchema(
    "The AliExpress product search results returned by IXSPY.",
    "One AliExpress product with pricing, sales, reviews, store, media, and category metadata.",
  ),
});

const productDetailsAction = defineIxspyAction({
  name: "get_product_details",
  description: "Get IXSPY details for up to 10 AliExpress product IDs.",
  inputSchema: s.object("The AliExpress products to retrieve.", {
    productIds: s.array("The product IDs to retrieve.", positiveId("One AliExpress product ID."), {
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
    }),
  }),
  outputSchema: pagedOutputSchema(
    "The requested AliExpress product details returned by IXSPY.",
    "One AliExpress product detail record.",
  ),
});

const searchStoresAction = defineIxspyAction({
  name: "search_stores",
  description:
    "Search IXSPY AliExpress stores with name, category, sales, followers, reviews, rating, price, product count, origin, age, tags, and fulfillment filters.",
  inputSchema: s.object(
    "Filters and pagination for searching AliExpress stores.",
    {
      nameKeyword: s.nonWhitespaceString("A store-name keyword for fuzzy matching."),
      categoryId: positiveId("A top-level category ID."),
      totalSalesMin: nonNegativeInteger("The minimum total store sales count."),
      totalSalesMax: nonNegativeInteger("The maximum total store sales count."),
      totalFollowersMin: nonNegativeInteger("The minimum store follower count."),
      totalFollowersMax: nonNegativeInteger("The maximum store follower count."),
      totalReviewsMin: nonNegativeInteger("The minimum store review count."),
      totalReviewsMax: nonNegativeInteger("The maximum store review count."),
      ratingMin: s.number("The minimum store rating.", { minimum: 0, maximum: 5 }),
      ratingMax: s.number("The maximum store rating.", { minimum: 0, maximum: 5 }),
      averagePriceMin: nonNegativeNumber("The minimum average product price in USD."),
      averagePriceMax: nonNegativeNumber("The maximum average product price in USD."),
      totalProductsMin: nonNegativeInteger("The minimum store product count."),
      totalProductsMax: nonNegativeInteger("The maximum store product count."),
      createdAfter: unixTimestampSchema("The earliest store creation time"),
      createdBefore: unixTimestampSchema("The latest store creation time"),
      topBrandTag: s.integer("The store tier: 0 for none, 1 for Brand, 2 for Silver, 3 for Gold, or 4 for Plus.", {
        minimum: 0,
        maximum: 4,
      }),
      shipsFrom: s.nonWhitespaceString("The origin country name used by IXSPY."),
      styleZone: s.boolean("Whether the store must be in the AliExpress Style Zone."),
      choiceTypes: choiceTypesSchema,
      orderBy: s.stringEnum("The store field used for sorting.", [
        "totalSales",
        "totalReviews",
        "totalFollowers",
        "createdTime",
      ]),
      orderKind: orderKindSchema,
      page: pageSchema,
      size: pageSizeSchema,
    },
    {
      optional: [
        "nameKeyword",
        "categoryId",
        "totalSalesMin",
        "totalSalesMax",
        "totalFollowersMin",
        "totalFollowersMax",
        "totalReviewsMin",
        "totalReviewsMax",
        "ratingMin",
        "ratingMax",
        "averagePriceMin",
        "averagePriceMax",
        "totalProductsMin",
        "totalProductsMax",
        "createdAfter",
        "createdBefore",
        "topBrandTag",
        "shipsFrom",
        "styleZone",
        "choiceTypes",
        "orderBy",
        "orderKind",
        "page",
        "size",
      ],
    },
  ),
  outputSchema: pagedOutputSchema(
    "The AliExpress store search results returned by IXSPY.",
    "One AliExpress store with sales, followers, reviews, rating, category, and fulfillment metadata.",
  ),
});

const storeDetailsInputSchema = s.object(
  "Exactly one type of AliExpress store identifier to retrieve, with up to 10 IDs.",
  {
    merchantIds: s.array("The merchant IDs to retrieve.", positiveId("One AliExpress merchant ID."), {
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
    }),
    linkIds: s.array("The store link IDs to retrieve.", positiveId("One AliExpress store link ID."), {
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
    }),
  },
  { optional: ["merchantIds", "linkIds"] },
);

const storeDetailsAction = defineIxspyAction({
  name: "get_store_details",
  description: "Get IXSPY details for up to 10 AliExpress stores by merchant IDs or link IDs.",
  inputSchema: storeDetailsInputSchema,
  outputSchema: pagedOutputSchema(
    "The requested AliExpress store details returned by IXSPY.",
    "One AliExpress store detail record.",
  ),
});

const productIdInputSchema = s.object("The AliExpress product to analyze.", {
  productId: positiveId("The AliExpress product ID."),
});
const storeMerchantIdInputSchema = s.object("The AliExpress store to analyze.", {
  storeMerchantId: positiveId("The AliExpress merchant ID."),
});

const productSkuSalesAction = defineIxspyAction({
  name: "get_product_sku_sales",
  description: "Get the estimated order distribution across SKU variants for an AliExpress product.",
  inputSchema: productIdInputSchema,
  outputSchema: statisticsOutputSchema("product", "One SKU combination and its estimated order count."),
});

const productShippingStatsAction = defineIxspyAction({
  name: "get_product_shipping_stats",
  description: "Get estimated AliExpress order counts grouped by shipping method for a product.",
  inputSchema: productIdInputSchema,
  outputSchema: statisticsOutputSchema("product", "One shipping method and its estimated order count."),
});

const productRegionSalesAction = defineIxspyAction({
  name: "get_product_region_sales",
  description: "Get estimated AliExpress product order counts grouped by buyer country or region.",
  inputSchema: productIdInputSchema,
  outputSchema: statisticsOutputSchema("product", "One buyer region and its estimated order count."),
});

const productTrendsAction = defineIxspyAction({
  name: "get_product_trends",
  description: "Get up to 90 days of IXSPY price, sales, and review trend data for a product.",
  inputSchema: s.object(
    "The AliExpress product and optional date range to analyze.",
    {
      productId: positiveId("The AliExpress product ID."),
      startDate: localDateSchema("The first trend date. IXSPY defaults to 30 days before today."),
      endDate: localDateSchema("The last trend date, no more than 90 days after the start date."),
    },
    { optional: ["startDate", "endDate"] },
  ),
  outputSchema: trendOutputSchema("product"),
});

const storeCategoryDistributionAction = defineIxspyAction({
  name: "get_store_category_distribution",
  description: "Get IXSPY product and sales distribution by category for an AliExpress store.",
  inputSchema: storeMerchantIdInputSchema,
  outputSchema: statisticsOutputSchema("store", "One category path with product and sales distribution metrics."),
});

const storeRegionSalesAction = defineIxspyAction({
  name: "get_store_region_sales",
  description: "Get estimated AliExpress store order counts grouped by buyer country or region.",
  inputSchema: storeMerchantIdInputSchema,
  outputSchema: statisticsOutputSchema("store", "One buyer region and its estimated order count."),
});

const storeTrendsAction = defineIxspyAction({
  name: "get_store_trends",
  description: "Get up to 90 days of IXSPY follower, sales, and review trend data for a store.",
  inputSchema: s.object("The AliExpress store and date range to analyze.", {
    storeMerchantId: positiveId("The AliExpress merchant ID."),
    startDate: localDateSchema("The first trend date."),
    endDate: localDateSchema("The last trend date, no more than 90 days after the start date."),
  }),
  outputSchema: trendOutputSchema("store"),
});

const productRankAction = defineIxspyAction({
  name: "get_product_rank",
  description: "Get an IXSPY AliExpress total, hot, growth, new-product, or holiday product ranking.",
  inputSchema: s.object(
    "The product ranking, date, category, optional filters, and pagination.",
    {
      rankType: s.stringEnum("The product ranking type.", [
        "total",
        "normalHot",
        "normalGrowth",
        "newHot",
        "newGrowth",
        "holidayNormal",
        "holidayNew",
      ]),
      dateType: s.stringEnum("The ranking period.", ["day", "week", "month", "holiday"]),
      categoryId: positiveId("The category ID represented by the ranking."),
      rankDate: localDateSchema("The available IXSPY ranking date."),
      searchWords: s.nonWhitespaceString("Words that must occur in the product title."),
      choiceType: choiceTypeSchema,
      priceMin: nonNegativeNumber("The minimum product price in USD."),
      priceMax: nonNegativeNumber("The maximum product price in USD."),
      page: pageSchema,
      size: pageSizeSchema,
    },
    { optional: ["searchWords", "choiceType", "priceMin", "priceMax", "page", "size"] },
  ),
  outputSchema: pagedOutputSchema(
    "The AliExpress product ranking returned by IXSPY.",
    "One ranked AliExpress product and its current and previous rank metrics.",
  ),
});

const regionProductRankAction = defineIxspyAction({
  name: "get_region_product_rank",
  description: "Get an IXSPY weekly or monthly AliExpress product ranking for one buyer region.",
  inputSchema: s.object(
    "The regional product ranking, date, category, optional filters, and pagination.",
    {
      dateType: s.stringEnum("The ranking period.", ["week", "month"]),
      categoryId: positiveId("The category ID represented by the ranking."),
      rankDate: localDateSchema("The available IXSPY ranking date."),
      regionCode: regionalRankCodeSchema,
      searchWords: s.nonWhitespaceString("Words that must occur in the product title."),
      choiceType: choiceTypeSchema,
      priceMin: nonNegativeNumber("The minimum product price in USD."),
      priceMax: nonNegativeNumber("The maximum product price in USD."),
      page: pageSchema,
      size: pageSizeSchema,
    },
    { optional: ["searchWords", "choiceType", "priceMin", "priceMax", "page", "size"] },
  ),
  outputSchema: pagedOutputSchema(
    "The regional AliExpress product ranking returned by IXSPY.",
    "One ranked AliExpress product and its regional sales metrics.",
  ),
});

const storeRankAction = defineIxspyAction({
  name: "get_store_rank",
  description: "Get an IXSPY AliExpress total, hot, growth, new-store, or rising-store ranking.",
  inputSchema: s.object(
    "The store ranking, date, top-level category, optional filters, and pagination.",
    {
      rankType: s.stringEnum("The store ranking type.", ["total", "normalHot", "normalGrowth", "newHot", "newGrowth"]),
      dateType: s.stringEnum("The ranking period.", ["day", "week", "month"]),
      rankDate: localDateSchema("The available IXSPY ranking date."),
      categoryId: positiveId("The top-level category ID represented by the ranking."),
      searchWords: s.nonWhitespaceString("Words that must occur in the store name."),
      choiceType: choiceTypeSchema,
      page: pageSchema,
      size: pageSizeSchema,
    },
    { optional: ["searchWords", "choiceType", "page", "size"] },
  ),
  outputSchema: pagedOutputSchema(
    "The AliExpress store ranking returned by IXSPY.",
    "One ranked AliExpress store and its current and previous rank metrics.",
  ),
});

const keywordRankAction = defineIxspyAction({
  name: "get_keyword_rank",
  description:
    "Get an IXSPY AliExpress keyword ranking with search popularity, click, conversion, competition, supply, and growth metrics.",
  inputSchema: s.object(
    "The keyword ranking, period, date, category, region, optional filter, and pagination.",
    {
      rankDate: localDateSchema("The available IXSPY keyword ranking date."),
      dateType: s.stringEnum("The ranking period.", ["week", "month"]),
      categoryId: positiveId("The category ID represented by the keyword ranking."),
      regionCode: s.stringEnum("The supported IXSPY keyword region.", ["ALL", "US", "RU"]),
      keyword: s.nonWhitespaceString("A fuzzy keyword filter."),
      orderBy: s.stringEnum("The keyword metric used for sorting.", [
        "searchPopularity",
        "searchGrowth",
        "clickRate",
        "conversionRate",
      ]),
      orderKind: orderKindSchema,
      page: pageSchema,
      size: pageSizeSchema,
    },
    { optional: ["keyword", "orderBy", "orderKind", "page", "size"] },
  ),
  outputSchema: pagedOutputSchema(
    "The AliExpress keyword ranking returned by IXSPY.",
    "One ranked keyword with demand, conversion, supply, competition, and growth metrics.",
  ),
});

const rankDatesAction = defineIxspyAction({
  name: "list_rank_dates",
  description: "List the IXSPY dates currently available for normal, holiday, or keyword AliExpress rankings.",
  inputSchema: s.object("The ranking family whose available dates should be listed.", {
    rankType: s.stringEnum("The ranking date family.", ["normalRank", "holidayRank", "keywordRank"]),
  }),
  outputSchema: s.object("The available IXSPY ranking dates.", {
    rankType: s.string("The ranking family returned by IXSPY."),
    dateTypes: s.array(
      "The available date groups.",
      providerItemSchema("One ranking period with dates and optional holiday metadata."),
    ),
    credits: creditsSchema,
  }),
});

const categoryResearchAction = defineIxspyAction({
  name: "research_categories",
  description:
    "Compare immediate child categories in IXSPY using products, stores, sales, reviews, supply-demand, regional, and top-100 opportunity metrics.",
  inputSchema: s.object(
    "The parent category and pagination for category research.",
    {
      parentCategoryId: s.nonNegativeInteger("The parent category ID. Use 0 for top-level categories."),
      page: pageSchema,
      size: pageSizeSchema,
    },
    { optional: ["page", "size"] },
  ),
  outputSchema: pagedOutputSchema(
    "The AliExpress category research results returned by IXSPY.",
    "One child category with market-size, demand, competition, regional, and opportunity metrics.",
  ),
});

const marketInsightsAction = defineIxspyAction({
  name: "get_market_insights",
  description:
    "Compare immediate child categories in IXSPY using product, sales, revenue, review, market-share, and Choice-product metrics.",
  inputSchema: s.object(
    "The parent category and pagination for market insights.",
    {
      parentCategoryId: s.nonNegativeInteger("The parent category ID. Use 0 for top-level categories."),
      page: pageSchema,
      size: pageSizeSchema,
    },
    { optional: ["page", "size"] },
  ),
  outputSchema: pagedOutputSchema(
    "The AliExpress market insight results returned by IXSPY.",
    "One child category with market size, revenue, share, and Choice-product metrics.",
  ),
});

export const ixspyActions: ActionDefinition[] = [
  categoryResourceAction,
  categoryChildrenAction,
  searchCategoriesAction,
  searchProductsAction,
  productDetailsAction,
  searchStoresAction,
  storeDetailsAction,
  productSkuSalesAction,
  productShippingStatsAction,
  productRegionSalesAction,
  productTrendsAction,
  storeCategoryDistributionAction,
  storeRegionSalesAction,
  storeTrendsAction,
  productRankAction,
  regionProductRankAction,
  storeRankAction,
  keywordRankAction,
  rankDatesAction,
  categoryResearchAction,
  marketInsightsAction,
];
