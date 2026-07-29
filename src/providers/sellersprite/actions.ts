import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sellersprite";

const marketplaceSchema = s.stringEnum("Amazon marketplace code supported by SellerSprite.", [
  "US",
  "JP",
  "UK",
  "DE",
  "FR",
  "IT",
  "ES",
  "CA",
  "IN",
]);

function monthSchema(description: string) {
  return s.string(description, {
    pattern: "^\\s*[0-9]{4}(0[1-9]|1[0-2])\\s*$",
  });
}

function asinSchema(description: string) {
  return s.string(description, {
    pattern: "^\\s*[A-Za-z0-9]{10}\\s*$",
  });
}

const pageSchema = s.positiveInteger("One-based page number.");
const pageSizeSchema = s.integer("Number of results per page, up to 100.", {
  minimum: 1,
  maximum: 100,
});
const matchTypeSchema = s.integer("Keyword match type: 1 for phrase, 2 for broad, or 3 for exact.", {
  minimum: 1,
  maximum: 3,
});
const variationSchema = s.stringEnum("Variation handling: N includes variation ASINs and Y excludes them.", ["N", "Y"]);
const yesSchema = s.stringEnum("Whether the filter is enabled.", ["Y"]);
const sortSchema = s.object(
  "SellerSprite sort settings.",
  {
    field: s.nonWhitespaceString("SellerSprite field name used to sort the results."),
    desc: s.boolean("Whether results are sorted in descending order."),
  },
  { required: [] },
);

const badgeOutputSchema = s.nullable(
  s.looseObject("SellerSprite badges associated with the product.", {
    bestSeller: s.nullableString("Best Seller badge value."),
    amazonChoice: s.nullableString("Amazon's Choice badge value."),
    newRelease: s.nullableString("New Release badge value."),
    ebc: s.nullableString("Whether the product has A+ content."),
    video: s.nullableString("Whether the product has a video."),
  }),
);

const subcategoryOutputSchema = s.looseObject("Amazon subcategory rank returned by SellerSprite.", {
  code: s.nullableString("Amazon subcategory code."),
  rank: s.nullableInteger("Product rank in the subcategory."),
  label: s.nullableString("Amazon subcategory label."),
});

const productOutputSchema = s.looseObject("Product research record returned by SellerSprite.", {
  asin: s.nullableString("Amazon ASIN."),
  brand: s.nullableString("Product brand."),
  brandUrl: s.nullableString("Amazon brand URL."),
  imageUrl: s.nullableString("Product image URL."),
  title: s.nullableString("Amazon product title."),
  parent: s.nullableString("Parent ASIN."),
  nodeId: s.nullable(
    s.anyOf("Amazon category node identifier.", [
      s.integer("Numeric Amazon category node identifier."),
      s.string("String Amazon category node identifier."),
    ]),
  ),
  nodeIdPath: s.nullableString("Amazon category node path."),
  nodeLabelPath: s.nullableString("Amazon category label path."),
  bsrId: s.nullableString("Amazon BSR category identifier."),
  bsr: s.nullableInteger("Amazon Best Sellers Rank."),
  bsrCr: s.nullableNumber("BSR growth rate."),
  bsrCv: s.nullableInteger("BSR growth amount."),
  units: s.nullableInteger("Estimated monthly parent-product sales volume."),
  unitsGr: s.nullableNumber("Estimated monthly sales growth rate."),
  amzUnit: s.nullableInteger("Estimated recent child-ASIN sales volume."),
  amzSales: s.nullableNumber("Estimated child-ASIN sales revenue."),
  amzUnitDate: s.nullableInteger("Child-ASIN estimate update time in epoch milliseconds."),
  revenue: s.nullableNumber("Estimated monthly parent-product revenue."),
  price: s.nullableNumber("Current product price."),
  averagePrice: s.nullableNumber("Average product price."),
  primePrice: s.nullableNumber("Prime price, or -1 when unavailable."),
  profit: s.nullableNumber("Estimated gross margin percentage."),
  fba: s.nullableNumber("Estimated FBA fee."),
  ratings: s.nullableInteger("Product rating count."),
  ratingsRate: s.nullableNumber("Estimated review rate."),
  rating: s.nullableNumber("Average product rating."),
  ratingsCv: s.nullableInteger("Monthly rating-count growth."),
  ratingDelta: s.nullableInteger("New ratings in the recent period."),
  lqs: s.nullableNumber("SellerSprite listing quality score."),
  availableDate: s.nullableInteger("Listing date in epoch milliseconds."),
  fulfillment: s.nullableString("Fulfillment method."),
  variations: s.nullableInteger("Variation count."),
  sellers: s.nullableInteger("Seller count."),
  sellerId: s.nullableString("Buy Box seller identifier."),
  sellerName: s.nullableString("Buy Box seller name."),
  sellerNation: s.nullableString("Buy Box seller country code."),
  weight: s.nullableString("Product weight text."),
  dimension: s.nullableString("Product dimensions text."),
  dimensionsType: s.nullableString("SellerSprite dimension type."),
  pkgDimensions: s.nullableString("Package dimensions text."),
  pkgDimensionType: s.nullableString("SellerSprite package dimension type."),
  pkgWeight: s.nullableString("Package weight text."),
  sku: s.nullableString("Variation attribute text."),
  deliveryPrice: s.nullableNumber("Seller delivery fee, or -1 when unavailable."),
  badge: badgeOutputSchema,
  subcategories: s.nullable(s.array("Amazon subcategory ranks.", subcategoryOutputSchema)),
});

