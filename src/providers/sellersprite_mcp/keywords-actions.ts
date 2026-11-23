import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { researchOutputSchema, range, marketplace } from "./action-schema.ts";
export const keywordsActions: readonly ActionDefinition[] = [
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.asin.list",
    description: "Find traffic keywords for up to 10 ASINs and compare their traffic shares.",
    operationType: "read",
    inputSchema: s.object(
      "Find traffic keywords for up to 10 ASINs and compare their traffic shares.",
      {
        marketplace,
        asins: s.array("ASIN set, from 1 to 10; deduplicated by the server.", s.string("One asins value."), {
          minItems: 1,
          maxItems: 10,
        }),
        dataRange: s.stringEnum(
          "LAST_30_DAYS (default) is rolling and forbids month. MONTH uses an archived calendar month; omit month for the latest archive.",
          ["LAST_30_DAYS", "MONTH"],
          { default: "LAST_30_DAYS" },
        ),
        month: s.string(
          "Archived month (yyyyMM), only with dataRange=MONTH. Omit for latest archive. Do not infer the month from today's date.",
          { pattern: "^\\d{6}$" },
        ),
        trafficWordType: s.array(
          "Traffic types as a string array, for example ORGANIC and ADS, combined with OR. Omit for no filter. Affects items, not summary.typeStats.",
          s.stringEnum("One trafficWordType value.", [
            "ORGANIC",
            "ADS",
            "AMAZON_CHOICE",
            "EDITORIAL_RECOMMENDATION",
            "FOUR_STAR",
            "HIGHLY_RATED",
            "SPONSOR_BRAND",
            "SPONSOR_VIDEO",
            "PRIMARY",
            "PRECISE",
            "PRECISE_LONG_TAIL",
            "EFFECTIVE",
            "CONVERSION_EXCELLENT",
            "CONVERSION_STABLE",
            "CONVERSION_LOST",
            "INVALID",
          ]),
          { minItems: 1, maxItems: 16, uniqueItems: true },
        ),
        orderField: s.stringEnum(
          "Item sort field: searches for monthly estimated search volume or trafficShare for group traffic share (default descending).",
          ["searches", "trafficShare"],
        ),
        orderDesc: s.boolean("Sort descending, default true."),
        page: s.object(
          "Page window. Request additional pages only when the requested result count or explicit export requires them.",
          {
            cursor: s.integer("Offset cursor, default 0; cursor + size must not exceed 3000.", {
              minimum: 0,
              maximum: 3000,
            }),
            size: s.integer("Page size, default 100.", { minimum: 1, maximum: 100 }),
          },
          { required: [] },
        ),
        includeFields: s.array(
          "Select item output fields. Omit for defaults. Does not affect summary or page.",
          s.stringEnum("One includeFields value.", [
            "keyword",
            "searchVolume",
            "searchesRank",
            "trafficShare",
            "trafficWordTypes",
            "purchases",
            "purchaseRate",
            "clicks",
            "impressions",
            "products",
            "supplyDemandRatio",
            "bid",
            "ppc",
            "avgPrice",
            "avgRating",
            "avgReviews",
            "titleDensity",
            "spr",
            "monopolyClickRate",
            "adProducts",
            "updatedTime",
            "bestRank",
            "bestAdRank",
            "matchedAsins",
            "clickShareRate",
            "conversionShareRate",
          ]),
          { minItems: 1, maxItems: 26, uniqueItems: true },
        ),
      },
      { required: ["marketplace", "asins"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.related.list",
    description: "Expand a seed keyword and compare demand, competition and PPC bids.",
    operationType: "read",
    inputSchema: s.object(
      "Expand a seed keyword and compare demand, competition and PPC bids.",
      {
        marketplace,
        seedKeyword: s.string("Seed keyword."),
        searchVolume: s.object(
          "Search volume range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        purchaseVolume: s.object(
          "Purchase volume range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        purchaseRate: range("Purchase rate range."),
        wordCount: s.object(
          "Word count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        competition: s.object(
          "Competition range measured by product count.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        ppcBid: range("PPC bid range."),
        relevancy: range("Relevance range."),
        spr: s.object(
          "SPR range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        titleDensity: s.object(
          "Title density filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        supplyDemandRatio: range("Supply-demand ratio filter."),
        adProducts: s.object(
          "Advertising product count filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        searchRank: s.object(
          "Search rank filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        avgPrice: range("Matching product average price filter."),
        avgRating: range("Matching product average rating filter."),
        avgReviewCount: s.object(
          "Matching product average review count filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        clicks: s.object(
          "Click count filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        impressions: s.object(
          "Impression count filter.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        monopolyClickRate: range("Click concentration filter."),
        searchesGrowth: range("Search volume growth filter."),
        yearlyGrowthRate: range("Annual growth filter."),
        includeKeywords: s.array("Keywords to include.", s.string("One includeKeywords value."), {
          maxItems: 20,
        }),
        excludeKeywords: s.array("Keywords to exclude.", s.string("One excludeKeywords value."), {
          maxItems: 20,
        }),
        keywordBidMatchType: s.string("Bid match type filter."),
        departments: s.array(
          "Category node paths, mapped to upstream departmentList.",
          s.string("One departments value."),
          { maxItems: 20 },
        ),
        amazonChoice: s.boolean("Amazon's Choice filter."),
        extensiveMatch: s.boolean("Broad matching filter."),
        page: s.object(
          "Page window. Request additional pages only when the requested result count or explicit export requires them.",
          {
            cursor: s.integer("Offset cursor, default 0.", { minimum: 0, maximum: 3000 }),
            size: s.integer("Page size, default 100.", { minimum: 1, maximum: 100 }),
          },
          { required: [] },
        ),
        orderField: s.stringEnum(
          "Upstream KeywordMinerOrderColumns.orderField, default searches. relevancy maps to upstream code 21.",
          [
            "searches",
            "purchases",
            "purchase_rate",
            "products",
            "supply_demand_ratio",
            "latest1daysAds",
            "bid",
            "titleDensityExact",
            "cprExact",
            "avg_price",
            "monopoly_click_rate",
            "avg_rating",
            "avg_reviews",
            "relevancy",
            "adProducts7",
            "rank",
            "clicks",
            "impressions",
            "goods_value",
            "cvsShareRate",
            "searches_growth",
            "yearly_growth_rate",
          ],
        ),
        desc: s.boolean("Sort descending, default true."),
        includeFields: s.array(
          "Output field selection. Omit or pass an empty list for defaults. Allowed fields are listed in items.enum.",
          s.stringEnum("One includeFields value.", [
            "keyword",
            "searchVolume",
            "purchaseVolume",
            "purchaseRate",
            "competition",
            "ppcBid",
            "wordCount",
            "spr",
            "relevancy",
          ]),
          { uniqueItems: true, maxItems: 9 },
        ),
      },
      { required: ["marketplace", "seedKeyword"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.conversion.analysis",
    description: "Analyze keyword advertising clicks, conversions, ACOS and CPA.",
    operationType: "read",
    inputSchema: s.object(
      "Analyze keyword advertising clicks, conversions, ACOS and CPA.",
      {
        marketplace,
        keyword: s.string("Keyword."),
        timeType: s.stringEnum("Analysis time period.", ["WEEK", "90D"]),
        matchType: s.stringEnum("Keyword matching mode, default PHRASE.", ["PHRASE", "BROAD"]),
        bidMatchType: s.string("Bid match type filter."),
        customAvgProductPrice: s.number("Custom average product price."),
        nicheMarkets: s.array("Niche market filter.", s.string("One nicheMarkets value."), {
          maxItems: 20,
        }),
        includeKeywords: s.array("Included-word filter, not a batch query.", s.string("One includeKeywords value."), {
          maxItems: 20,
        }),
        excludeKeywords: s.array("Excluded-word filter.", s.string("One excludeKeywords value."), {
          maxItems: 20,
        }),
        searches: s.object(
          "Search volume range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        clicks: s.object(
          "Click count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        purchases: s.object(
          "Purchase volume range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        searchConvRate: range("Search conversion rate range."),
        clickConvRate: range("Click conversion rate range."),
        ppc: range("PPC bid range."),
        cpa: range("CPA range."),
        productPrice: range("Product price range."),
        acos: range("ACOS range."),
        clickingRate: range("Click-through rate range."),
        conversionRate: range("Conversion rate range."),
        phraseCount: s.object(
          "Phrase count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        budget: range("Suggested budget range."),
        orderField: s.stringEnum(
          "Sort by searches/clicks/purchases/searchConvRate/clickConvRate/clickingRate/avgProductPrice. Sorting by ppc/cpa/acos/budget also requires bidMatchType; otherwise the provider falls back to searches.",
          [
            "searches",
            "clicks",
            "purchases",
            "searchConvRate",
            "clickConvRate",
            "clickingRate",
            "avgProductPrice",
            "ppc",
            "cpa",
            "acos",
            "budget",
          ],
        ),
        desc: s.boolean("Sort descending, default true."),
        page: s.object(
          "Page window. Request additional pages only when the requested result count or explicit export requires them.",
          {
            cursor: s.integer("Offset cursor, default 0.", { minimum: 0, maximum: 3000 }),
            size: s.integer("Page size, default 100.", { minimum: 1, maximum: 100 }),
          },
          { required: [] },
        ),
      },
      { required: ["marketplace", "keyword", "timeType"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.trend",
    description: "Read keyword search volume, purchase volume and conversion trends.",
    operationType: "read",
    inputSchema: s.object(
      "Read keyword search volume, purchase volume and conversion trends.",
      {
        marketplace,
        keyword: s.string("Keyword."),
        metrics: s.array(
          "Distinct trend metrics. Leading months before coverage have null searchVolume; zero inside coverage is a real zero. Uncovered keywords fail instead of returning an all-zero series.",
          s.stringEnum("One metrics value.", [
            "searchVolume",
            "purchaseVolume",
            "purchaseRate",
            "yearlyGrowth",
            "chainGrowth",
            "threeMonthGrowth",
          ]),
          { minItems: 1, maxItems: 6, uniqueItems: true },
        ),
        dateRange: s.object(
          "Date window rounded to calendar months. With both bounds omitted, uses the latest available month and preceding 36 calendar months. Response dateRange is authoritative.",
          {
            startDate: s.string(
              "Start date (yyyy-MM-dd), only for an explicitly requested window. Defaults to 36 calendar months before the latest available month.",
            ),
            endDate: s.string(
              "End date (yyyy-MM-dd), only for an explicitly requested window. Omitted or later dates are capped at the latest available month.",
            ),
          },
          { required: [] },
        ),
        granularity: s.stringEnum("Aggregation granularity, default MONTH.", ["MONTH"]),
      },
      { required: ["marketplace", "keyword", "metrics"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.google.trend",
    description: "Read Google Trends interest for a keyword on Web or Shopping.",
    operationType: "read",
    inputSchema: s.object(
      "Read Google Trends interest for a keyword on Web or Shopping.",
      {
        marketplace,
        keyword: s.string("Keyword."),
        gprop: s.stringEnum("Google search source, default WEB.", ["WEB", "SHOPPING"]),
        dateRange: s.object(
          "Date window, maximum five years.",
          {
            startDate: s.string("Start date (yyyy-MM-dd), default five years before today."),
            endDate: s.string("End date (yyyy-MM-dd), default today."),
          },
          { required: [] },
        ),
      },
      { required: ["marketplace", "keyword"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.batch.info",
    description: "Compare search and purchase metrics for up to 20 keywords.",
    operationType: "read",
    inputSchema: s.object(
      "Compare search and purchase metrics for up to 20 keywords.",
      {
        marketplace,
        keywords: s.array("Keywords, from 1 to 20.", s.string("One keywords value."), {
          minItems: 1,
          maxItems: 20,
          uniqueItems: true,
        }),
        month: s.string(
          "Archived month (yyyyMM), only when explicitly requested. Omit for server defaults. Unavailable archives are normalized to the latest available month; response month is authoritative.",
          { pattern: "^\\d{6}$" },
        ),
        orderField: s.stringEnum(
          "Upstream KeywordMinerOrderColumns.orderField, default searches. relevancy maps to upstream code 21.",
          [
            "searches",
            "purchases",
            "purchase_rate",
            "products",
            "supply_demand_ratio",
            "latest1daysAds",
            "bid",
            "titleDensityExact",
            "cprExact",
            "avg_price",
            "monopoly_click_rate",
            "avg_rating",
            "avg_reviews",
            "relevancy",
            "adProducts7",
            "rank",
            "clicks",
            "impressions",
            "goods_value",
            "cvsShareRate",
            "searches_growth",
            "yearly_growth_rate",
          ],
        ),
        desc: s.boolean("Sort descending, default true."),
      },
      { required: ["marketplace", "keywords"] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.aba.list",
    description: "Search ABA keyword rankings or look up rankings by ASIN.",
    operationType: "read",
    inputSchema: s.object(
      "Search ABA keyword rankings or look up rankings by ASIN.",
      {
        marketplace,
        keyword: s.string("Forward-query keyword filter."),
        asins: s.array("Reverse-query ASINs, up to 10.", s.string("One asins value."), {
          maxItems: 10,
        }),
        searchModel: s.withEnum(
          s.integer(
            "Optional ranking filter: 1 popular, 2 unusual movement, 3 continuous growth, 4 rapid rise, 5 potential, 6 long tail. Omit for all matches ordered by search-frequency rank.",
          ),
          [1, 2, 3, 4, 5, 6],
        ),
        departments: s.array("Forward-query category filter.", s.string("One departments value.")),
        dateType: s.stringEnum("Period: WEEK or MONTH (default). MONTH accepts archived yyyyMM dates.", [
          "WEEK",
          "MONTH",
        ]),
        date: s.string(
          "WEEK uses the week's Saturday (yyyyMMdd); MONTH uses yyyyMM. Omit for latest available. Do not infer future periods. Unarchived MONTH values fall back to the default month table and may return empty results.",
          { pattern: "^(\\d{6}|\\d{8})$" },
        ),
        searches: s.object(
          "Search volume range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        searchRank: s.object(
          "Search rank range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        rankGrowthRate: range("Rank growth fraction; positive for improvement, negative for decline."),
        monopolyClickRate: range("Click concentration range."),
        clicks: s.object(
          "Click count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        impressions: s.object(
          "Impression count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        conversionRate: range("Conversion rate range."),
        wordCount: s.object(
          "Word count range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        spr: s.object(
          "SPR range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        titleDensity: s.object(
          "Title density range.",
          {
            min: s.integer("Minimum value."),
            max: s.integer("Maximum value."),
          },
          { required: [] },
        ),
        excludeKeywords: s.array("Keywords to exclude.", s.string("One excludeKeywords value."), {
          maxItems: 20,
        }),
        keywordBidMatchType: s.string("Bid match type filter."),
        exactFlag: s.boolean("Use exact matching."),
        movementMarket: s.boolean("Filter unusual market movement."),
        includeKeywords: s.array(
          "Forward anchor or included keywords, combined with OR. A nonempty list overrides keyword and cannot be combined with asins. Maximum 20 values.",
          s.string("One includeKeywords value."),
          { minItems: 1, maxItems: 20, uniqueItems: true },
        ),
        rankGrowthValue: s.integer(
          "Search rank change since the previous period; positive for improvement and negative for decline.",
        ),
        page: s.object(
          "Page window. Request additional pages only when the requested result count or explicit export requires them.",
          {
            cursor: s.integer("Offset cursor, default 0.", { minimum: 0, maximum: 3000 }),
            size: s.integer("Page size, default 100.", { minimum: 1, maximum: 100 }),
          },
          { required: [] },
        ),
      },
      { required: [] },
    ),
    outputSchema: researchOutputSchema,
  }),
  defineProviderAction("sellersprite_mcp", {
    name: "keyword.aba.trend",
    description: "Read ABA rank, search volume and top-three click and conversion share trends.",
    operationType: "read",
    inputSchema: s.object(
      "Read ABA rank, search volume and top-three click and conversion share trends.",
      {
        marketplace,
        keyword: s.string("Keyword."),
        metrics: s.array(
          "Metrics to include; omit for all metrics.",
          s.stringEnum("One metrics value.", ["abaRank", "abaSearchVolume", "top3ClickShare", "top3ConversionShare"]),
          { uniqueItems: true },
        ),
        granularity: s.stringEnum(
          "WEEK or MONTH (default). Weekly dates use yyyy-MM-dd; monthly dates use the first day of the month.",
          ["WEEK", "MONTH"],
        ),
        dateRange: s.object(
          "Historical date window, only when explicitly requested. Defaults to one year before the latest available data point. Response dateRange is authoritative.",
          {
            startDate: s.string(
              "Start date (yyyy-MM-dd), only for an explicitly requested window. Defaults to one year before the latest available data point.",
            ),
            endDate: s.string(
              "End date (yyyy-MM-dd), only for an explicitly requested window. Omitted or later values are capped at the latest available data point.",
            ),
          },
          { required: [] },
        ),
      },
      { required: ["marketplace", "keyword"] },
    ),
    outputSchema: researchOutputSchema,
  }),
];
