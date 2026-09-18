import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

type OfficialParameterType = "string" | "integer" | "number" | "boolean" | "stringArray" | "integerArray" | "object";

interface OfficialToolDefinition {
  parameters: Readonly<Record<string, OfficialParameterType>>;
  required: readonly string[];
}

const service = "sellersprite_mcp";

const marketAnalysisParameterSchemas = {
  marketplace: "string",
  month: "string",
  topN: "integer",
  newProduct: "integer",
  nodeIdPath: "string",
} as const satisfies Readonly<Record<string, OfficialParameterType>>;

function marketAnalysisParameters(
  extraParameters: Readonly<Record<string, OfficialParameterType>> = {},
): OfficialToolDefinition {
  return {
    parameters: { ...marketAnalysisParameterSchemas, ...extraParameters },
    required: ["marketplace", "nodeIdPath"],
  };
}

const sellerSpriteMcpOfficialToolDefinitions: Record<string, OfficialToolDefinition> = {
  competitor_lookup: {
    parameters: {
      marketplace: "string",
      month: "string",
      brand: "string",
      sellerName: "string",
      asins: "stringArray",
      nodeIdPath: "string",
      nodeIdPathEqual: "boolean",
      keyword: "string",
      matchType: "integer",
      variation: "string",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace"],
  },
  product_research: {
    parameters: {
      marketplace: "string",
      month: "string",
      keyword: "string",
      includeSellers: "string",
      excludeSellers: "string",
      matchType: "integer",
      excludeKeywords: "string",
      minPrice: "number",
      maxPrice: "number",
      minRating: "number",
      maxRating: "number",
      minRatings: "integer",
      maxRatings: "integer",
      minRatingsCv: "integer",
      maxRatingsCv: "integer",
      minSellers: "integer",
      maxSellers: "integer",
      minProfit: "number",
      maxProfit: "number",
      minBsr: "integer",
      maxBsr: "integer",
      minBsrCv: "integer",
      maxBsrCv: "integer",
      minBsrCr: "number",
      maxBsrCr: "number",
      minUnits: "integer",
      maxUnits: "integer",
      minAmzUnit: "integer",
      maxAmzUnit: "integer",
      minRevenue: "number",
      maxRevenue: "number",
      minRevenueCr: "number",
      maxRevenueCr: "number",
      minUnitsCr: "number",
      maxUnitsCr: "number",
      weightUnit: "string",
      minWeights: "number",
      maxWeights: "number",
      minVariations: "integer",
      maxVariations: "integer",
      filterSub: "string",
      minSubBsrRank: "integer",
      maxSubBsrRank: "integer",
      includeBrands: "string",
      excludeBrands: "string",
      nodeIdPaths: "stringArray",
      nodeIdPathEqual: "boolean",
      availableMonth: "integer",
      dimensionType: "string",
      minFba: "number",
      maxFba: "number",
      minLqs: "number",
      maxLqs: "number",
      sellerNation: "string",
      badgeBS: "string",
      badgeAC: "string",
      badgeNR: "string",
      fulfillment: "string",
      variation: "string",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace"],
  },
  product_node: {
    parameters: {
      marketplace: "string",
      nodeIdPath: "string",
      keyword: "string",
      month: "string",
    },
    required: ["marketplace"],
  },
  asin_competitor: {
    parameters: { marketplace: "string", asin: "string", size: "integer" },
    required: ["marketplace", "asin"],
  },
  asin_detail: {
    parameters: { marketplace: "string", asin: "string" },
    required: ["marketplace", "asin"],
  },
  asin_coupon_trend: {
    parameters: { marketplace: "string", asin: "string" },
    required: ["marketplace", "asin"],
  },
  asin_detail_with_coupon_trend: {
    parameters: { marketplace: "string", asin: "string" },
    required: ["marketplace", "asin"],
  },
  asin_sales_trend: {
    parameters: { marketplace: "string", asin: "string" },
    required: ["marketplace", "asin"],
  },
  asin_prediction: {
    parameters: { marketplace: "string", asin: "string" },
    required: ["marketplace", "asin"],
  },
  bsr_prediction: {
    parameters: { marketplace: "string", bsr: "integer", categoryId: "string" },
    required: ["marketplace", "bsr", "categoryId"],
  },
  traffic_keyword: {
    parameters: {
      marketplace: "string",
      asin: "string",
      keyword: "string",
      month: "string",
      badges: "stringArray",
      trafficKeywordTypes: "stringArray",
      conversionKeywordTypes: "stringArray",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace", "asin"],
  },
  keepa_info: {
    parameters: {
      marketplace: "string",
      asin: "string",
      startTimestamp: "integer",
      endTimestamp: "integer",
      dailyLatest: "boolean",
    },
    required: ["marketplace", "asin"],
  },
  keyword_research: {
    parameters: {
      marketplace: "string",
      month: "string",
      departments: "stringArray",
      keywords: "string",
      excludeKeywords: "string",
      minSearches: "integer",
      maxSearches: "integer",
      minSearchesCr: "number",
      maxSearchesCr: "number",
      minProducts: "integer",
      maxProducts: "integer",
      minPurchases: "integer",
      maxPurchases: "integer",
      minPurchaseRate: "number",
      maxPurchaseRate: "number",
      withYearlyGrowth: "boolean",
      minSearchMonthCv: "integer",
      maxSearchMonthCv: "integer",
      minSearchMonthCr: "number",
      maxSearchMonthCr: "number",
      minSearchNearlyCv: "integer",
      maxSearchNearlyCv: "integer",
      minSearchNearlyCr: "number",
      maxSearchNearlyCr: "number",
      marketPeriod: "string",
      minAvgPrice: "number",
      maxAvgPrice: "number",
      minRatings: "integer",
      maxRatings: "integer",
      minRating: "number",
      maxRating: "number",
      minBid: "number",
      maxBid: "number",
      minAraClickRate: "number",
      maxAraClickRate: "number",
      minGoodsValue: "number",
      maxGoodsValue: "number",
      minSupplyDemandRatio: "number",
      maxSupplyDemandRatio: "number",
      minWordCount: "integer",
      maxWordCount: "integer",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace"],
  },
  keyword_research_trends: {
    parameters: { marketplace: "string", keyword: "string" },
    required: ["marketplace", "keyword"],
  },
  keyword_miner: {
    parameters: {
      marketplace: "string",
      historyDate: "string",
      keyword: "string",
      keywordList: "stringArray",
      minSearch: "integer",
      maxSearch: "integer",
      minPurchases: "integer",
      maxPurchases: "integer",
      minPurchasesRate: "number",
      maxPurchasesRate: "number",
      minSPR: "integer",
      maxSPR: "integer",
      minTitleDensity: "integer",
      maxTitleDensity: "integer",
      minRelevancy: "number",
      maxRelevancy: "number",
      minSearchRank: "integer",
      maxSearchRank: "integer",
      minProducts: "integer",
      maxProducts: "integer",
      minSupplyDemandRatio: "number",
      maxSupplyDemandRatio: "number",
      minAdProducts: "integer",
      maxAdProducts: "integer",
      minWordCount: "integer",
      maxWordCount: "integer",
      minMonopolyClickRate: "number",
      maxMonopolyClickRate: "number",
      minBid: "number",
      maxBid: "number",
      minPrice: "number",
      maxPrice: "number",
      minRatings: "integer",
      maxRatings: "integer",
      minRating: "number",
      maxRating: "number",
      amazonChoice: "boolean",
      filterRootWord: "integer",
      matchType: "integer",
      includeKeywords: "stringArray",
      excludeKeywords: "stringArray",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace", "keyword"],
  },
  traffic_extend: {
    parameters: {
      marketplace: "string",
      historyDate: "string",
      asinList: "stringArray",
      queryType: "integer",
      minSearches: "integer",
      maxSearches: "integer",
      minSearchRank: "integer",
      maxSearchRank: "integer",
      minPurchases: "integer",
      maxPurchases: "integer",
      minPurchaseRate: "number",
      maxPurchaseRate: "number",
      minProducts: "integer",
      maxProducts: "integer",
      minSupplyDemandRatio: "number",
      maxSupplyDemandRatio: "number",
      minBid: "number",
      maxBid: "number",
      minAdProducts: "integer",
      maxAdProducts: "integer",
      minAvgPrice: "number",
      maxAvgPrice: "number",
      minWordCount: "integer",
      maxWordCount: "integer",
      includeKeywords: "stringArray",
      excludeKeywords: "stringArray",
      minSPR: "integer",
      maxSPR: "integer",
      minTitleDensity: "integer",
      maxTitleDensity: "integer",
      minMonopolyClickRate: "number",
      maxMonopolyClickRate: "number",
      minTrafficPercentage: "number",
      maxTrafficPercentage: "number",
      minConversionRate: "number",
      maxConversionRate: "number",
      minCompetitors: "integer",
      maxCompetitors: "integer",
      amazonChoice: "boolean",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace", "asinList"],
  },
  keyword_conversion: {
    parameters: {
      marketplace: "string",
      keyword: "string",
      timeType: "string",
      minSearches: "integer",
      maxSearches: "integer",
      minClicks: "integer",
      maxClicks: "integer",
      minPurchases: "integer",
      maxPurchases: "integer",
      minSearchConvRate: "number",
      maxSearchConvRate: "number",
      minClickConvRate: "number",
      maxClickConvRate: "number",
      minPpc: "number",
      maxPpc: "number",
      minCpa: "number",
      maxCpa: "number",
      minProductPrice: "number",
      maxProductPrice: "number",
      minAcos: "number",
      maxAcos: "number",
      minClickingRate: "number",
      maxClickingRate: "number",
      minConversionRate: "number",
      maxConversionRate: "number",
      minPhraseCount: "integer",
      maxPhraseCount: "integer",
      minBudget: "number",
      maxBudget: "number",
      matchType: "integer",
      includeKeywords: "stringArray",
      excludeKeywords: "stringArray",
      customAvgProductPrice: "number",
    },
    required: ["marketplace", "keyword"],
  },
  aba_research_weekly: {
    parameters: {
      marketplace: "string",
      date: "string",
      departments: "stringArray",
      excludeKeywords: "string",
      includeKeywords: "string",
      exactFlag: "boolean",
      rankGrowthValue: "integer",
      rankGrowthRate: "number",
      minRankGrowthRate: "number",
      maxRankGrowthRate: "number",
      minSearchRank: "integer",
      maxSearchRank: "integer",
      minSearches: "integer",
      maxSearches: "integer",
      minMonopolyClickRate: "number",
      maxMonopolyClickRate: "number",
      minConversionRate: "number",
      maxConversionRate: "number",
      minWordCount: "integer",
      maxWordCount: "integer",
      minSPR: "integer",
      maxSPR: "integer",
      minTitleDensity: "integer",
      maxTitleDensity: "integer",
      minClicks: "integer",
      maxClicks: "integer",
      minImpressions: "integer",
      maxImpressions: "integer",
      searchModel: "integer",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace"],
  },
  aba_research_monthly: {
    parameters: {
      marketplace: "string",
      date: "string",
      departments: "stringArray",
      excludeKeywords: "string",
      includeKeywords: "string",
      exactFlag: "boolean",
      minRankGrowthRate: "number",
      maxRankGrowthRate: "number",
      minSearchRank: "integer",
      maxSearchRank: "integer",
      minSearches: "integer",
      maxSearches: "integer",
      minMonopolyClickRate: "number",
      maxMonopolyClickRate: "number",
      minConversionRate: "number",
      maxConversionRate: "number",
      minWordCount: "integer",
      maxWordCount: "integer",
      minSPR: "integer",
      maxSPR: "integer",
      minTitleDensity: "integer",
      maxTitleDensity: "integer",
      minClicks: "integer",
      maxClicks: "integer",
      minImpressions: "integer",
      maxImpressions: "integer",
      searchModel: "integer",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace"],
  },
  aba_research_trend: {
    parameters: { marketplace: "string", keyword: "string", timeGranularity: "string" },
    required: ["marketplace", "keyword"],
  },
  google_trend: {
    parameters: {
      marketplace: "string",
      keyword: "string",
      googleProp: "string",
      monthly: "boolean",
    },
    required: ["marketplace"],
  },
  keyword_order: {
    parameters: {
      marketplace: "string",
      asins: "stringArray",
      reverseType: "string",
      date: "string",
      conversionType: "stringArray",
      variation: "stringArray",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace", "asins", "reverseType"],
  },
  traffic_listing: {
    parameters: {
      marketplace: "string",
      asinList: "stringArray",
      relations: "stringArray",
      variations: "boolean",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace", "asinList", "relations"],
  },
  traffic_keyword_stat: {
    parameters: { marketplace: "string", asin: "string", month: "string" },
    required: ["marketplace", "asin"],
  },
  traffic_listing_stat: {
    parameters: { marketplace: "string", asinList: "stringArray" },
    required: ["marketplace"],
  },
  traffic_source: {
    parameters: {
      marketplace: "string",
      q: "string",
      month: "string",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace", "q", "month"],
  },
  market_research: {
    parameters: {
      marketplace: "string",
      month: "string",
      topNum: "integer",
      newProduct: "integer",
      nodeIdPath: "string",
      departmentKeyword: "string",
      minAvgUnits: "integer",
      maxAvgUnits: "integer",
      minAvgRevenue: "number",
      maxAvgRevenue: "number",
      minAvgRatings: "integer",
      maxAvgRatings: "integer",
      minAvgRating: "number",
      maxAvgRating: "number",
      minAvgBsr: "integer",
      maxAvgBsr: "integer",
      minAvgPrice: "number",
      maxAvgPrice: "number",
      minWeight: "number",
      maxWeight: "number",
      minVolume: "number",
      maxVolume: "number",
      minAvgProfit: "number",
      maxAvgProfit: "number",
      minTopAvgUnits: "integer",
      maxTopAvgUnits: "integer",
      minTopAvgRevenue: "number",
      maxTopAvgRevenue: "number",
      minTopAvgBsr: "integer",
      maxTopAvgBsr: "integer",
      minGoodsCount: "integer",
      maxGoodsCount: "integer",
      minBrands: "integer",
      maxBrands: "integer",
      minSellers: "integer",
      maxSellers: "integer",
      minAvgSellers: "number",
      maxAvgSellers: "number",
      minGoodsCrn: "number",
      maxGoodsCrn: "number",
      minBrandCrn: "number",
      maxBrandCrn: "number",
      maxSellerCrn: "number",
      minSellerCrn: "number",
      minEbcProportion: "number",
      maxEbcProportion: "number",
      minFbaProportion: "number",
      maxFbaProportion: "number",
      minFbmProportion: "number",
      maxFbmProportion: "number",
      minAmazonSelfProportion: "number",
      maxAmazonSelfProportion: "number",
      sellerLocation: "string",
      minNewProportion: "number",
      maxNewProportion: "number",
      minNewCount: "integer",
      maxNewCount: "integer",
      minNewAvgRatings: "integer",
      maxNewAvgRatings: "integer",
      minNewAvgPrice: "number",
      maxNewAvgPrice: "number",
      minNewAvgRating: "number",
      maxNewAvgRating: "number",
      minNewAvgUnits: "number",
      maxNewAvgUnits: "number",
      minNewAvgRevenue: "number",
      maxNewAvgRevenue: "number",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["marketplace"],
  },
  market_research_statistics: marketAnalysisParameters(),
  market_product_concentration: marketAnalysisParameters({ asins: "stringArray" }),
  market_brand_concentration: marketAnalysisParameters(),
  market_seller_country_distribution: marketAnalysisParameters(),
  market_seller_concentration: marketAnalysisParameters(),
  market_seller_type_concentration: marketAnalysisParameters(),
  market_product_demand_trend: marketAnalysisParameters(),
  market_listing_date_distribution: marketAnalysisParameters(),
  market_listing_trend_distribution: {
    parameters: marketAnalysisParameterSchemas,
    required: [],
  },
  market_ratings_count_distribution: marketAnalysisParameters(),
  market_rating_distribution: marketAnalysisParameters(),
  market_price_distribution: marketAnalysisParameters(),
  market_ebc_distribution: marketAnalysisParameters(),
  review: {
    parameters: {
      marketplace: "string",
      asin: "string",
      starList: "integerArray",
      typeList: "integerArray",
      page: "integer",
      size: "integer",
    },
    required: ["marketplace", "asin"],
  },
  trademark_country_list: { parameters: {}, required: [] },
  trademark_detail: {
    parameters: { office: "string", brandId: "string" },
    required: ["office", "brandId"],
  },
  trademark_list: {
    parameters: {
      office: "stringArray",
      text: "string",
      brandName: "stringArray",
      status: "stringArray",
      applicant: "stringArray",
      niceClass: "integerArray",
      applicationYear: "stringArray",
      expiryYear: "stringArray",
      page: "integer",
      size: "integer",
      order: "object",
    },
    required: ["text"],
  },
  trademark_stats: {
    parameters: { office: "stringArray", text: "string" },
    required: ["office", "text"],
  },
} as const satisfies Record<string, OfficialToolDefinition>;

const officialToolDescriptionByName: Record<string, string> = {
  competitor_lookup:
    "Find competing Amazon products by marketplace, category, brand, seller, ASIN, keyword, and product filters.",
  product_research:
    "Research Amazon products using sales, revenue, price, ranking, review, fulfillment, brand, seller, and category filters.",
  product_node: "Find Amazon category nodes by marketplace, category path, keyword, or historical month.",
  asin_competitor: "Retrieve competing products identified for one Amazon ASIN.",
  asin_detail: "Retrieve SellerSprite product, sales, ranking, price, review, and seller data for one Amazon ASIN.",
  asin_coupon_trend: "Retrieve the historical coupon trend for one Amazon ASIN.",
  asin_detail_with_coupon_trend: "Retrieve ASIN details together with the product's historical coupon trend.",
  asin_sales_trend: "Retrieve the historical sales trend for one Amazon ASIN.",
  asin_prediction: "Retrieve SellerSprite sales predictions for one Amazon ASIN.",
  bsr_prediction: "Estimate Amazon product sales from a Best Sellers Rank and top-level category.",
  traffic_keyword: "Retrieve the search and conversion keywords that drive traffic to one Amazon ASIN.",
  keepa_info: "Retrieve SellerSprite's Keepa-style historical product trend data for one Amazon ASIN.",
  keyword_research:
    "Research Amazon keywords using search, purchase, competition, price, review, growth, PPC, and demand filters.",
  keyword_research_trends: "Retrieve the historical SellerSprite trend for one Amazon keyword.",
  keyword_miner:
    "Discover related Amazon keywords using search volume, purchase, competition, relevancy, PPC, price, and review filters.",
  traffic_extend:
    "Expand the traffic keywords shared by a set of Amazon ASINs using search, purchase, competition, and conversion filters.",
  keyword_conversion:
    "Analyze Amazon keyword search, click, purchase, conversion, advertising, price, and budget performance.",
  aba_research_weekly:
    "Research weekly Amazon Brand Analytics keywords using rank, search, click, conversion, and market-pattern filters.",
  aba_research_monthly:
    "Research monthly Amazon Brand Analytics keywords using rank, search, click, conversion, and market-pattern filters.",
  aba_research_trend: "Retrieve weekly or monthly Amazon Brand Analytics trend data for one keyword.",
  google_trend: "Retrieve Google Trends interest data for an Amazon marketplace keyword.",
  keyword_order: "Reverse-search the weekly or monthly Amazon keywords that generated orders for selected ASINs.",
  traffic_listing: "Retrieve Amazon listings related to selected ASINs by the requested traffic relationship types.",
  traffic_keyword_stat: "Retrieve aggregate traffic-keyword statistics for one Amazon ASIN.",
  traffic_listing_stat: "Retrieve aggregate related-listing traffic statistics for selected Amazon ASINs.",
  traffic_source: "Trace Amazon keyword traffic from a query to the listings receiving that traffic.",
  market_research:
    "Research Amazon categories and market segments using demand, competition, concentration, fulfillment, seller, and new-product filters.",
  market_research_statistics: "Retrieve summary statistics for one Amazon category market.",
  market_product_concentration: "Retrieve product concentration for one Amazon category market.",
  market_brand_concentration: "Retrieve brand concentration for one Amazon category market.",
  market_seller_country_distribution: "Retrieve the seller-country distribution for one Amazon category market.",
  market_seller_concentration: "Retrieve seller concentration for one Amazon category market.",
  market_seller_type_concentration:
    "Retrieve the fulfillment and seller-type distribution for one Amazon category market.",
  market_product_demand_trend: "Retrieve the product-demand trend for one Amazon category market.",
  market_listing_date_distribution: "Retrieve the listing-age distribution for one Amazon category market.",
  market_listing_trend_distribution:
    "Retrieve Amazon market listing-trend distribution data using the supplied optional market filters.",
  market_ratings_count_distribution: "Retrieve the review-count distribution for one Amazon category market.",
  market_rating_distribution: "Retrieve the star-rating distribution for one Amazon category market.",
  market_price_distribution: "Retrieve the price distribution for one Amazon category market.",
  market_ebc_distribution: "Retrieve the A+ content and video distribution for one Amazon category market.",
  review: "Retrieve Amazon reviews for one ASIN with optional star-rating and review-type filters.",
  trademark_country_list:
    "Retrieve the countries and trademark offices covered by SellerSprite's global trademark database.",
  trademark_detail: "Retrieve one global trademark record by trademark office and SellerSprite brand ID.",
  trademark_list:
    "Search SellerSprite's global trademark records by text, office, brand, status, applicant, class, and year filters.",
  trademark_stats: "Retrieve aggregate global trademark statistics for search text and selected trademark offices.",
};

const sellerSpriteMarketplaceValues = ["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN"] as const;

const sizeMaximumByToolName: Readonly<Partial<Record<string, number>>> = {
  competitor_lookup: 100,
  product_research: 100,
  traffic_keyword: 100,
  keyword_research: 15,
  keyword_miner: 100,
  traffic_extend: 50,
  aba_research_weekly: 40,
  aba_research_monthly: 15,
  traffic_source: 100,
  market_research: 200,
  review: 10,
  trademark_list: 100,
};

const arrayMaximumByToolAndParameter: Readonly<Record<string, number>> = {
  "competitor_lookup.asins": 40,
  "traffic_extend.asinList": 20,
  "keyword_order.asins": 20,
};

const integerValuesByToolAndParameter: Readonly<Record<string, readonly number[]>> = {
  "competitor_lookup.matchType": [1, 2, 3],
  "product_research.matchType": [1, 2, 3],
  "keyword_miner.filterRootWord": [0, 1],
  "keyword_miner.matchType": [2, 3],
  "traffic_extend.queryType": [0, 1, 2],
  "aba_research_weekly.searchModel": [1, 2, 3, 4, 5, 6],
  "aba_research_monthly.searchModel": [1, 2, 3, 4, 5, 6],
};

const integerArrayValuesByToolAndParameter: Readonly<Record<string, readonly number[]>> = {
  "review.starList": [1, 2, 3, 4, 5],
  "review.typeList": [1, 2, 3, 4],
};

const stringValuesByToolAndParameter: Readonly<Record<string, readonly string[]>> = {
  "competitor_lookup.variation": ["N", "Y"],
  "product_research.variation": ["N", "Y"],
  "keyword_order.reverseType": ["W", "M"],
};

const stringArrayValuesByToolAndParameter: Readonly<Record<string, readonly string[]>> = {
  "keyword_order.conversionType": ["E", "S", "L", "I"],
  "keyword_order.variation": ["Y", "N"],
};

const parameterDescriptionByToolAndName: Readonly<Record<string, string>> = {
  "competitor_lookup.asins": "Amazon ASINs to query, with at most 40 values.",
  "competitor_lookup.matchType": "Keyword match type: 1 for phrase, 2 for broad, or 3 for exact.",
  "competitor_lookup.variation": "Variation handling: N includes variation ASINs and Y excludes them.",
  "product_research.matchType": "Keyword match type: 1 for phrase, 2 for broad, or 3 for exact.",
  "product_research.variation": "Variation handling: N includes variation ASINs and Y excludes them.",
  "keyword_miner.filterRootWord": "Root-word filter: 0 includes all keywords and 1 includes only root-word matches.",
  "keyword_miner.matchType": "Keyword match type: 2 for broad or 3 for phrase.",
  "traffic_extend.asinList": "Amazon ASINs to query, with at most 20 values.",
  "traffic_extend.queryType":
    "Variation query mode: 0 for all variations, 1 for the best-selling variation, or 2 for the current variation.",
  "aba_research_weekly.searchModel":
    "Search model from 1 through 6: popular, changing, sustained growth, rapid growth, potential, or long-tail market.",
  "aba_research_monthly.searchModel":
    "Search model from 1 through 6: popular, changing, sustained growth, rapid growth, potential, or long-tail market.",
  "keyword_order.asins": "Amazon ASINs to query, with at most 20 values.",
  "keyword_order.reverseType": "Reverse-search period: W for weekly or M for monthly.",
  "keyword_order.size": "The fixed SellerSprite page size of 50 results.",
  "keyword_order.conversionType":
    "Conversion categories: E for high quality, S for stable, L for lost, and I for ineffective impressions.",
  "keyword_order.variation": "Variation handling values: Y excludes variations and N includes them.",
  "review.starList": "Review star ratings to include, from 1 through 5.",
  "review.typeList": "Review types: 1 for image, 2 for video, 3 for verified purchase, or 4 for Vine.",
};

const parameterDescriptionByName: Readonly<Record<string, string>> = {
  marketplace: "The Amazon marketplace code.",
  month: "The historical month in YYYYMM format; omit when the tool supports latest data.",
  historyDate: "The historical month in YYYYMM format; omit for the latest period.",
  date: "The SellerSprite reporting period documented for this tool.",
  asin: "The ten-character Amazon ASIN.",
  asins: "Amazon ASINs used by the query.",
  asinList: "Amazon ASINs used by the query.",
  keyword: "The Amazon search keyword.",
  keywordList: "Amazon search keywords used by the query.",
  includeKeywords: "Keywords that results must include.",
  excludeKeywords: "Keywords that results must exclude.",
  nodeIdPath: "The colon-separated Amazon category node path.",
  nodeIdPaths: "Amazon category node paths used by the query.",
  categoryId: "The top-level Amazon category node identifier.",
  page: "The one-based result page number.",
  size: "The number of results requested per page.",
  order: "SellerSprite result sorting settings.",
  returnFields: "Comma-separated response fields to return.",
  office: "Trademark registry office or country codes.",
  brandId: "The SellerSprite global trademark identifier.",
  text: "Text used to search the global trademark database.",
};

export const sellerSpriteMcpOfficialActions: ActionDefinition[] = Object.entries(
  sellerSpriteMcpOfficialToolDefinitions,
).map(([name, definition]) =>
  defineProviderAction(service, {
    name,
    operationType: "read",
    description: officialToolDescriptionByName[name],
    requiredScopes: [],
    inputSchema: officialToolInputSchema(name, definition),
    outputSchema: s.object(`The normalized result returned by the SellerSprite ${name} MCP tool.`, {
      result: s.unknown("The SellerSprite MCP result, preserving the provider-defined structured response."),
    }),
  }),
) satisfies ActionDefinition[];

function officialToolInputSchema(name: string, definition: OfficialToolDefinition) {
  const properties: Record<string, JsonSchema> = {};
  for (const [parameterName, parameterType] of Object.entries(definition.parameters)) {
    properties[parameterName] = officialParameterSchema(name, parameterName, parameterType);
  }
  properties.returnFields = s.nonEmptyString(
    "Comma-separated response field names to reduce SellerSprite MCP result size and token usage.",
  );

  return s.object(`Official arguments for the SellerSprite ${name} MCP tool.`, properties, {
    required: [...definition.required],
  });
}

function officialParameterSchema(toolName: string, name: string, type: OfficialParameterType) {
  const parameterKey = `${toolName}.${name}`;
  const description =
    parameterDescriptionByToolAndName[parameterKey] ??
    parameterDescriptionByName[name] ??
    `The ${humanizeIdentifier(name)} value documented by SellerSprite for this MCP tool.`;
  if (name === "marketplace") {
    return s.stringEnum("The Amazon marketplace code supported by SellerSprite.", sellerSpriteMarketplaceValues);
  }
  if (name === "month") {
    return monthSchema(description);
  }
  if (name === "historyDate") {
    return optionalHistoryMonthSchema(description);
  }
  if (name === "asin") {
    return asinSchema(description);
  }
  if (name === "size") {
    if (toolName === "keyword_order") {
      return { type: "integer", enum: [50], description };
    }
    const maximum = sizeMaximumByToolName[toolName];
    return s.integer(description, maximum === undefined ? { minimum: 1 } : { minimum: 1, maximum });
  }
  if (name === "page" || name === "bsr") {
    return s.integer(description, { minimum: 1 });
  }
  const integerValues = integerValuesByToolAndParameter[parameterKey];
  if (type === "integer" && integerValues) {
    return { type: "integer", enum: integerValues, description };
  }
  const stringValues = stringValuesByToolAndParameter[parameterKey];
  if (type === "string" && stringValues) {
    return s.stringEnum(description, stringValues);
  }
  switch (type) {
    case "string":
      return s.nonEmptyString(description);
    case "integer":
      return s.integer(description);
    case "number":
      return s.number(description);
    case "boolean":
      return s.boolean(description);
    case "stringArray": {
      const stringArrayValues = stringArrayValuesByToolAndParameter[parameterKey];
      const maxItems = arrayMaximumByToolAndParameter[parameterKey];
      const arrayOptions = maxItems === undefined ? { minItems: 1 } : { minItems: 1, maxItems };
      if (name === "asins" || name === "asinList") {
        return s.array(description, asinSchema("One ten-character Amazon ASIN."), arrayOptions);
      }
      if (stringArrayValues) {
        return s.array(
          description,
          s.stringEnum(`One allowed ${humanizeIdentifier(name)} value.`, stringArrayValues),
          arrayOptions,
        );
      }
      return s.stringArray(description, {
        ...arrayOptions,
        itemDescription: `One ${humanizeIdentifier(name)} value.`,
      });
    }
    case "integerArray": {
      const integerArrayValues = integerArrayValuesByToolAndParameter[parameterKey];
      return s.array(
        description,
        integerArrayValues
          ? {
              type: "integer",
              enum: integerArrayValues,
              description: `One allowed ${humanizeIdentifier(name)} value.`,
            }
          : s.integer(`One ${humanizeIdentifier(name)} value.`),
        { minItems: 1 },
      );
    }
    case "object":
      return s.looseObject(description, {
        field: s.optional(s.nonEmptyString("The SellerSprite field used to sort the results.")),
        desc: s.optional(s.boolean("Whether to sort the results in descending order.")),
      });
  }
}

function monthSchema(description: string) {
  return s.string({ description, minLength: 6, maxLength: 6, pattern: "^[0-9]{4}(0[1-9]|1[0-2])$" });
}

function optionalHistoryMonthSchema(description: string) {
  return s.string({ description, pattern: "^$|^[0-9]{4}(0[1-9]|1[0-2])$" });
}

function asinSchema(description: string) {
  return s.string({ description, minLength: 10, maxLength: 10, pattern: "^[A-Z0-9]{10}$" });
}

function humanizeIdentifier(value: string) {
  let result = "";
  for (const character of value) {
    if (character === "_") {
      result += " ";
      continue;
    }
    const isUppercase = character >= "A" && character <= "Z";
    result += isUppercase ? ` ${character.toLowerCase()}` : character;
  }
  return result.trim();
}