const paginatedProductOutputSchema = s.object(
  "Paginated product research results returned by SellerSprite.",
  {
    pages: s.integer("Total number of result pages."),
    page: s.integer("Current result page."),
    size: s.integer("Number of requested results per page."),
    total: s.integer("Total number of matching results."),
    took: s.nullableInteger("SellerSprite query duration in milliseconds."),
    order: s.nullable(s.looseObject("Sort settings echoed by SellerSprite.")),
    items: s.array("Products returned on this page.", productOutputSchema),
  },
  {
    required: ["pages", "page", "size", "total", "items"],
    additionalProperties: true,
  },
);

const usageOutputSchema = s.actionOutput(
  {
    usage: s.unknown(
      "Raw current-month per-module usage payload returned by SellerSprite because the provider does not publish a stable nested schema.",
    ),
  },
  "Current SellerSprite API usage information.",
);

const asinDetailOptionalFields = {
  asinUrl: s.nullableString("Amazon product URL."),
  availableDate: s.nullableInteger("Listing date in epoch milliseconds."),
  badge: badgeOutputSchema,
  brand: s.nullableString("Product brand."),
  brandUrl: s.nullableString("Amazon brand URL."),
  bsrId: s.nullableString("Amazon BSR category identifier."),
  bsrLabel: s.nullableString("Amazon BSR category label."),
  bsrRank: s.nullableInteger("Amazon Best Sellers Rank."),
  createdTime: s.nullableInteger("SellerSprite record creation time in epoch milliseconds."),
  dimensions: s.nullableString("Product dimensions text."),
  firstRatingDate: s.nullableInteger("First rating date in epoch milliseconds."),
  imageUrl: s.nullableString("Product image URL."),
  lqs: s.nullableInteger("SellerSprite listing quality score."),
  nodeId: s.nullable(
    s.anyOf("Amazon category node identifier.", [
      s.integer("Numeric Amazon category node identifier."),
      s.string("String Amazon category node identifier."),
    ]),
  ),
  nodeIdPath: s.nullableString("Amazon category node path."),
  nodeLabelPath: s.nullableString("Amazon category label path."),
  nodeLabelPathLocale: s.nullableString("Localized Amazon category label path."),
  parent: s.nullableString("Parent ASIN."),
  price: s.nullableNumber("Current product price."),
  primePrice: s.nullableNumber("Prime price, or -1 when unavailable."),
  deliveryPrice: s.nullableNumber("Seller delivery fee, or -1 when unavailable."),
  coupon: s.nullableString("Current coupon text."),
  questions: s.nullableInteger("Customer question count."),
  rating: s.nullableNumber("Average product rating."),
  ratings: s.nullableInteger("Product rating count."),
  reviews: s.nullableInteger("Product review count."),
  variantRatings: s.nullableInteger("Variation rating count."),
  variantReviews: s.nullableInteger("Variation review count."),
  sellerId: s.nullableString("Buy Box seller identifier."),
  sellerName: s.nullableString("Buy Box seller name."),
  fulfillment: s.nullableString("Fulfillment method."),
  sellers: s.nullableInteger("Seller count."),
  skuList: s.nullable(s.array("Variation attribute strings.", s.string("One variation attribute string."))),
  marketplace: s.nullableString("Amazon marketplace code."),
  title: s.nullableString("Amazon product title."),
  features: s.nullable(s.array("Amazon feature bullets.", s.string("One Amazon feature bullet."))),
  overviews: s.nullableString("JSON-formatted product overview text."),
  updatedTime: s.nullableInteger("SellerSprite update time in epoch milliseconds."),
  variationList: s.nullable(
    s.array(
      "Product variations returned by SellerSprite.",
      s.looseObject("One product variation.", {
        asin: s.nullableString("Variation ASIN."),
        attribute: s.nullableString("Variation attribute text."),
      }),
    ),
  ),
  variations: s.nullableInteger("Variation count."),
  weight: s.nullableString("Product weight text."),
  zoomImageUrl: s.nullableString("Large product image URL."),
  subcategories: s.nullable(s.array("Amazon subcategory ranks.", subcategoryOutputSchema)),
};

