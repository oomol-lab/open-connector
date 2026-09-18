import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const literal = (description: string, value: string | number | boolean): JsonSchema =>
  s.literal(value, { description });

const url = (description: string, options: { maxLength?: number } = {}): JsonSchema =>
  s.string(description, { ...options, format: "uri" });
import { chuhaijiangActions } from "./chuhaijiang-actions.ts";
import { maidalvAction } from "./maidalv-actions.ts";
import { mercadoActions } from "./mercado-actions.ts";
import { seerfarActions } from "./seerfar-actions.ts";
import { zhihuiyaActions } from "./zhihuiya-actions.ts";

const service = "linkfox";

const amazonDomains = [
  "amazon.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.co.jp",
  "amazon.ca",
  "amazon.com.au",
  "amazon.com.br",
  "amazon.in",
  "amazon.nl",
  "amazon.se",
  "amazon.pl",
  "amazon.sg",
  "amazon.sa",
  "amazon.ae",
  "amazon.com.mx",
  "amazon.com.tr",
  "amazon.com.be",
  "amazon.cn",
  "amazon.eg",
] as const;
const amazonImageDomains = [
  "amazon.com",
  "amazon.co.uk",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.co.jp",
  "amazon.in",
] as const;
const echotikRegions = [
  "US",
  "ID",
  "TH",
  "PH",
  "MY",
  "VN",
  "GB",
  "MX",
  "SG",
  "SA",
  "BR",
  "ES",
  "JP",
  "DE",
  "IT",
  "FR",
] as const;
const fastmossSearchRegions = [
  "US",
  "GB",
  "MX",
  "ES",
  "DE",
  "IT",
  "FR",
  "ID",
  "VN",
  "MY",
  "TH",
  "PH",
  "BR",
  "JP",
  "SG",
] as const;
const amazonRegions = ["NA", "EU", "FE"] as const;

const nullableInteger = (description: string) => s.nullable(s.integer(description));
const nullableNumber = (description: string) => s.nullable(s.number(description));
const nullableString = (description: string) => s.nullable(s.string(description));
const looseItem = (description: string) => s.looseObject(description);
const optionalInteger = (description: string, minimum?: number, maximum?: number) =>
  s.optional(
    s.integer(description, {
      ...(minimum === undefined ? {} : { minimum }),
      ...(maximum === undefined ? {} : { maximum }),
    }),
  );
const optionalNumber = (description: string, minimum?: number, maximum?: number) =>
  s.optional(
    s.number(description, {
      ...(minimum === undefined ? {} : { minimum }),
      ...(maximum === undefined ? {} : { maximum }),
    }),
  );
const optionalString = (description: string, maxLength?: number) =>
  s.optional(s.string(description, maxLength === undefined ? {} : { maxLength }));
const optionalIntegerEnum = (description: string, values: readonly number[]) =>
  s.optional(
    s.anyOf(
      description,
      values.map((value) => literal(`The integer value ${value}.`, value)),
    ),
  );
const integerEnum = (description: string, values: readonly number[]) =>
  s.anyOf(
    description,
    values.map((value) => literal(`The integer value ${value}.`, value)),
  );
const dateOrDateTime = (description: string) =>
  s.anyOf(description, [s.date("A calendar date in YYYY-MM-DD format."), s.dateTime("An ISO 8601 date-time.")]);
