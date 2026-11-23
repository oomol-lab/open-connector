import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { researchOutputSchema, range, marketplace } from "./action-schema.ts";
function reviewInput(description: string, limit: number) {
  return s.object(
    description,
    {
      marketplace,
      asin: s.string(
        "Parent or child ASIN. Reviews are normalized to the parent, not isolated to the requested child.",
      ),
      star: s.array(
        "Exact star ratings to include; omit for all ratings.",
        s.withEnum(s.integer("One star value."), [1, 2, 3, 4, 5]),
        { minItems: 1, maxItems: 5, uniqueItems: true },
      ),
      hasMedia: s.boolean(
        "True selects reviews with images or video; false selects reviews without either. Omit for both.",
      ),
      sort: s.stringEnum("Sort order, default DATE_DESC.", [
        "DATE_DESC",
        "DATE_ASC",
        "STAR_DESC",
        "STAR_ASC",
        "HELPFUL_DESC",
        "HELPFUL_ASC",
      ]),
      sku: s.string(
        "Case-insensitive substring filter on review SKU values, for example Silver or Color: Silver. Omit for all SKUs.",
      ),
      limit: s.integer(`Number of reviews to return, default and maximum ${limit}.`, {
        maximum: limit,
        minimum: 1,
      }),
    },
    { required: ["marketplace", "asin"] },
  );
}
export const productsActions: readonly ActionDefinition[] = [
  defineProviderAction("sellersprite_mcp", {
    name: "ads.insights.lookup",
    description: "Look up SP advertising campaigns, ad groups and activity for an ASIN.",
    operationType: "read",
    inputSchema: s.object(
      "Look up SP advertising campaigns, ad groups and activity for an ASIN.",
      {
        marketplace,
        asin: s.string("A parent or child ASIN; the server expands its variants."),
        interval: s.stringEnum("Aggregation interval, default MONTH. DAY is not supported.", ["WEEK", "MONTH"]),
        months: s.integer("Months to look back, default 3; used only without startDate/endDate.", {
          maximum: 12,
          minimum: 1,
        }),
        campaignId: s.string("Advertising campaign ID filter."),
        adId: s.string("Advertising group ID filter."),
        type: s.string("Advertisement type filter."),
        variation: s.string("Variant filter."),
        startDate: s.string(
          "Start date (yyyy-MM-dd). With endDate, overrides months. Use the supplied dates when the response cannot echo the effective window.",
        ),
        endDate: s.string("End date (yyyy-MM-dd)."),
        combination: s.boolean("Group results by campaignId, default false."),
        desc: s.boolean("Enable upstream ad-group sorting; the provider chooses the sort key. Default false."),
        page: s.object(
          "Ad-group page window. Request additional pages only when the requested result count or explicit export requires them.",
          {
            cursor: s.integer("Offset cursor, default 0.", { minimum: 0, maximum: 3000 }),
            size: s.integer("Page size, default 100.", { minimum: 1, maximum: 100 }),
          },
          { required: [] },
        ),
      },
      { required: ["marketplace", "asin"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.review.list",
    description: "Read up to 100 product reviews with rating, media and SKU filters.",
    operationType: "read",
    inputSchema: reviewInput("Read up to 100 product reviews with rating, media and SKU filters.", 100),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.review.list.extended",
    description: "Read up to 500 product reviews. Extended retrieval may take about two minutes.",
    operationType: "read",
    inputSchema: reviewInput("Read up to 500 product reviews. Extended retrieval may take about two minutes.", 500),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.detail",
    description: "Read product details for up to 20 ASINs.",
    operationType: "read",
    inputSchema: s.object(
      "Read product details for up to 20 ASINs.",
      {
        asins: s.array(
          "ASINs to query, from 1 to 20 unique values.",
          s.string("One asins value.", { pattern: "^B[0-9A-Z]{9}$" }),
          { minItems: 1, maxItems: 20, uniqueItems: true },
        ),
        marketplace,
        includeFields: s.array(
          "Select response fields without changing supplier cost. Omit or pass an empty list for the default fields.",
          s.stringEnum("One includeFields value.", [
            "asin",
            "marketplace",
            "title",
            "brand",
            "categoryId",
            "categoryPath",
            "price",
            "currency",
            "rating",
            "reviewCount",
            "totalReview",
            "bsr",
            "seller",
            "fulfillment",
            "parentAsin",
            "dimensions",
            "weight",
            "availableDate",
            "recordUpdatedAt",
            "variationList",
          ]),
          { maxItems: 20, uniqueItems: true },
        ),
      },
      { required: ["marketplace", "asins"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.list",
    description: "Find Amazon products by keyword, category, brand, sales and price.",
    operationType: "read",
    inputSchema: s.object(
      "Find Amazon products by keyword, category, brand, sales and price.",
      {
        marketplace,
        keyword: s.string("Product title keyword."),
        asins: s.array("Filter to up to 40 ASINs.", s.string("One asins value."), {
          maxItems: 40,
          uniqueItems: true,
        }),
        categoryId: s.string("Category node ID."),
        categoryIdExact: s.boolean("True searches only this category; otherwise includes subcategories."),
        dataMonth: s.string(
          "Archived month (yyyyMM). Omit for the last 30 days. An explicit unavailable or future archive fails without falling back. The response dataMode/dataMonth identifies the effective period.",
          { pattern: "^\\d{6}$" },
        ),
        brandInclude: s.array("Brands to include.", s.string("One brandInclude value."), {
          maxItems: 20,
          uniqueItems: true,
        }),
        brandExclude: s.array("Brands to exclude.", s.string("One brandExclude value."), {
          maxItems: 20,
          uniqueItems: true,
        }),
        sellerInclude: s.array("Sellers to include.", s.string("One sellerInclude value."), {
          maxItems: 20,
          uniqueItems: true,
        }),
        sellerExclude: s.array("Sellers to exclude.", s.string("One sellerExclude value."), {
          maxItems: 20,
          uniqueItems: true,
        }),
        excludeKeywords: s.array("Exclude matching product title keywords.", s.string("One excludeKeywords value."), {
          maxItems: 20,
          uniqueItems: true,
        }),
        excludeAsins: s.array("ASINs to exclude.", s.string("One excludeAsins value."), {
          maxItems: 20,
          uniqueItems: true,
        }),
        searchType: s.stringEnum("Keyword matching field, default TITLE.", ["ASIN", "TITLE", "BRAND", "SELLER"]),
        price: range("Price range."),
        sales: s.object(
          "Parent monthly sales range, not Amazon child sales. Filters the monthlySales output.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        revenue: range("Monthly revenue range. Filters the monthlyRevenue output."),
        rating: range("Rating range."),
        monthlyReviewCount: s.object(
          "Monthly synchronized review count range. Filters monthlyReviewCount, not childReviewCount.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        bsr: s.object(
          "BSR rank range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        sellers: s.object(
          "Competing seller count filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        reviewGrowth: s.object(
          "Review growth count filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        amazonSales: s.object(
          "Amazon-reported child sales in the last 30 days.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        ratingShare: range("Rated product share filter."),
        rankingChange: s.object(
          "BSR change filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        conversionRate: range("Conversion rate filter."),
        crt: range("Click conversion rate filter."),
        revenueGrowth: range("Month-over-month revenue growth filter."),
        salesGrowth: range("Month-over-month sales growth filter."),
        salesGrowthYoy: range("Year-over-year sales growth filter."),
        salesGrowthYoy3: range("Three consecutive months of year-over-year sales growth."),
        salesGrowthYoy6: range("Six consecutive months of year-over-year sales growth."),
        questions: s.object(
          "Product question count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        weight: range("Weight filter."),
        fbaFee: range("FBA fee filter."),
        variations: s.object(
          "Variant count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        profit: range("Estimated profit range."),
        lqs: range("Listing quality score range."),
        deliveryPrice: range("Delivery fee filter."),
        launchDateFrom: s.string("Listing date lower bound (yyyy-MM-dd)."),
        launchDateTo: s.string("Listing date upper bound (yyyy-MM-dd)."),
        firstReviewDateFrom: s.string("First review date lower bound (yyyy-MM-dd)."),
        firstReviewDateTo: s.string("First review date upper bound (yyyy-MM-dd)."),
        productTags: s.array("Product tag filter.", s.string("One productTags value."), {
          uniqueItems: true,
        }),
        mainImage: s.boolean("Main image/video flag filter."),
        bestSellingVariant: s.boolean(
          "True selects each parent's best-selling variant; false excludes it. Omit for all rows. Ignored when asins is supplied so every requested ASIN can be returned.",
        ),
        fulfillment: s.array("Fulfillment method filter.", s.stringEnum("One fulfillment value.", ["FBA", "FBM"]), {
          uniqueItems: true,
        }),
        sellerNation: s.array("Seller country or region codes.", s.string("One sellerNation value."), {
          uniqueItems: true,
        }),
        sellerType: s.array("Seller type filter.", s.stringEnum("One sellerType value.", ["AMAZON", "THIRD_PARTY"]), {
          uniqueItems: true,
        }),
        page: s.object(
          "Page window. Request additional pages only when the requested result count or explicit export requires them.",
          {
            cursor: s.integer(
              "Offset cursor, default 0, maximum 2000. Reaching the upstream offset limit means truncation, not exhaustion of all results.",
              { minimum: 0, maximum: 2000 },
            ),
            size: s.integer("Page size, default 100.", { minimum: 1, maximum: 100 }),
          },
          { required: [] },
        ),
        orderField: s.stringEnum(
          "Sort field: total_amount for revenue, total_units for sales, impression or conversion_rate. Default total_amount descending.",
          ["total_amount", "total_units", "impression", "conversion_rate"],
        ),
        desc: s.boolean("Sort descending, default true."),
        includeFields: s.array(
          "Output fields only; asin is always returned. Default fields include title, brand, price, currency, BSR, rating, monthlyReviewCount, monthlySales, monthlyRevenue, fulfillment, sellerName, sellerNation, badges, parent, bestSellingVariant and availableDate. Request childReviewCount, amzUnit, variations, lqs, profit, fba, questions or coupon explicitly.",
          s.stringEnum("One includeFields value.", [
            "asin",
            "title",
            "brand",
            "price",
            "currency",
            "bsr",
            "rating",
            "monthlyReviewCount",
            "childReviewCount",
            "monthlySales",
            "monthlySalesScope",
            "monthlyRevenue",
            "fulfillment",
            "sellerName",
            "sellerNation",
            "badges",
            "amzUnit",
            "variations",
            "lqs",
            "profit",
            "fba",
            "questions",
            "coupon",
            "parent",
            "bestSellingVariant",
            "availableDate",
            "pkgDimensions",
            "pkgDimensionType",
            "pkgWeight",
            "pkgVolumeWeights",
          ]),
          { uniqueItems: true, maxItems: 30 },
        ),
      },
      { required: ["marketplace"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.sales.trend",
    description: "Compare monthly parent and child ASIN sales, revenue and rank trends.",
    operationType: "read",
    inputSchema: s.object(
      "Compare monthly parent and child ASIN sales, revenue and rank trends.",
      {
        marketplace,
        asin: s.string("ASIN or parent ASIN; queried as supplied without parent/child conversion.", {
          pattern: "^B[0-9A-Z]{9}$",
        }),
        metrics: s.array(
          "Distinct monthly metrics. Parent sales include all sellers; child sales are Amazon search-page snapshots. SalesAmount metrics are monthly revenue. Price, BSR, rating and reviews are last-valid-day snapshots, not monthly averages. For average price, average Keepa daily prices over the month and disclose coverage.",
          s.stringEnum("One metrics value.", [
            "parentSales",
            "childSales",
            "parentSalesAmount",
            "childSalesAmount",
            "price",
            "bsr",
            "rating",
            "reviews",
          ]),
          { minItems: 1, maxItems: 8, uniqueItems: true },
        ),
        monthRange: s.object(
          "Inclusive month window.",
          {
            startDate: s.string(
              "Start month (yyyy-MM). When both bounds are omitted, uses the latest available month and the preceding 12 calendar months.",
            ),
            endDate: s.string(
              "End month (yyyy-MM), capped at the latest available month. Maximum window is 60 months.",
            ),
          },
          { required: [] },
        ),
      },
      { required: ["marketplace", "asin", "metrics"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.related.list",
    description: "Find products linked through purchases, browsing and advertising.",
    operationType: "read",
    inputSchema: s.object(
      "Find products linked through purchases, browsing and advertising.",
      {
        marketplace,
        asin: s.string("One target ASIN.", { pattern: "^B[0-9A-Z]{9}$" }),
        relations: s.array(
          "Relation codes. FBT means frequently bought together and can include unrelated categories; behavioral association does not imply semantic similarity. Omit or pass an empty list for all supported relations.",
          s.stringEnum("One relations value.", [
            "MIB",
            "FBT",
            "CSI",
            "COB",
            "MIE",
            "BAB",
            "VAV",
            "AVP",
            "BAV",
            "ASF",
            "CPF",
            "BCA",
            "FSA",
            "SP",
          ]),
          { maxItems: 14, uniqueItems: true },
        ),
        page: s.object(
          "Page window. Request additional pages only when the requested result count or explicit export requires them.",
          {
            cursor: s.integer("Offset cursor, default 0.", { minimum: 0, maximum: 3000 }),
            size: s.integer("Page size, default 100. cursor + size must not exceed 3000.", {
              minimum: 1,
              maximum: 100,
            }),
          },
          { required: [] },
        ),
        orderField: s.stringEnum("Sort field: createdTime (default) or relationCount.", [
          "createdTime",
          "relationCount",
        ]),
        desc: s.boolean("Sort descending, default true."),
        includeFields: s.array(
          "Select response fields without changing supplier cost. Omit or pass an empty list for the default fields.",
          s.stringEnum("One includeFields value.", [
            "asin",
            "title",
            "brand",
            "price",
            "currency",
            "rating",
            "reviewCount",
            "monthlySales",
            "relations",
            "pkgDimensions",
            "pkgDimensionType",
            "pkgWeight",
            "pkgVolumeWeights",
          ]),
          { maxItems: 13, uniqueItems: true },
        ),
      },
      { required: ["marketplace", "asin"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keepa.trend",
    description: "Read historical prices, rankings, ratings and coupon data.",
    operationType: "read",
    inputSchema: s.object(
      "Read historical prices, rankings, ratings and coupon data.",
      {
        marketplace,
        asin: s.string("ASIN or parent ASIN.", { pattern: "^B[0-9A-Z]{9}$" }),
        metrics: s.array(
          "History metrics; defaults to price/bsr/rating/reviews/sellers. Request additional enum values explicitly. monthlySoldHistory is a child snapshot, not parent monthly sales. Daily closing price can be averaged across a full month with coverage disclosed.",
          s.stringEnum("One metrics value.", [
            "price",
            "dealPrice",
            "buybox",
            "priceList",
            "priceFBA",
            "priceFBM",
            "pricePrime",
            "buyBoxSellerIdHistory",
            "bsr",
            "subSalesRank",
            "reviews",
            "rating",
            "sellers",
            "monthlySoldHistory",
            "couponHistory",
            "oneTimeCouponHistory",
          ]),
          { maxItems: 16, uniqueItems: true },
        ),
        dateRange: s.object(
          "Date window; default three months, maximum twelve months.",
          {
            startDate: s.string("Start date (yyyy-MM-dd), default three months before today."),
            endDate: s.string("End date (yyyy-MM-dd), default today. Windows over twelve months fail."),
          },
          { required: [] },
        ),
      },
      { required: ["marketplace", "asin"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.coreKeyword.trend",
    description: "Read monthly search-volume trends for an ASIN’s leading traffic keywords.",
    operationType: "read",
    inputSchema: s.object(
      "Read monthly search-volume trends for an ASIN’s leading traffic keywords.",
      {
        marketplace,
        asin: s.string("ASIN.", { pattern: "^B[0-9A-Z]{9}$" }),
        topN: s.integer("Number of top keywords, default 5, from 1 to 10.", {
          minimum: 1,
          maximum: 10,
        }),
        dateRange: s.object(
          "Historical window. Supply only when a specific window is requested; otherwise use server defaults.",
          {
            startDate: s.string(
              "Start date (yyyy-MM-dd). Supply only for an explicitly requested historical window; maximum five years and no earlier than 2022-01.",
            ),
            endDate: s.string(
              "End date (yyyy-MM-dd). Supply only for an explicitly requested historical window; do not supply future dates.",
            ),
          },
          { required: [] },
        ),
      },
      { required: ["marketplace", "asin"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.prediction.sales",
    description: "Read recent daily sales and BSR estimates for an ASIN.",
    operationType: "read",
    inputSchema: s.object(
      "Read recent daily sales and BSR estimates for an ASIN.",
      {
        marketplace,
        asin: s.string("ASIN.", { pattern: "^B[0-9A-Z]{9}$" }),
        days: s.integer(
          "Number of recent estimated days, default 27, from 1 to 65. Ends on the latest estimated day.",
          { minimum: 1, maximum: 65 },
        ),
      },
      { required: ["marketplace", "asin"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "asin.content.list",
    description: "Read product bullet points and main images.",
    operationType: "read",
    inputSchema: s.object(
      "Read product bullet points and main images.",
      {
        marketplace,
        asin: s.string("ASIN.", { pattern: "^B[0-9A-Z]{9}$" }),
      },
      { required: ["marketplace", "asin"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "bsr.prediction.sales",
    description: "Estimate daily and monthly sales from a category and BSR rank.",
    operationType: "read",
    inputSchema: s.object(
      "Estimate daily and monthly sales from a category and BSR rank.",
      {
        marketplace,
        categoryId: s.string("Top-level category node ID from category search."),
        bsr: s.integer("Top-level category BSR rank, from 1 to 10000000.", {
          minimum: 1,
          maximum: 10000000,
        }),
        includeFields: s.array(
          "Select response fields at the same cost. Defaults to marketplace/categoryId/bsr/estDailySales/estMonSales. Request rankSales, curveSales or linerParams explicitly.",
          s.stringEnum("One includeFields value.", [
            "marketplace",
            "categoryId",
            "bsr",
            "estDailySales",
            "estMonSales",
            "rankSales",
            "curveSales",
            "linerParams",
          ]),
          { maxItems: 8, uniqueItems: true },
        ),
      },
      { required: ["marketplace", "categoryId", "bsr"] },
    ),
    outputSchema: researchOutputSchema,
  }),
];