const asinDetailOutputSchema = s.object(
  "SellerSprite ASIN details with stable documented fields and additional upstream fields preserved.",
  {
    asin: s.string("Amazon ASIN returned by SellerSprite."),
    ...asinDetailOptionalFields,
  },
  {
    required: ["asin"],
    additionalProperties: true,
  },
);

const competitorOptionalFields = {
  month: monthSchema("Historical month in YYYYMM format."),
  brand: s.nonWhitespaceString("Brand name used to filter competitor products."),
  sellerName: s.nonWhitespaceString("Seller name used to filter competitor products."),
  asins: s.array("ASINs used to select competitor products.", asinSchema("One Amazon ASIN."), {
    minItems: 1,
    maxItems: 40,
  }),
  nodeIdPath: s.nonWhitespaceString("Amazon category node path used to filter products."),
  nodeIdPathEqual: s.boolean("Whether nodeIdPath is matched exactly instead of including descendant categories."),
  keyword: s.nonWhitespaceString("Keyword used to filter competitor products."),
  matchType: matchTypeSchema,
  variation: variationSchema,
  page: pageSchema,
  size: pageSizeSchema,
  order: sortSchema,
};

const competitorInputSchema = s.actionInput(
  {
    marketplace: marketplaceSchema,
    ...competitorOptionalFields,
  },
  ["marketplace"],
  "Filters for the SellerSprite competitor lookup.",
);