const linkfoxDateTime = (description: string) =>
  s.string(description, { pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$" });
const pageSizeMultipleOfTen = (schema: JsonSchema) => schema;

function action<const TName extends string>(
  name: TName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
) {
  return defineProviderAction(service, { name, operationType, description, inputSchema, outputSchema });
}

const emptyInput = s.object("No input is required for this LinkFox action.", {});
const accountOutput = s.object("The normalized current LinkFox account.", {
  accountId: nullableString("The stable LinkFox account identifier when available."),
  nickname: nullableString("The LinkFox account nickname when available."),
  accountType: s.stringEnum("Whether the LinkFox account is personal or belongs to a team.", ["personal", "team"]),
  verified: s.boolean("Whether LinkFox reports the account as verified."),
});

const productListOutput = s.object("A normalized LinkFox product result page.", {
  total: nullableInteger("The total result count when LinkFox provides it."),
  products: s.array("The products returned by LinkFox.", looseItem("A provider-defined product record.")),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const amazonSearchInput = s.object("Amazon storefront search parameters accepted by LinkFox.", {
  keyword: optionalString("The localized product keyword to search for.", 1024),
  amazonDomain: s.optional(s.stringEnum("The Amazon marketplace domain.", amazonDomains)),
  node: optionalString("The optional Amazon category node.", 1000),
  language: optionalString("The Amazon locale code, such as en_US or de_DE.", 1000),
  sort: s.optional(
    s.stringEnum("The Amazon storefront sort order.", [
      "relevanceblender",
      "price-asc-rank",
      "price-desc-rank",
      "review-rank",
      "date-desc-rank",
      "exact-aware-popularity-rank",
    ]),
  ),
  page: optionalInteger("The one-based result page.", 1),
  deliveryZip: optionalString("The destination postal code used for storefront simulation.", 1000),
  device: s.optional(s.stringEnum("The storefront device profile.", ["desktop", "mobile", "tablet"])),
});

const amazonProductInput = s.object("Amazon product detail lookup parameters.", {
  asins: s.string("One to forty comma-separated uppercase Amazon ASINs.", {
    pattern: "^[A-Z0-9]+(,[A-Z0-9]+){0,39}$",
  }),
  amazonDomain: s.optional(s.stringEnum("The Amazon marketplace domain.", amazonDomains)),
  language: optionalString("The Amazon locale code, such as en_US or de_DE."),
  deliveryZip: optionalString("The destination postal code used to resolve localized prices."),
  device: s.optional(s.stringEnum("The storefront device profile.", ["desktop", "mobile", "tablet"])),
  returnBoughtTogether: s.optional(s.boolean("Whether to include frequently bought together products.")),
  returnRelatedProducts: s.optional(s.boolean("Whether to include related products.")),
  returnAuthorsReviews: s.optional(s.boolean("Whether to include author review excerpts.")),
});

const amazonImageSearchInput = s.object("Amazon reverse image search parameters.", {
  imageUrl: url("A publicly accessible source image URL.", { maxLength: 1000 }),
  amazonDomain: s.stringEnum("The Amazon marketplace domain.", amazonImageDomains),
  sort: s.optional(
    s.stringEnum("The result sort order.", [
      "default",
      "price-asc-rank",
      "price-desc-rank",
      "rating-asc-rank",
      "rating-desc-rank",
      "ratings-asc-rank",
      "ratings-desc-rank",
    ]),
  ),
  deliveryZip: optionalString("The destination postal code for in-market delivery.", 1000),
  countryOrAreaCode: optionalString("The destination country or area code for cross-border delivery.", 1000),
  aggregateByKeepaData: s.optional(s.boolean("Whether to enrich results with available Keepa metrics.")),
});

const reviewsInput = s.object("Amazon product review retrieval parameters.", {
  asin: s.nonEmptyString("The Amazon ASIN whose reviews should be retrieved."),
  domainCode: s.optional(
    s.stringEnum("The Amazon marketplace domain suffix.", [
      "com",
      "ca",
      "co.uk",
      "in",
      "de",
      "fr",
      "it",
      "es",
      "co.jp",
      "com.au",
      "com.br",
      "nl",
      "se",
      "com.mx",
      "ae",
    ]),
  ),
  star1Num: optionalInteger("The number of one-star reviews to retrieve.", 0, 100),
  star2Num: optionalInteger("The number of two-star reviews to retrieve.", 0, 100),
  star3Num: optionalInteger("The number of three-star reviews to retrieve.", 0, 100),
  star4Num: optionalInteger("The number of four-star reviews to retrieve.", 0, 100),
  star5Num: optionalInteger("The number of five-star reviews to retrieve.", 0, 100),
  filterByKeyword: optionalString("A keyword used to filter review text.", 1000),
  sortBy: s.optional(s.stringEnum("The review sort order.", ["recent", "helpful"])),
  reviewerType: s.optional(
    s.stringEnum("Whether to include all reviews or verified purchases only.", ["all_reviews", "avp_only_reviews"]),
  ),
  mediaType: s.optional(
    s.stringEnum("Whether to include all reviews or only reviews with media.", ["all_contents", "media_reviews_only"]),
  ),
  formatType: s.optional(
    s.stringEnum("Whether to include all product formats or only the current format.", [
      "all_formats",
      "current_format",
    ]),
  ),
});

const reviewsOutput = s.object("A normalized Amazon review result.", {
  total: nullableInteger("The total review count when provided."),
  reviews: s.array("The Amazon reviews returned by LinkFox.", looseItem("A provider-defined Amazon review record.")),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const abaInput = s.object("Amazon Brand Analytics natural-language query parameters.", {
  analysisDescription: s.nonEmptyString("A precise natural-language description of the requested analysis."),
  region: s.optional(
    s.stringEnum("The Amazon marketplace region code.", [
      "US",
      "DE",
      "BR",
      "CA",
      "AU",
      "JP",
      "AE",
      "ES",
      "FR",
      "IT",
      "SA",
      "TR",
      "MX",
      "SE",
      "NL",
    ]),
  ),
  createDownloadUrl: s.optional(s.boolean("Whether LinkFox should create a CSV download URL for the results.")),
});

const abaOutput = s.object("A normalized LinkFox Amazon Brand Analytics result.", {
  success: s.boolean("Whether LinkFox completed the analysis successfully."),
  tables: s.array("The analysis result tables.", looseItem("A provider-defined analysis table.")),
  total: nullableInteger("The total result count when provided."),
  downloadUrl: nullableString("The CSV download URL when requested and available."),
  message: nullableString("An informational message returned by LinkFox."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const opportunityInput = s.object("High-value Amazon opportunity filters supported by the curated LinkFox action.", {
  amazonDomain: s.optional(s.stringEnum("The supported Amazon opportunity market.", ["US"])),
  limit: optionalInteger("The maximum number of opportunity records to return.", 1, 200),
  keyword: optionalString("A keyword fragment to match."),
  nicheName: optionalString("A normalized niche name fragment to match."),
  nicheRevenue360dMinUsdAtLeastGte: optionalNumber("The minimum 360-day niche revenue floor in USD."),
  nicheRevenue360dMaxUsdAtLeastLte: optionalNumber("The maximum 360-day niche revenue ceiling in USD."),
  nichePeakSearchVolumeAtLeastGte: optionalInteger("The minimum peak monthly search volume.", 0),
  nicheSearchVolumeYoyChangePctAtLeastGte: optionalNumber(
    "The minimum year-over-year search-volume growth percentage.",
  ),
  nicheBrandCountLte: optionalInteger("The maximum active brand count.", 0),
  nicheTop5ProductClickSharePctAtLeastLte: optionalNumber(
    "The maximum top-five product click share percentage.",
    0,
    100,
  ),
  featureTop5BrandSharePctAtLeastLte: optionalNumber("The maximum top-five brand share percentage.", 0, 100),
  featureTopBrandsContains: optionalString("A case-sensitive top-brand name fragment."),
  priceMinUsdGte: optionalNumber("The minimum acceptable niche price floor in USD.", 0),
  priceMaxUsdLte: optionalNumber("The maximum acceptable niche price ceiling in USD.", 0),
  priceMidClickSharePctAtLeastLte: optionalNumber("The maximum mid-tier price click share percentage.", 0, 100),
  demoGenderDominant: s.optional(
    s.stringEnum("The dominant customer gender segment.", ["female", "male", "mixed", "unspecified"]),
  ),
  demoPrimaryIncomeTier: s.optional(
    s.stringEnum("The primary customer income tier.", [
      "low",
      "middle_low",
      "middle",
      "middle_upper",
      "upper_middle",
      "high",
    ]),
  ),
  featureEmergingTrendTagsContains: optionalString("An emerging trend tag fragment."),
  featureUncommonFeatureTagsContains: optionalString("An uncommon differentiating feature tag fragment."),
  reviewNegativeTop1Topic: optionalString("The normalized leading negative review topic."),
  reviewNegativeTop1PctAtLeastGte: optionalNumber("The minimum share for the leading negative review topic.", 0, 100),
});

const opportunityOutput = s.object("Amazon commercial opportunity records returned by LinkFox.", {
  opportunities: s.array("The matching opportunity records.", looseItem("A provider-defined opportunity record.")),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const opportunityReportInput = s.object("Amazon opportunity report parameters.", {
  site: s.stringEnum("The supported Amazon marketplace code.", ["US"]),
  keyword: s.nonEmptyString("The search keyword to analyze."),
});

const opportunityReportOutput = s.object("A generated Amazon opportunity report.", {
  report: s.string("The generated commercial insight report in Markdown."),
  costTime: nullableInteger("The report generation time in milliseconds when provided."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const dldCommonFields = {
  keyWord: optionalString("A Chinese product search keyword.", 50),
  goodsUrl: s.optional(url("A 1688 product URL to use as the search seed.")),
  productIds: optionalString("Up to twenty comma-separated 1688 product identifiers."),
  searchType: optionalIntegerEnum("The search match mode, where 1 is fuzzy and 3 is exact.", [1, 3]),
  sortType: s.optional(s.stringEnum("The result sort direction.", ["desc", "asc"])),
  pageIndex: optionalInteger("The one-based page number.", 1),
  pageSize: optionalInteger("The number of products per page.", 10, 100),
  beginPrice: optionalNumber("The minimum wholesale price.", 0),
  endPrice: optionalNumber("The maximum wholesale price.", 0),
  beginConsignPrice: optionalNumber("The minimum dropshipping price.", 0),
  endConsignPrice: optionalNumber("The maximum dropshipping price.", 0),
  beginOrderCount: optionalInteger("The minimum sales order count.", 0),
  endOrderCount: optionalInteger("The maximum sales order count.", 0),
  beginSaleCount: optionalInteger("The minimum units sold.", 0),
  endSaleCount: optionalInteger("The maximum units sold.", 0),
  companyType: optionalIntegerEnum("The supplier type, where 0 is any, 1 is shop, and 2 is factory.", [0, 1, 2]),
  offerType: optionalIntegerEnum("The 1688 offer badge filter.", [0, 2, 3, 4, 5, 6]),
};

const dldSearchInput = s.object("1688 product sourcing search parameters.", {
  ...dldCommonFields,
  cycle: s.optional(s.stringEnum("The sales statistics period in days.", ["7", "30"])),
  sortField: s.optional(
    s.stringEnum("The product search sort field.", [
      "orderCount7d",
      "saleCount7d",
      "saleVolume7d",
      "orderCount30d",
      "saleCount30d",
      "saleVolume30d",
      "offerCreateTime",
      "price",
      "consignPrice",
    ]),
  ),
});

const dldBillboardInput = s.object("1688 product billboard filters.", {
  ...dldCommonFields,
  productIds: optionalString("Up to twenty 1688 product identifiers separated by Chinese enumeration commas."),
  date: s.optional(s.date("The ranking period date.")),
  pageType: optionalIntegerEnum("The ranking period type, where 2 is weekly and 3 is monthly.", [2, 3]),
  sortField: s.optional(
    s.stringEnum("The billboard sort field.", [
      "orderCount",
      "saleCount",
      "saleVolume",
      "offerCreateTime",
      "price",
      "consignPrice",
    ]),
  ),
});

const image1688Input = s.object("1688 reverse image sourcing parameters.", {
  imageUrl: s.optional(url("A publicly accessible PNG or JPEG image URL.", { maxLength: 1000 })),
  imageId: optionalString("A LinkFox 1688 image identifier returned by a previous page."),
  page: optionalInteger("The one-based page number.", 1),
  pageSize: optionalInteger("The number of products per page.", 1, 50),
  priceStart: optionalString("The minimum price in CNY."),
  priceEnd: optionalString("The maximum price in CNY."),
  filter: optionalString("Comma-separated official 1688 filter values."),
  sort: optionalString('A JSON string such as {"price":"asc"}.'),
  keyword: optionalString("A keyword used to narrow the image-search results."),
  productCollectionId: optionalString("An official 1688 product collection identifier."),
});

const echotikSearchInput = s.object("EchoTik TikTok product search filters.", {
  keyword: optionalString("A product keyword translated to the target market language.", 1000),
  region: s.optional(s.stringEnum("The TikTok Shop market region.", echotikRegions)),
  categoryKeywordCN: optionalString("A Chinese product category keyword.", 1000),
  minTotalSaleCnt: optionalInteger("The minimum lifetime units sold.", 0),
  maxTotalSaleCnt: optionalInteger("The maximum lifetime units sold.", 0),
  minTotalSale30dCnt: optionalInteger("The minimum units sold in the last 30 days.", 0),
  maxTotalSale30dCnt: optionalInteger("The maximum units sold in the last 30 days.", 0),
  minSpuAvgPrice: optionalNumber("The minimum average SPU price.", 0),
  maxSpuAvgPrice: optionalNumber("The maximum average SPU price.", 0),
  minProductRating: optionalNumber("The minimum product rating.", 0, 5),
  maxProductRating: optionalNumber("The maximum product rating.", 0, 5),
  minReviewCount: optionalInteger("The minimum review count.", 0),
  minProductCommissionRate: optionalNumber("The minimum commission rate as a decimal.", 0, 1),
  minTotalIflCnt: optionalInteger("The minimum creator count.", 0),
  minTotalVideoCnt: optionalInteger("The minimum shoppable video count.", 0),
  productSortField: optionalInteger("The EchoTik sort field code.", 1, 7),
  sortType: optionalInteger("The sort direction, where 0 is ascending and 1 is descending.", 0, 1),
  pageNum: optionalInteger("The one-based page number.", 1),
  pageSize: optionalInteger("The number of products per page.", 1, 100),
});

const echotikDetailInput = s.object("EchoTik batch product detail identifiers.", {
  productIds: s.optional(
    s.stringArray("TikTok product identifiers.", {
      itemDescription: "A TikTok product identifier.",
      maxItems: 1000,
    }),
  ),
  productUrls: s.optional(
    s.array("TikTok Shop product URLs.", url("A TikTok Shop product URL."), {
      maxItems: 1000,
    }),
  ),
});

const rangeInput = (description: string) =>
  s.object(
    description,
    {
      min: optionalNumber("The inclusive minimum value."),
      max: optionalNumber("The inclusive maximum value."),
    },
    { optional: ["min", "max"] },
  );

const fastmossSearchInput = s.object("FastMoss TikTok product search filters.", {
  keyword: optionalString("A product title keyword."),
  region: s.optional(s.stringEnum("The TikTok Shop market region.", fastmossSearchRegions)),
  category: optionalString("An English TikTok product category name."),
  shopType: optionalInteger("The shop type, where 1 is local and 2 is cross-border.", 1, 2),
  isTopSelling: s.optional(s.boolean("Whether to return only top-selling products.")),
  isNewListed: s.optional(s.boolean("Whether to return only newly listed products.")),
  isSshop: s.optional(s.boolean("Whether to return only TikTok fully managed products.")),
  isFreeShipping: s.optional(s.boolean("Whether to return only free-shipping products.")),
  isLocalWarehouse: s.optional(s.boolean("Whether to return only locally stocked products.")),
  unitsSoldRange: s.optional(rangeInput("The inclusive product sales range.")),
  commissionRateRange: s.optional(rangeInput("The inclusive decimal commission-rate range.")),
  creatorCountRange: s.optional(rangeInput("The inclusive creator-count range.")),
  orderField: s.optional(
    s.stringEnum("The FastMoss result sort field.", [
      "day7_units_sold",
      "day7_gmv",
      "commission_rate",
      "total_units_sold",
      "total_gmv",
      "creator_count",
    ]),
  ),
  page: optionalInteger("The one-based page number.", 1),
  pageSize: optionalInteger("The number of products per page.", 1, 10),
});

const fastmossTopInput = s.object("FastMoss top-selling TikTok ranking parameters.", {
  region: s.stringEnum("The TikTok Shop market region.", ["US", "GB", "MX", "ES", "ID", "VN", "MY", "TH", "PH"]),
  dateInfo: s.object("The ranking date period.", {
    type: s.stringEnum("The ranking time granularity.", ["day", "week", "month"]),
    value: s.nonEmptyString("The date value matching the selected granularity."),
  }),
  category: optionalString("An English TikTok category name."),
  orderby: s.optional(
    s.object("The ranking sort rule.", {
      field: s.stringEnum("The ranking sort field.", [
        "units_sold",
        "gmv",
        "total_units_sold",
        "total_gmv",
        "growth_rate",
      ]),
      order: s.stringEnum("The ranking sort direction.", ["desc", "asc"]),
    }),
  ),
  page: optionalInteger("The one-based page number.", 1),
  pageSize: optionalInteger("The number of products per page.", 1, 10),
});

const kalodataRankInput = s.object("Kalodata TikTok product ranking parameters.", {
  region: optionalString("The TikTok Shop market region, such as US."),
  dateRange: optionalString("A relative range such as last7Day or last30Day."),
  currency: optionalString("The requested currency code, such as USD."),
  language: optionalString("The requested locale, such as en-US or zh-CN."),
  sortField: s.optional(s.looseObject("A Kalodata-supported sort specification.")),
  pageNumber: optionalInteger("The one-based page number.", 1, 5),
  pageSize: optionalInteger("The number of products per page.", 5, 100),
});

const kalodataDetailInput = s.object("Kalodata TikTok product detail parameters.", {
  productId: s.nonEmptyString("The TikTok product identifier as a string."),
  region: optionalString("The TikTok Shop market region, such as US."),
  dateRange: optionalString("A relative range such as last7Day or last30Day."),
  language: optionalString("The requested locale, such as en-US or zh-CN."),
  currency: optionalString("The requested currency code, such as USD."),
});

const authorizationUrlOutput = s.object("An Amazon authorization URL generated by LinkFox.", {
  authorizeUrl: url("The URL the user should open to authorize the Amazon account."),
});

const storeAuthorizationInput = s.object("Amazon Selling Partner authorization parameters.", {
  region: s.stringEnum("The Amazon Selling Partner region.", amazonRegions),
  sellerName: s.nonWhitespaceString("A display name used to identify the authorized store."),
});

const storesOutput = s.object("Amazon stores authorized through LinkFox.", {
  stores: s.array("The authorized Amazon stores.", looseItem("An authorized Amazon store record.")),
  total: s.integer("The number of authorized stores.", { minimum: 0 }),
});

const orderSearchInput = s.object("Amazon SP-API order search parameters.", {
  sellerId: s.nonEmptyString("The seller identifier returned by the LinkFox store authorization action."),
  region: s.stringEnum("The Amazon Selling Partner region.", amazonRegions),
  marketplaceIds: s.stringArray("The Amazon marketplace identifiers to search.", {
    itemDescription: "An Amazon marketplace identifier.",
    minItems: 1,
    maxItems: 50,
  }),
  createdAfter: s.optional(s.dateTime("The inclusive order creation lower bound.")),
  createdBefore: s.optional(s.dateTime("The exclusive order creation upper bound.")),
  lastUpdatedAfter: s.optional(s.dateTime("The inclusive order update lower bound.")),
  lastUpdatedBefore: s.optional(s.dateTime("The exclusive order update upper bound.")),
  fulfillmentStatuses: s.optional(
    s.stringArray("Amazon order fulfillment status filters.", {
      itemDescription: "An Amazon fulfillment status.",
    }),
  ),
  fulfilledBy: s.optional(
    s.array("The fulfillment channel filters.", s.stringEnum("An Amazon fulfillment channel.", ["MERCHANT", "AMAZON"])),
  ),
  maxResultsPerPage: optionalInteger("The maximum results per page.", 1, 100),
  paginationToken: optionalString("The pagination token returned by the previous search."),
  includedData: s.optional(
    s.stringArray("Additional Amazon Orders API data sections to include.", {
      itemDescription: "An Amazon Orders API included-data value.",
    }),
  ),
});

const orderSearchOutput = s.object("A normalized Amazon SP-API order search result.", {
  orders: s.array("The Amazon orders returned by SP-API.", looseItem("An Amazon order record.")),
  nextToken: nullableString("The pagination token for the next order page when available."),
});

const storeReportInput = s.object("Amazon Selling Partner report creation or resume parameters.", {
  sellerId: s.nonEmptyString("The authorized Amazon seller identifier."),
  region: s.stringEnum("The Amazon Selling Partner region.", amazonRegions),
  reportId: optionalString("An existing report identifier to resume instead of creating a report."),
  reportType: optionalString("The official Amazon Selling Partner report type."),
  marketplaceIds: s.optional(
    s.stringArray("The Amazon marketplace identifiers for a new report.", {
      itemDescription: "An Amazon marketplace identifier.",
      minItems: 1,
    }),
  ),
  dataStartTime: s.optional(dateOrDateTime("The optional report data start date or date-time.")),
  dataEndTime: s.optional(dateOrDateTime("The optional report data end date or date-time.")),
  lastUpdatedDate: s.optional(dateOrDateTime("The optional vendor report update date or date-time.")),
  reportOptions: s.optional(s.looseObject("Report-type-specific Amazon report options.")),
  pollIntervalSeconds: optionalInteger("Seconds between report status checks.", 0, 300),
  maxAttempts: optionalInteger("The maximum status checks within the ten-minute polling budget.", 1, 120),
});

const reportOutput = s.object("A normalized asynchronous Amazon report result.", {
  reportId: s.string("The Amazon report identifier."),
  status: s.string("The final or last observed report status."),
  downloadUrl: nullableString("The Amazon report download URL when the report is complete."),
  compressionAlgorithm: nullableString("The report compression algorithm when provided."),
  pollAttempts: s.integer("The number of report status checks performed.", { minimum: 0 }),
});

const adsAuthorizationInput = s.object("Amazon Ads authorization parameters.", {
  region: s.stringEnum("The Amazon Ads region.", amazonRegions),
  accountName: s.nonWhitespaceString("A display name used to identify the authorized Ads account."),
});

const adsProfilesInput = s.object("Amazon Ads profile listing parameters.", {
  refresh: s.optional(s.boolean("Whether LinkFox should refresh profiles from Amazon Ads.")),
});

const adsProfilesOutput = s.object("Amazon Ads profiles available through LinkFox.", {
  profiles: s.array("The available Amazon Ads profiles.", looseItem("An Amazon Ads profile record.")),
  total: s.integer("The number of returned profiles.", { minimum: 0 }),
  refreshed: s.boolean("Whether LinkFox refreshed the profiles from Amazon Ads."),
});

const includeExcludeFilter = (description: string) =>
  s.object(
    description,
    {
      include: s.optional(s.stringArray("Values to include.", { itemDescription: "An included filter value." })),
      exclude: s.optional(s.stringArray("Values to exclude.", { itemDescription: "An excluded filter value." })),
    },
    { optional: ["include", "exclude"] },
  );

const spCampaignInput = s.object("Sponsored Products campaign list parameters.", {
  profileId: s.positiveInteger("The Amazon Ads profile identifier."),
  region: s.stringEnum("The Amazon Ads region.", amazonRegions),
  campaignIdFilter: s.optional(includeExcludeFilter("Campaign identifier filters.")),
  stateFilter: s.optional(includeExcludeFilter("Campaign state filters.")),
  nameFilter: s.optional(
    s.object("Campaign name filters.", {
      queryTermMatchType: s.stringEnum("The text matching mode.", ["BROAD_MATCH", "EXACT_MATCH"]),
      include: s.stringArray("Campaign name terms to include.", {
        itemDescription: "A campaign name search term.",
        minItems: 1,
      }),
    }),
  ),
  portfolioIdFilter: s.optional(includeExcludeFilter("Portfolio identifier filters.")),
  nextToken: optionalString("The Amazon Ads next-page token."),
  maxResults: optionalInteger("The maximum campaigns per page. Defaults to 100.", 1, 100),
  fetchAll: s.optional(s.boolean("Whether to follow Amazon Ads pagination automatically. Defaults to true.")),
  maxPages: optionalInteger("The maximum pages to follow when fetchAll is true. Defaults to 50.", 1, 50),
});

const spCampaignOutput = s.object("Sponsored Products campaigns returned by Amazon Ads.", {
  campaigns: s.array("The Sponsored Products campaigns.", looseItem("A Sponsored Products campaign.")),
  total: s.integer("The number of returned campaigns.", { minimum: 0 }),
  nextToken: nullableString("The next-page token when more campaigns remain."),
});

const adsReportInput = s.object("Amazon Ads report creation or resume parameters.", {
  profileId: s.positiveInteger("The Amazon Ads profile identifier."),
  region: s.stringEnum("The Amazon Ads region.", amazonRegions),
  reportId: optionalString("An existing Amazon Ads report identifier to resume."),
  reportTypeId: optionalString("The official Amazon Ads report type identifier."),
  adProduct: s.optional(
    s.stringEnum("The Amazon Ads product for a new report.", [
      "SPONSORED_PRODUCTS",
      "SPONSORED_BRANDS",
      "SPONSORED_DISPLAY",
    ]),
  ),
  groupBy: s.optional(
    s.stringArray("The official report grouping dimensions.", {
      itemDescription: "An Amazon Ads report grouping dimension.",
      minItems: 1,
    }),
  ),
  columns: s.optional(
    s.stringArray("The official report columns to include.", {
      itemDescription: "An Amazon Ads report column.",
      minItems: 1,
    }),
  ),
  filters: s.optional(
    s.array(
      "The official Amazon Ads report filters.",
      s.object("An Amazon Ads report filter.", {
        field: s.nonEmptyString("The official Amazon Ads report filter field."),
        values: s.stringArray("The allowed values for the report filter.", {
          itemDescription: "An Amazon Ads report filter value.",
          minItems: 1,
        }),
      }),
    ),
  ),
  startDate: s.optional(s.date("The inclusive report start date.")),
  endDate: s.optional(s.date("The inclusive report end date.")),
  name: optionalString("The Amazon Ads report display name."),
  timeUnit: s.optional(s.stringEnum("The report time aggregation.", ["DAILY", "SUMMARY"])),
  format: s.optional(s.stringEnum("The Amazon Ads report format.", ["GZIP_JSON"])),
  pollIntervalSeconds: optionalInteger("Seconds between report status checks.", 0, 300),
  maxAttempts: optionalInteger("The maximum status checks within the ten-minute polling budget.", 1, 120),
});

const trademarkInput = s.object("Product text trademark-risk detection parameters.", {
  productTitle: s.string("The product title to inspect for trademark risk.", { maxLength: 1000 }),
  regions: optionalString("Comma-separated trademark jurisdiction codes."),
  limit: s.integer("The maximum number of trademark matches.", { minimum: 1, maximum: 500 }),
  productText: optionalString("Additional product copy to inspect.", 1000),
});

const complianceFields = {
  total: s.integer("The number of returned risk matches.", { minimum: 0 }),
  data: s.array("The compliance risk matches.", looseItem("A provider-defined compliance risk record.")),
  detectId: nullableString("The LinkFox detection identifier when provided."),
  columns: s.array("The LinkFox rendering column definitions.", looseItem("A column definition.")),
  type: nullableString("The LinkFox rendering type when provided."),
  riskLevel: nullableString("The overall risk level when provided."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
};

const complianceOutput = s.object("A normalized LinkFox compliance detection result.", {
  ...complianceFields,
});

const textTrademarkOutput = s.object("A normalized LinkFox text trademark detection result.", {
  ...complianceFields,
  blacklistTrademarks: s.array(
    "Blacklisted trademarks found in the inspected text.",
    looseItem("A blacklisted trademark match."),
  ),
  whitelistTrademarks: s.array(
    "Safe-listed trademarks found in the inspected text.",
    looseItem("A safe-listed trademark match."),
  ),
  textTrademarkRadar: nullableString("The text trademark risk level when provided."),
});

const graphicTrademarkOutput = s.object("A normalized LinkFox graphic trademark result.", {
  ...complianceFields,
  boundingBoxCount: nullableInteger("The number of detected graphic trademark regions."),
  radarResult: nullableString("The graphic trademark radar result when provided."),
});

const copyrightInput = s.object("Product image copyright-risk detection parameters.", {
  imageUrl: url("A publicly accessible product image URL.", { maxLength: 1000 }),
  topNumber: s.integer("The maximum number of copyright matches.", { minimum: 10, maximum: 200 }),
  enableRadar: s.boolean("Whether to enable LinkFox radar infringement analysis."),
});

const designPatentInput = s.object("Product image design-patent risk detection parameters.", {
  imageUrl: url("A publicly accessible product image URL.", { maxLength: 1000 }),
  queryMode: s.optional(s.stringEnum("The image retrieval mode.", ["physical", "line", "hybrid"])),
  topNumber: optionalInteger("The maximum number of design patent matches.", 1, 100),
  regions: optionalString("Comma-separated patent jurisdiction codes.", 1000),
  productTitle: optionalString("The product title used as additional retrieval context.", 1000),
  productDescription: optionalString("The product description used as additional retrieval context.", 1000),
  patentStatus: s.optional(s.stringEnum("Whether to include valid, expired, or all patents.", ["1", "0", "1,0"])),
  enableRadar: s.optional(s.boolean("Whether to enable AI infringement radar analysis.")),
  topLoc: optionalString("Comma-separated top-level Locarno classification codes."),
  sourceLanguage: optionalString("The source-language code for non-English product text."),
});

const imageComplianceInput = s.object("Product image policy-compliance detection parameters.", {
  imageUrl: url("A publicly accessible product image URL.", { maxLength: 1000 }),
});

const graphicTrademarkInput = s.object("Product image trademark-risk detection parameters.", {
  imageUrl: s.string("A public product image URL or base64-encoded image.", { maxLength: 1000 }),
  topNumber: s.integer("The maximum number of detected logo regions.", {
    minimum: 1,
    maximum: 100,
  }),
  productTitle: optionalString("The product title used as detection context.", 1000),
  trademarkName: optionalString("A possible logo name used to narrow the search.", 1000),
  regions: optionalString("Comma-separated trademark jurisdiction codes.", 1000),
  enableLocalizing: s.optional(s.boolean("Whether to detect and crop individual logo regions.")),
  enableRadar: s.optional(s.boolean("Whether to enable LinkFox radar infringement analysis.")),
});

const utilityPatentInput = s.object("Product utility-patent risk detection parameters.", {
  productTitle: s.string("The product title used for patent retrieval.", { maxLength: 1000 }),
  productDescription: s.string("The product description used for patent retrieval.", {
    maxLength: 1000,
  }),
  region: s.stringEnum("The target patent jurisdiction.", ["US"]),
  topNumber: s.integer("The maximum number of patent matches.", {
    minimum: 10,
    maximum: 200,
  }),
});

const ozonFilter = s.object("An Ozon numeric product filter.", {
  field: s.nonEmptyString("The snake_case metric field to filter."),
  op: s.stringEnum("The numeric comparison operator.", ["GTE", "LTE", "GT", "LT", "EQ", "NOT_EQ", "BETWEEN"]),
  value: s.number("The comparison value or lower bound."),
  value2: optionalNumber("The inclusive upper bound for BETWEEN."),
});

const ozonListFields = {
  startDate: s.optional(s.date("The first statistics date, no later than yesterday.")),
  endDate: s.optional(s.date("The last statistics date, no later than yesterday.")),
  page: optionalInteger("The one-based result page.", 1),
  pageSize: optionalInteger("The number of products per page.", 1, 100),
  sortField: optionalString("The snake_case metric field used for sorting."),
  sortDirection: s.optional(s.stringEnum("The result sort direction.", ["asc", "desc"])),
  currency: optionalString("The result currency code, such as RUB, USD, EUR, or CNY."),
  currencyRate: optionalInteger("A custom exchange rate used with a non-default currency."),
  includeFbs: s.optional(s.boolean("Whether to include fulfillment-by-seller data.")),
  filters: s.optional(s.array("Numeric product filters combined with AND.", ozonFilter)),
};

const ozonBrandProductsInput = s.object("Ozon brand product query parameters.", {
  brandName: s.nonEmptyString("The Ozon brand display name in Russian or Latin characters."),
  ...ozonListFields,
});

const ozonCategoryProductsInput = s.object("Ozon category product query parameters.", {
  categoryPath: s.nonEmptyString("The full Russian Ozon category path separated by slashes."),
  ...ozonListFields,
});

const ozonProductDetailInput = s.object("Ozon product detail query parameters.", {
  productId: s.anyOf("The Ozon product SKU.", [
    s.integer("The numeric Ozon product SKU."),
    s.nonEmptyString("The Ozon product SKU as a string."),
  ]),
  startDate: s.optional(s.date("The first statistics date, no later than yesterday.")),
  endDate: s.optional(s.date("The last statistics date, no later than yesterday.")),
  includeFbs: s.optional(s.boolean("Whether to include fulfillment-by-seller data.")),
});

const ozonProductSearchInput = s.object("Ozon product search parameters.", {
  keyword: optionalString("A Russian product search keyword."),
  productIds: s.optional(
    s.array(
      "Ozon product SKUs to retrieve.",
      s.anyOf("An Ozon product SKU.", [
        s.integer("A numeric Ozon product SKU."),
        s.nonEmptyString("An Ozon product SKU as a string."),
      ]),
      { minItems: 1 },
    ),
  ),
  startDate: s.optional(s.date("The first statistics date, no later than yesterday.")),
  endDate: s.optional(s.date("The last statistics date, no later than yesterday.")),
});

const ozonProductTrendInput = s.object("Ozon daily product trend query parameters.", {
  productId: s.integer("The Ozon product SKU."),
  startDate: s.optional(s.date("The first statistics date, no later than yesterday.")),
  endDate: s.optional(s.date("The last statistics date, no later than yesterday.")),
  includeFbs: s.optional(s.boolean("Whether to include fulfillment-by-seller data.")),
  includeSearchStats: s.optional(s.boolean("Whether to include search position and visibility statistics.")),
});

const ozonSellerProductsInput = s.object("Ozon seller product query parameters.", {
  sellerId: s.string("The numeric Ozon seller identifier.", { pattern: "^[0-9]+$" }),
  ...ozonListFields,
});

const ozonProductsOutput = s.object("A normalized LinkFox Ozon product result.", {
  total: s.integer("The number of records returned on this page.", { minimum: 0 }),
  products: s.array("The Ozon products returned by LinkFox.", looseItem("An Ozon product.")),
  failures: s.array("Ozon product lookup failures.", looseItem("An Ozon product failure.")),
  successCount: nullableInteger("The number of successful Ozon product lookups."),
  failedCount: nullableInteger("The number of failed Ozon product lookups."),
  costTime: nullableInteger("The LinkFox request duration in milliseconds."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const ozonTrendOutput = s.object("A normalized LinkFox Ozon product trend result.", {
  total: s.integer("The number of daily data points returned.", { minimum: 0 }),
  data: s.array("The daily Ozon trend data points.", looseItem("An Ozon daily trend record.")),
  costTime: nullableInteger("The LinkFox request duration in milliseconds."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const etsyCategoriesOutput = s.object("A normalized LinkFox Etsy category result.", {
  total: s.integer("The number of categories returned on this page.", { minimum: 0 }),
  categories: s.array("The matching Etsy categories.", looseItem("An Etsy category.")),
  title: nullableString("The LinkFox result title when provided."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const etsyProductOutput = s.object("A normalized LinkFox Etsy listing detail result.", {
  total: s.integer("The number of Etsy listings returned.", { minimum: 0 }),
  data: s.array("The Etsy listing details.", looseItem("An Etsy listing detail record.")),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const etsyProductsOutput = s.object("A normalized LinkFox Etsy product result.", {
  total: s.integer("The number of products returned on this page.", { minimum: 0 }),
  productNum: nullableInteger("The total number of matching Etsy products."),
  products: s.array("The matching Etsy products.", looseItem("An Etsy product.")),
  sourceTool: nullableString("The LinkFox source tool identifier."),
  sourceType: nullableString("The LinkFox source type identifier."),
  title: nullableString("The LinkFox result title when provided."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const etsyStoresOutput = s.object("A normalized LinkFox Etsy shop result.", {
  total: s.integer("The number of shops returned on this page.", { minimum: 0 }),
  storeNum: nullableInteger("The total number of matching Etsy shops."),
  stores: s.array("The matching Etsy shops.", looseItem("An Etsy shop.")),
  sourceTool: nullableString("The LinkFox source tool identifier."),
  sourceType: nullableString("The LinkFox source type identifier."),
  title: nullableString("The LinkFox result title when provided."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const etsyCategorySearchInput = s.object("Etsy category search parameters.", {
  keyword: s.string("A substring matched against category names and identifiers.", {
    minLength: 1,
    maxLength: 200,
  }),
  page: optionalInteger("The one-based result page.", 1),
  pageSize: optionalInteger("The number of categories per page.", 1, 200),
});

const etsyProductDetailInput = s.object("Etsy listing detail query parameters.", {
  productUrl: url("A public Etsy HTTPS listing URL."),
});

const etsyRangeFields = {
  beginFavorites: optionalInteger("The minimum total favorite count.", 0),
  beginFavoritesWeekly: optionalInteger("The minimum weekly favorite count.", 0),
  beginReviews: optionalInteger("The minimum total review count.", 0),
  beginReviewsWeekly: optionalInteger("The minimum weekly review count.", 0),
  beginSales: optionalInteger("The minimum total sales count.", 0),
  beginSalesWeekly: optionalInteger("The minimum weekly sales count.", 0),
  endFavorites: optionalInteger("The maximum total favorite count.", 0),
  endFavoritesWeekly: optionalInteger("The maximum weekly favorite count.", 0),
  endReviews: optionalInteger("The maximum total review count.", 0),
  endReviewsWeekly: optionalInteger("The maximum weekly review count.", 0),
  endSales: optionalInteger("The maximum total sales count.", 0),
  endSalesWeekly: optionalInteger("The maximum weekly sales count.", 0),
  category: optionalString("The Etsy category identifier.", 1000),
  country: optionalString("The shop or shipping country filter.", 1000),
  page: optionalInteger("The one-based result page.", 1),
  pageSize: optionalInteger("The number of records per page.", 1, 100),
  searchKey: optionalString("A search keyword, shop name, or Etsy URL.", 500),
  status: optionalIntegerEnum("The listing or shop status.", [0, 1]),
};

const etsyProductQueryInput = s.object("Etsy product query parameters.", {
  ...etsyRangeFields,
  beginPrice: optionalNumber("The minimum product price.", 0),
  endPrice: optionalNumber("The maximum product price.", 0),
  currencyCode: optionalString("The result currency code, defaulting to USD.", 1000),
  isBestsell: optionalIntegerEnum("Whether to return bestselling products.", [0, 1]),
  isPick: optionalIntegerEnum("Whether to return Etsy Pick products.", [0, 1]),
  isRaving: optionalIntegerEnum("Whether to return Raving products.", [0, 1]),
  listedTime: s.optional(s.date("The earliest listing date.")),
  productType: optionalString("Comma-separated Etsy product type codes.", 1000),
  sortBy: optionalInteger("The product sort field code.", 1, 6),
  sortDesc: optionalIntegerEnum("The product sort direction, where 1 is descending.", [1, 2]),
});

const etsyStoreQueryInput = s.object("Etsy shop query parameters.", {
  ...etsyRangeFields,
  beginStoreOpenedAt: s.optional(s.date("The earliest shop opening date.")),
  endStoreOpenedAt: s.optional(s.date("The latest shop opening date.")),
  isRaving: optionalIntegerEnum("Whether to return Raving shops.", [0, 1]),
  isStar: optionalIntegerEnum("Whether to return Star Seller shops.", [0, 1]),
  sortBy: optionalInteger("The shop sort field code.", 8, 11),
  sortDesc: optionalIntegerEnum("The shop sort direction, where 1 is descending.", [0, 1]),
});

const marketplaceListOutput = s.object("A normalized LinkFox result page.", {
  total: s.integer("The number of returned records.", { minimum: 0 }),
  data: s.array("The records returned by LinkFox.", looseItem("A provider-defined record.")),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const videoListOutput = s.object("A normalized EchoTik video result page.", {
  total: s.integer("The number of returned videos.", { minimum: 0 }),
  videos: s.array("The videos returned by EchoTik.", looseItem("An EchoTik video record.")),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const sellerListOutput = s.object("A normalized EchoTik seller result page.", {
  total: s.integer("The number of returned sellers.", { minimum: 0 }),
  sellers: s.array("The sellers returned by EchoTik.", looseItem("An EchoTik seller record.")),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const detailOutput = s.looseObject("The provider-defined detail record returned by LinkFox.", {
  costToken: nullableNumber("The LinkFox token cost when provided."),
});

const amazonPolicySites = [
  "US",
  "JP",
  "UK",
  "AU",
  "BE",
  "BR",
  "CA",
  "EG",
  "FR",
  "DE",
  "IN",
  "IT",
  "MX",
  "NL",
  "PL",
  "SA",
  "SG",
  "ES",
  "SE",
  "TR",
  "AE",
  "ZA",
  "IE",
] as const;
const amazonPolicyListInput = s.object("Amazon policy and compliance news query parameters.", {
  site: s.optional(s.stringEnum("The Amazon marketplace code.", amazonPolicySites)),
  publishedAtGte: s.optional(
    linkfoxDateTime("The inclusive publication-time lower bound in yyyy-MM-dd HH:mm:ss format."),
  ),
  publishedAtLte: s.optional(
    linkfoxDateTime("The inclusive publication-time upper bound in yyyy-MM-dd HH:mm:ss format."),
  ),
  page: optionalInteger("The one-based page number.", 1),
  pageSize: optionalInteger("The number of records per page.", 1, 100),
});
const amazonPolicyDetailInput = s.object("Amazon policy news detail parameters.", {
  id: s.string("The 32-character policy record identifier.", { minLength: 32, maxLength: 32 }),
});
const alexaInput = s.object("Amazon Alexa shopping assistant parameters.", {
  prompts: s.array(
    "The single shopping question to ask Alexa.",
    s.nonEmptyString("A shopping question no longer than 255 characters.", { maxLength: 255 }),
    { minItems: 1, maxItems: 1 },
  ),
  format: s.optional(s.stringEnum("The response representation.", ["markdown", "json"])),
  url: s.optional(url("A specific Amazon category, search-result, or product page URL.")),
});
const alexaOutput = s.object("A normalized Amazon Alexa shopping assistant response.", {
  report: nullableString("The Markdown answer when requested."),
  data: s.array("The structured Alexa answers when requested.", looseItem("An Alexa answer record.")),
  resultsNum: s.integer("The number of Alexa answer turns.", { minimum: 0 }),
  taskId: nullableString("The upstream task identifier when provided."),
  costTime: nullableInteger("The upstream processing time in milliseconds."),
  costToken: nullableNumber("The LinkFox token cost when provided."),
});
const product1688DetailInput = s.object("1688 product detail parameters.", {
  offerId: s.string("The positive decimal 1688 offer identifier.", {
    pattern: "^[1-9][0-9]*$",
    maxLength: 1000,
  }),
  country: optionalString("The upstream-compatible language or country field."),
  currency: s.optional(
    s.string("The three-letter currency code used for converted prices.", {
      pattern: "^[A-Za-z]{3}$",
    }),
  ),
});
const ebayDomains = [
  "ebay.com",
  "ebay.co.uk",
  "ebay.de",
  "ebay.fr",
  "ebay.it",
  "ebay.es",
  "ebay.ca",
  "ebay.com.au",
  "ebay.nl",
  "ebay.at",
  "ebay.ch",
  "ebay.pl",
  "ebay.ie",
  "ebay.com.hk",
  "ebay.com.my",
  "ebay.com.sg",
] as const;
const ebaySearchInput = s.object("eBay product search parameters.", {
  keyword: optionalString("The product keyword to search for.", 1024),
  ebayDomain: s.optional(s.stringEnum("The eBay marketplace domain.", ebayDomains)),
  page: optionalInteger("The one-based result page.", 1),
  pageSize: optionalIntegerEnum("The number of results per page.", [25, 50, 100, 200]),
  orderBy: s.optional(
    s.stringEnum("The eBay result sort code.", ["1", "2", "3", "7", "10", "12", "15", "16", "18", "19"]),
  ),
  priceMin: optionalNumber("The minimum item price.", 0),
  priceMax: optionalNumber("The maximum item price.", 0),
  itemCondition: optionalString("Pipe-separated eBay item condition codes."),
  buyingFormat: s.optional(s.stringEnum("The listing purchase format.", ["Auction", "BIN", "BO"])),
  showOnly: optionalString("Comma-separated eBay result filters."),
  location: optionalInteger("The item location country or area code."),
  prefLoc: s.optional(s.stringEnum("The preferred location scope.", ["1", "2", "3"])),
  zipCode: optionalString("The delivery ZIP or postal code."),
  categoryId: optionalInteger("The eBay category identifier."),
  noCache: s.optional(s.boolean("Whether to bypass LinkFox caches.")),
});
const echotikBatchVideoInput = s.object("EchoTik batch video detail parameters.", {
  videoIds: s.optional(
    s.stringArray("TikTok video identifiers.", {
      itemDescription: "A TikTok video identifier.",
      maxItems: 1000,
    }),
  ),
  videoUrls: s.optional(s.array("TikTok video URLs.", url("A TikTok video URL."), { maxItems: 1000 })),
});
const echotikDownloadInput = s.object("EchoTik video download parameters.", {
  url: url("A TikTok short or full video URL.", { maxLength: 1000 }),
});
const echotikNewProductsInput = s.object("EchoTik new-product ranking parameters.", {
  date: s.date("The ranking date."),
  region: s.optional(s.stringEnum("The TikTok Shop region.", echotikRegions)),
  pageNum: optionalInteger("The one-based page number.", 1),
  pageSize: optionalInteger("The number of products per page.", 1),
});
const echotikSellerSearchInput = pageSizeMultipleOfTen(
  s.object("EchoTik seller search parameters.", {
    region: s.stringEnum("The TikTok Shop region.", echotikRegions),
    categoryId: optionalString("The first-level seller category identifier.", 1000),
    categoryL2Id: optionalString("The second-level seller category identifier.", 1000),
    categoryL3Id: optionalString("The third-level seller category identifier.", 1000),
    minTotalSaleGmv30dAmt: optionalNumber("The minimum 30-day GMV."),
    maxTotalSaleGmv30dAmt: optionalNumber("The maximum 30-day GMV."),
    salesTrendFlag: optionalIntegerEnum("The seven-day sales trend code.", [0, 1, 2]),
    fromFlag: optionalIntegerEnum("Whether sellers are local or cross-border.", [1, 2]),
    salesFlag: optionalIntegerEnum("The seller's primary sales channel.", [1, 2]),
    minFirstCrawlDt: optionalInteger("The earliest estimated listing date in yyyyMMdd format."),
    maxFirstCrawlDt: optionalInteger("The latest estimated listing date in yyyyMMdd format."),
    sellerSortField: optionalIntegerEnum("The seller sort field.", [1, 2, 3]),
    sortType: optionalIntegerEnum("The result sort direction.", [0, 1]),
    pageNum: optionalInteger("The one-based page number.", 1),
    pageSize: optionalInteger("The number of sellers per page, in multiples of ten.", 10, 100),
  }),
);
const echotikSellerProductsInput = pageSizeMultipleOfTen(
  s.object("EchoTik seller product query parameters.", {
    sellerId: s.nonEmptyString("The TikTok Shop seller identifier.", { maxLength: 1000 }),
    sellerProductSortField: optionalIntegerEnum("The product sort field.", [1, 2, 3, 4, 5]),
    sortType: optionalIntegerEnum("The result sort direction.", [0, 1]),
    pageNum: optionalInteger("The one-based page number.", 1),
    pageSize: optionalInteger("The number of products per page, in multiples of ten.", 10, 100),
  }),
);
const echotikVideoSearchInput = pageSizeMultipleOfTen(
  s.object("EchoTik video search parameters.", {
    region: s.stringEnum("The TikTok region.", echotikRegions),
    userId: optionalString("The creator identifier.", 1000),
    productId: optionalString("The associated product identifier.", 1000),
    productCategoryId: optionalString("The associated product category identifier.", 1000),
    minTotalViewsCnt: optionalInteger("The minimum view count.", 0),
    maxTotalViewsCnt: optionalInteger("The maximum view count.", 0),
    minDuration: optionalInteger("The minimum video duration in seconds.", 0),
    maxDuration: optionalInteger("The maximum video duration in seconds.", 0),
    minCreateTime: optionalInteger("The earliest creation time as a Unix timestamp.", 0),
    maxCreateTime: optionalInteger("The latest creation time as a Unix timestamp.", 0),
    salesFlag: optionalIntegerEnum("Whether the video promotes products.", [0, 1]),
    isAd: optionalIntegerEnum("Whether the video is an advertisement.", [0, 1]),
    createdByAi: s.optional(s.stringEnum("Whether the video was created by AI.", ["true", "false"])),
    videoSortField: optionalIntegerEnum("The video sort field.", [1, 2, 3]),
    sortType: optionalIntegerEnum("The result sort direction.", [0, 1]),
    pageNum: optionalInteger("The one-based page number.", 1),
    pageSize: optionalInteger("The number of videos per page, in multiples of ten.", 10, 100),
  }),
);
const echotikVideoRankingInput = pageSizeMultipleOfTen(
  s.object("EchoTik video ranking parameters.", {
    date: s.date("The ranking date."),
    rankType: integerEnum("The daily, weekly, or monthly ranking type.", [1, 2, 3]),
    region: s.stringEnum("The TikTok region.", echotikRegions),
    videoRankField: integerEnum("The video ranking metric.", [1, 2]),
    productCategoryId: optionalString("The associated first-level product category identifier."),
    createdByAi: s.optional(s.stringEnum("Whether the video was created by AI.", ["true", "false"])),
    pageNum: optionalInteger("The one-based page number.", 1),
    pageSize: optionalInteger("The number of videos per page, in multiples of ten.", 10, 100),
  }),
);
const echotikProductVideosInput = pageSizeMultipleOfTen(
  s.object("EchoTik product video query parameters.", {
    productId: s.nonEmptyString("The TikTok Shop product identifier.", { maxLength: 1000 }),
    userId: optionalString("The creator identifier used to filter videos.", 1000),
    productVideoSortField: optionalIntegerEnum("The product video sort field.", [1, 2, 3, 4, 5, 6]),
    sortType: optionalIntegerEnum("The result sort direction.", [0, 1]),
    minCreateTime: optionalInteger("The earliest creation time as a Unix timestamp.", 0),
    maxCreateTime: optionalInteger("The latest creation time as a Unix timestamp.", 0),
    pageNum: optionalInteger("The one-based page number.", 1),
    pageSize: optionalInteger("The number of videos per page, in multiples of ten.", 10, 100),
  }),
);
const echotikSellerDetailInput = s.object("EchoTik seller detail parameters.", {
  sellerId: s.nonEmptyString("The TikTok Shop seller identifier.", { maxLength: 1000 }),
});
const tiktokShopProductInput = s.object("TikTok Shop product detail parameters.", {
  productInput: s.nonEmptyString("A 19-digit product identifier or supported TikTok product URL."),
  region: s.optional(
    s.stringEnum("The TikTok Shop region.", ["US", "GB", "ID", "MY", "TH", "VN", "PH", "SG", "DE", "FR", "IT", "ES"]),
  ),
});

export const linkfoxActions: ProviderActionDefinition[] = [
  ...mercadoActions,
  ...zhihuiyaActions,
  ...chuhaijiangActions,
  ...seerfarActions,
  maidalvAction,
  action(
    "get_current_account",
    "read",
    "Get the current LinkFox account without exposing personal contact data.",
    emptyInput,
    accountOutput,
  ),
  action(
    "search_amazon_products",
    "read",
    "Search Amazon storefront products through LinkFox.",
    amazonSearchInput,
    productListOutput,
  ),
  action(
    "get_amazon_product",
    "read",
    "Get detailed Amazon product data for up to forty ASINs through LinkFox.",
    amazonProductInput,
    productListOutput,
  ),
  action(
    "search_amazon_by_image",
    "read",
    "Find visually similar Amazon products through LinkFox.",
    amazonImageSearchInput,
    productListOutput,
  ),
  action(
    "list_amazon_product_reviews",
    "read",
    "Retrieve Amazon product reviews through LinkFox.",
    reviewsInput,
    reviewsOutput,
  ),
  action(
    "query_amazon_aba",
    "read",
    "Run a natural-language Amazon Brand Analytics query through LinkFox.",
    abaInput,
    abaOutput,
  ),
  action(
    "search_amazon_opportunities",
    "read",
    "Screen Amazon commercial opportunities with LinkFox market metrics.",
    opportunityInput,
    opportunityOutput,
  ),
  action(
    "get_amazon_opportunity_report",
    "read",
    "Generate a LinkFox Amazon commercial opportunity report for a keyword.",
    opportunityReportInput,
    opportunityReportOutput,
  ),
  action(
    "list_amazon_policy_updates",
    "read",
    "List recent Amazon policy, regulation, compliance, and marketplace news through LinkFox.",
    amazonPolicyListInput,
    marketplaceListOutput,
  ),
  action(
    "get_amazon_policy_update",
    "read",
    "Get the full content of an Amazon policy or compliance news record through LinkFox.",
    amazonPolicyDetailInput,
    detailOutput,
  ),
  action(
    "ask_amazon_alexa",
    "read",
    "Ask the Amazon Alexa shopping assistant a product discovery question through LinkFox.",
    alexaInput,
    alexaOutput,
  ),
  action(
    "search_1688_products",
    "read",
    "Search the LinkFox 1688 sourcing database.",
    dldSearchInput,
    productListOutput,
  ),
  action(
    "list_1688_hot_products",
    "read",
    "List high-performing 1688 products from LinkFox rankings.",
    dldBillboardInput,
    productListOutput,
  ),
  action(
    "search_1688_by_image",
    "read",
    "Find visually similar 1688 products through LinkFox.",
    image1688Input,
    productListOutput,
  ),
  action(
    "get_1688_product",
    "read",
    "Get public product, SKU, price, inventory, media, shipping, and supplier details from 1688 through LinkFox.",
    product1688DetailInput,
    detailOutput,
  ),
  action(
    "search_ebay_products",
    "read",
    "Search public eBay listings through LinkFox.",
    ebaySearchInput,
    productListOutput,
  ),
  action(
    "search_echotik_products",
    "read",
    "Search EchoTik TikTok products through LinkFox.",
    echotikSearchInput,
    productListOutput,
  ),
  action(
    "get_echotik_products",
    "read",
    "Get EchoTik details for a batch of TikTok products through LinkFox.",
    echotikDetailInput,
    productListOutput,
  ),
  action(
    "get_echotik_videos",
    "read",
    "Get EchoTik details for a batch of TikTok videos through LinkFox.",
    echotikBatchVideoInput,
    videoListOutput,
  ),
  action(
    "get_echotik_video_download",
    "read",
    "Get available playback and download URLs for a TikTok video through LinkFox and EchoTik.",
    echotikDownloadInput,
    detailOutput,
  ),
  action(
    "list_echotik_new_products",
    "read",
    "List newly ranked TikTok Shop products from EchoTik through LinkFox.",
    echotikNewProductsInput,
    productListOutput,
  ),
  action(
    "search_echotik_sellers",
    "read",
    "Search TikTok Shop sellers with EchoTik analytics through LinkFox.",
    echotikSellerSearchInput,
    sellerListOutput,
  ),
  action(
    "list_echotik_seller_products",
    "read",
    "List products belonging to a TikTok Shop seller through LinkFox and EchoTik.",
    echotikSellerProductsInput,
    productListOutput,
  ),
  action(
    "search_echotik_videos",
    "read",
    "Search TikTok videos with EchoTik analytics through LinkFox.",
    echotikVideoSearchInput,
    videoListOutput,
  ),
  action(
    "list_echotik_video_rankings",
    "read",
    "List daily, weekly, or monthly TikTok video rankings through LinkFox and EchoTik.",
    echotikVideoRankingInput,
    videoListOutput,
  ),
  action(
    "list_echotik_product_videos",
    "read",
    "List TikTok videos associated with a product through LinkFox and EchoTik.",
    echotikProductVideosInput,
    videoListOutput,
  ),
  action(
    "get_echotik_seller",
    "read",
    "Get detailed public analytics for a TikTok Shop seller through LinkFox and EchoTik.",
    echotikSellerDetailInput,
    detailOutput,
  ),
  action(
    "get_tiktok_shop_product",
    "read",
    "Get public details for one TikTok Shop product through LinkFox.",
    tiktokShopProductInput,
    marketplaceListOutput,
  ),
  action(
    "search_fastmoss_products",
    "read",
    "Search FastMoss TikTok products through LinkFox.",
    fastmossSearchInput,
    productListOutput,
  ),
  action(
    "list_fastmoss_top_selling_products",
    "read",
    "List top-selling TikTok products from FastMoss through LinkFox.",
    fastmossTopInput,
    productListOutput,
  ),
  action(
    "list_kalodata_products",
    "read",
    "Browse Kalodata TikTok product rankings through LinkFox.",
    kalodataRankInput,
    productListOutput,
  ),
  action(
    "get_kalodata_product",
    "read",
    "Get Kalodata details for a TikTok product through LinkFox.",
    kalodataDetailInput,
    productListOutput,
  ),
  action(
    "get_amazon_store_authorization_url",
    "read",
    "Create an Amazon Selling Partner authorization URL through LinkFox.",
    storeAuthorizationInput,
    authorizationUrlOutput,
  ),
  action(
    "list_authorized_amazon_stores",
    "read",
    "List Amazon stores authorized through LinkFox.",
    emptyInput,
    storesOutput,
  ),
  action(
    "search_amazon_store_orders",
    "read",
    "Search orders for an authorized Amazon store through LinkFox.",
    orderSearchInput,
    orderSearchOutput,
  ),
  action(
    "get_amazon_store_report",
    "write",
    "Create or resume an Amazon Selling Partner report and wait for a download URL.",
    storeReportInput,
    reportOutput,
  ),
  action(
    "get_amazon_ads_authorization_url",
    "read",
    "Create an Amazon Ads authorization URL through LinkFox.",
    adsAuthorizationInput,
    authorizationUrlOutput,
  ),
  action(
    "list_authorized_amazon_ads_accounts",
    "read",
    "List Amazon Ads accounts authorized through LinkFox.",
    emptyInput,
    storesOutput,
  ),
  action(
    "list_amazon_ads_profiles",
    "read",
    "List or refresh Amazon Ads profiles through LinkFox.",
    adsProfilesInput,
    adsProfilesOutput,
  ),
  action(
    "list_sp_campaigns",
    "read",
    "List Sponsored Products campaigns through the LinkFox Amazon Ads gateway.",
    spCampaignInput,
    spCampaignOutput,
  ),
  action(
    "get_amazon_ads_report",
    "write",
    "Create or resume an Amazon Ads report and wait for a download URL.",
    adsReportInput,
    reportOutput,
  ),
  action(
    "check_text_trademark_risk",
    "read",
    "Check product text for trademark risk through LinkFox and Ruiguan.",
    trademarkInput,
    textTrademarkOutput,
  ),
  action(
    "check_copyright_risk",
    "read",
    "Check a product image for copyright risk through LinkFox and Ruiguan.",
    copyrightInput,
    complianceOutput,
  ),
  action(
    "check_design_patent_risk",
    "read",
    "Check a product image for design-patent risk through LinkFox and Ruiguan.",
    designPatentInput,
    complianceOutput,
  ),
  action(
    "check_image_policy_compliance",
    "read",
    "Check a product image against policy-violating product imagery through LinkFox and Ruiguan.",
    imageComplianceInput,
    complianceOutput,
  ),
  action(
    "check_graphic_trademark_risk",
    "read",
    "Check a product image for graphic trademark risk through LinkFox and Ruiguan.",
    graphicTrademarkInput,
    graphicTrademarkOutput,
  ),
  action(
    "check_utility_patent_risk",
    "read",
    "Check product text for utility and invention patent risk through LinkFox and Ruiguan.",
    utilityPatentInput,
    complianceOutput,
  ),
  action(
    "list_ozon_brand_products",
    "read",
    "List Ozon products for a brand through LinkFox and MPSTATS.",
    ozonBrandProductsInput,
    ozonProductsOutput,
  ),
  action(
    "list_ozon_category_products",
    "read",
    "List Ozon products in a category through LinkFox and MPSTATS.",
    ozonCategoryProductsInput,
    ozonProductsOutput,
  ),
  action(
    "get_ozon_product",
    "read",
    "Get analytics for one Ozon product through LinkFox and MPSTATS.",
    ozonProductDetailInput,
    ozonProductsOutput,
  ),
  action(
    "search_ozon_products",
    "read",
    "Search Ozon products by keyword or SKU through LinkFox and MPSTATS.",
    ozonProductSearchInput,
    ozonProductsOutput,
  ),
  action(
    "get_ozon_product_trend",
    "read",
    "Get daily analytics trends for one Ozon product through LinkFox and MPSTATS.",
    ozonProductTrendInput,
    ozonTrendOutput,
  ),
  action(
    "list_ozon_seller_products",
    "read",
    "List Ozon products for a seller through LinkFox and MPSTATS.",
    ozonSellerProductsInput,
    ozonProductsOutput,
  ),
  action(
    "search_etsy_categories",
    "read",
    "Search synchronized Etsy categories through LinkFox.",
    etsyCategorySearchInput,
    etsyCategoriesOutput,
  ),
  action(
    "get_etsy_product",
    "read",
    "Get current public details for one Etsy listing through LinkFox.",
    etsyProductDetailInput,
    etsyProductOutput,
  ),
  action(
    "search_etsy_products",
    "read",
    "Search Etsy products using commercial and listing filters through LinkFox.",
    etsyProductQueryInput,
    etsyProductsOutput,
  ),
  action(
    "search_etsy_stores",
    "read",
    "Search Etsy shops using commercial and profile filters through LinkFox.",
    etsyStoreQueryInput,
    etsyStoresOutput,
  ),
];