const productResearchOptionalFields = {
  month: monthSchema("Historical month in YYYYMM format."),
  keyword: s.nonWhitespaceString("Keyword used to filter products."),
  includeSellers: s.nonWhitespaceString("Seller names to include."),
  excludeSellers: s.nonWhitespaceString("Seller names to exclude."),
  matchType: matchTypeSchema,
  excludeKeywords: s.nonWhitespaceString("Keywords to exclude."),
  minPrice: s.number("Minimum product price."),
  maxPrice: s.number("Maximum product price."),
  minRating: s.number("Minimum average rating."),
  maxRating: s.number("Maximum average rating."),
  minRatings: s.integer("Minimum rating count."),
  maxRatings: s.integer("Maximum rating count."),
  minRatingsCv: s.integer("Minimum monthly rating-count growth."),
  maxRatingsCv: s.integer("Maximum monthly rating-count growth."),
  minSellers: s.integer("Minimum seller count."),
  maxSellers: s.integer("Maximum seller count."),
  minProfit: s.number("Minimum estimated gross margin percentage."),
  maxProfit: s.number("Maximum estimated gross margin percentage."),
  minBsr: s.integer("Minimum BSR filter value."),
  maxBsr: s.integer("Maximum BSR filter value."),
  minBsrCv: s.integer("Minimum BSR growth amount."),
  maxBsrCv: s.integer("Maximum BSR growth amount."),
  minBsrCr: s.number("Minimum BSR growth rate."),
  maxBsrCr: s.number("Maximum BSR growth rate."),
  minUnits: s.integer("Minimum estimated monthly parent-product sales volume."),
  maxUnits: s.integer("Maximum estimated monthly parent-product sales volume."),
  minAmzUnit: s.integer("Minimum estimated monthly child-ASIN sales volume."),
  maxAmzUnit: s.integer("Maximum estimated monthly child-ASIN sales volume."),
  minRevenue: s.number("Minimum estimated monthly revenue."),
  maxRevenue: s.number("Maximum estimated monthly revenue."),
  minRevenueCr: s.number("Minimum estimated monthly revenue growth rate."),
  maxRevenueCr: s.number("Maximum estimated monthly revenue growth rate."),
  minUnitsCr: s.number("Minimum estimated monthly sales growth rate."),
  maxUnitsCr: s.number("Maximum estimated monthly sales growth rate."),
  weightUnit: s.nonWhitespaceString("Weight unit used by minWeights and maxWeights."),
  minWeights: s.number("Minimum product weight."),
  maxWeights: s.number("Maximum product weight."),
  minVariations: s.integer("Minimum variation count."),
  maxVariations: s.integer("Maximum variation count."),
  filterSub: yesSchema,
  minSubBsrRank: s.integer("Minimum subcategory BSR used when filterSub is Y."),
  maxSubBsrRank: s.integer("Maximum subcategory BSR used when filterSub is Y."),
  includeBrands: s.nonWhitespaceString("Brand names to include."),
  excludeBrands: s.nonWhitespaceString("Brand names to exclude."),
  nodeIdPaths: s.array(
    "Amazon category node paths used to filter products.",
    s.nonWhitespaceString("One Amazon category node path."),
    {
      minItems: 1,
    },
  ),
  nodeIdPathEqual: s.boolean("Whether category paths are matched exactly instead of including descendants."),
  availableMonth: s.anyOf("Listing age bucket in months.", [
    s.literal(1, { description: "Listings from the last month." }),
    s.literal(3, { description: "Listings from the last three months." }),
    s.literal(6, { description: "Listings from the last six months." }),
    s.literal(12, { description: "Listings from the last year." }),
    s.literal(24, { description: "Listings from the last two years." }),
  ]),
  dimensionType: s.nonWhitespaceString("Comma-separated SellerSprite product dimension type codes."),
  minFba: s.number("Minimum estimated FBA fee."),
  maxFba: s.number("Maximum estimated FBA fee."),
  minLqs: s.number("Minimum SellerSprite listing quality score."),
  maxLqs: s.number("Maximum SellerSprite listing quality score."),
  sellerNation: s.nonWhitespaceString("Comma-separated seller country codes."),
  badgeBS: yesSchema,
  badgeAC: yesSchema,
  badgeNR: yesSchema,
  fulfillment: s.nonWhitespaceString("Comma-separated fulfillment methods such as AMZ, FBA, or FBM."),
  variation: variationSchema,
  page: pageSchema,
  size: pageSizeSchema,
  order: sortSchema,
};

const productResearchInputSchema = s.actionInput(
  {
    marketplace: marketplaceSchema,
    ...productResearchOptionalFields,
  },
  ["marketplace"],
  "Filters for SellerSprite product research.",
);

const rankPositionOutputSchema = s.nullable(
  s.looseObject("Natural or advertising search position.", {
    page: s.nullableInteger("Search results page."),
    pageSize: s.nullableInteger("Number of results on the search page."),
    index: s.nullableInteger("Position within the search page."),
    position: s.nullableInteger("Overall position in the search results."),
    updatedTime: s.nullableInteger("Ranking update time in epoch milliseconds."),
  }),
);

const keywordOutputSchema = s.looseObject("Reverse-ASIN traffic keyword returned by SellerSprite.", {
  keyword: s.nullableString("Traffic keyword."),
  keywordCn: s.nullableString("Chinese keyword translation."),
  searches: s.nullableInteger("Estimated monthly Amazon search volume."),
  products: s.nullableInteger("Number of products in the keyword results."),
  purchases: s.nullableInteger("Estimated monthly purchase count."),
  purchaseRate: s.nullableNumber("Estimated purchase rate."),
  bid: s.nullableNumber("Suggested phrase-match PPC bid."),
  bidMax: s.nullableNumber("Maximum suggested PPC bid."),
  bidMin: s.nullableNumber("Minimum suggested PPC bid."),
  badges: s.nullable(s.array("Search exposure position types.", s.string("One exposure position type."))),
  rankPosition: rankPositionOutputSchema,
  adPosition: rankPositionOutputSchema,
  searchesRank: s.nullableInteger("Amazon ABA search frequency rank."),
  searchesRankTimeFrom: s.nullableInteger("ABA rank period start in epoch milliseconds."),
  searchesRankTimeTo: s.nullableInteger("ABA rank period end in epoch milliseconds."),
  latest1daysAds: s.nullableInteger("Advertising competitors seen in the last day."),
  latest7daysAds: s.nullableInteger("Advertising competitors seen in the last seven days."),
  latest30daysAds: s.nullableInteger("Advertising competitors seen in the last thirty days."),
  supplyDemandRatio: s.nullableNumber("Estimated search-volume-to-product ratio."),
  trafficPercentage: s.nullableNumber("Estimated share of product exposure from the keyword."),
  trafficKeywordType: s.nullableString("SellerSprite traffic-share classification."),
  conversionKeywordType: s.nullableString("SellerSprite conversion classification."),
  calculatedWeeklySearches: s.nullableNumber("Estimated weekly product exposure from the keyword."),
  impressions: s.nullableInteger("Total keyword search-result impressions."),
  clicks: s.nullableInteger("Total keyword search-result clicks."),
  naturalRatio: s.nullableNumber("Natural traffic share."),
  adRatio: s.nullableNumber("Advertising traffic share."),
  updatedTime: s.nullableInteger("Keyword update time in epoch milliseconds."),
});

const keywordStatOutputSchema = s.looseObject("High-frequency word statistic.", {
  keywords: s.nullableString("High-frequency word."),
  total: s.nullableInteger("Number of matching keywords."),
});

const reverseKeywordOptionalFields = {
  keyword: s.nonWhitespaceString("Keyword text used to filter the reverse-ASIN results."),
  month: monthSchema("Historical month in YYYYMM format; omit for the latest 30 days."),
  badges: s.array(
    "SellerSprite exposure-position types used to filter results.",
    s.nonWhitespaceString("One SellerSprite exposure-position type."),
    { minItems: 1 },
  ),
  trafficKeywordTypes: s.array(
    "SellerSprite traffic-share classifications used to filter results.",
    s.nonWhitespaceString("One SellerSprite traffic-share classification."),
    { minItems: 1 },
  ),
  conversionKeywordTypes: s.array(
    "SellerSprite conversion classifications used to filter results.",
    s.nonWhitespaceString("One SellerSprite conversion classification."),
    { minItems: 1 },
  ),
  page: pageSchema,
  size: pageSizeSchema,
  order: sortSchema,
};

const reverseKeywordInputSchema = s.actionInput(
  {
    marketplace: marketplaceSchema,
    asin: asinSchema("Amazon ASIN to reverse-search."),
    ...reverseKeywordOptionalFields,
  },
  ["marketplace", "asin"],
  "Filters for SellerSprite reverse-ASIN traffic keyword research.",
);

const reverseKeywordOutputSchema = s.object(
  "Reverse-ASIN traffic keyword results returned by SellerSprite.",
  {
    marketplace: s.string("Amazon marketplace code."),
    asin: s.string("Amazon ASIN."),
    total: s.integer("Total number of matching traffic keywords."),
    items: s.array("Traffic keywords returned on this page.", keywordOutputSchema),
    stats: s.array("High-frequency word statistics.", keywordStatOutputSchema),
  },
  {
    required: ["marketplace", "asin", "total", "items"],
    additionalProperties: true,
  },
);

export const sellerspriteActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_api_usage",
    description: "Retrieve current-month SellerSprite API usage for initialized purchased modules.",
    inputSchema: s.actionInput({}, [], "Input for retrieving SellerSprite API usage."),
    outputSchema: usageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_asin_detail",
    description:
      "Retrieve SellerSprite product, listing, category, rating, seller, and variation details for an Amazon ASIN.",
    inputSchema: s.actionInput(
      {
        marketplace: marketplaceSchema,
        asin: asinSchema("Amazon ASIN to retrieve."),
      },
      ["marketplace", "asin"],
      "Input for retrieving SellerSprite ASIN details.",
    ),
    outputSchema: asinDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_competitors",
    description: "Query SellerSprite competitor products with sales, revenue, ranking, pricing, and seller estimates.",
    inputSchema: competitorInputSchema,
    outputSchema: paginatedProductOutputSchema,
  }),
  defineProviderAction(service, {
    name: "research_products",
    description:
      "Research Amazon products in SellerSprite using product, sales, revenue, ranking, review, category, and seller filters.",
    inputSchema: productResearchInputSchema,
    outputSchema: paginatedProductOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_asin_keywords",
    description:
      "Find Amazon search traffic keywords, natural ranks, advertising ranks, and traffic estimates for an ASIN with SellerSprite.",
    inputSchema: reverseKeywordInputSchema,
    outputSchema: reverseKeywordOutputSchema,
  }),
];
