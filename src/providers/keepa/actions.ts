import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { keepaDealAttributeNames } from "./deal-attributes.ts";

const service = "keepa" as const;

export const keepaMarketplaces = ["US", "GB", "DE", "FR", "JP", "CA", "IT", "ES", "IN", "MX", "BR"] as const;
const keepaStandardMarketplaces = keepaMarketplaces.filter((marketplace) => marketplace !== "BR");

export const keepaHistoryTypes = [
  "AMAZON",
  "NEW",
  "USED",
  "SALES",
  "LISTPRICE",
  "COLLECTIBLE",
  "REFURBISHED",
  "NEW_FBM_SHIPPING",
  "LIGHTNING_DEAL",
  "WAREHOUSE",
  "NEW_FBA",
  "COUNT_NEW",
  "COUNT_USED",
  "COUNT_REFURBISHED",
  "COUNT_COLLECTIBLE",
  "EXTRA_INFO_UPDATES",
  "RATING",
  "COUNT_REVIEWS",
  "BUY_BOX_SHIPPING",
  "USED_NEW_SHIPPING",
  "USED_VERY_GOOD_SHIPPING",
  "USED_GOOD_SHIPPING",
  "USED_ACCEPTABLE_SHIPPING",
  "COLLECTIBLE_NEW_SHIPPING",
  "COLLECTIBLE_VERY_GOOD_SHIPPING",
  "COLLECTIBLE_GOOD_SHIPPING",
  "COLLECTIBLE_ACCEPTABLE_SHIPPING",
  "REFURBISHED_SHIPPING",
  "EBAY_NEW_SHIPPING",
  "EBAY_USED_SHIPPING",
  "TRADE_IN",
  "RENT",
  "BUY_BOX_USED_SHIPPING",
  "PRIME_EXCL",
  "COUNT_NEW_FBA",
  "COUNT_NEW_FBM",
] as const;

export const keepaDealPriceTypes = [
  "AMAZON",
  "NEW",
  "USED",
  "SALES",
  "COLLECTIBLE",
  "REFURBISHED",
  "NEW_FBM_SHIPPING",
  "LIGHTNING_DEAL",
  "WAREHOUSE",
  "NEW_FBA",
  "BUY_BOX_SHIPPING",
  "USED_NEW_SHIPPING",
  "USED_VERY_GOOD_SHIPPING",
  "USED_GOOD_SHIPPING",
  "USED_ACCEPTABLE_SHIPPING",
  "REFURBISHED_SHIPPING",
  "BUY_BOX_USED_SHIPPING",
  "PRIME_EXCL",
] as const;

const marketplaceSchema = s.stringEnum(
  "Amazon marketplace code using Keepa's official AmazonLocale names.",
  keepaMarketplaces,
);
const standardMarketplaceSchema = s.stringEnum(
  "Amazon marketplace supported by this Keepa endpoint (Brazil is unavailable).",
  keepaStandardMarketplaces,
);

const asinSchema = s.string("A 10-character Amazon ASIN.", {
  minLength: 10,
  maxLength: 10,
  pattern: "^[A-Za-z0-9]{10}$",
});

const asinsSchema = s.array("Amazon ASINs to request.", asinSchema, {
  minItems: 1,
  maxItems: 100,
});
const codesSchema = s.array(
  "UPC, EAN, GTIN, or ISBN-13 codes; keep leading zeroes.",
  s.string("One numeric product code, kept as a string.", { pattern: "^[0-9]{8,14}$" }),
  { minItems: 1, maxItems: 100 },
);

const statsRangeSchema = s.requiredObject("UTC statistics interval.", {
  start: s.anyOf("Interval start, as ISO 8601 UTC text or Unix milliseconds.", [
    s.dateTime("ISO 8601 UTC start time."),
    s.nonNegativeInteger("Unix milliseconds at interval start."),
  ]),
  end: s.anyOf("Interval end, as ISO 8601 UTC text or Unix milliseconds.", [
    s.dateTime("ISO 8601 UTC end time."),
    s.nonNegativeInteger("Unix milliseconds at interval end."),
  ]),
});

const windowInputFields = {
  offset: s.nonNegativeInteger("Zero-based offset into this response's full upstream list."),
  limit: s.nullable(s.positiveInteger("Maximum entries returned; null returns all remaining entries.")),
};

const windowOutputFields = {
  totalAvailable: s.nonNegativeInteger("Number of entries in this upstream response."),
  returnedCount: s.nonNegativeInteger("Number of entries in this response window."),
  hasMore: s.boolean("Whether this upstream response contains more entries after the window."),
  nextOffset: s.nullable(s.nonNegativeInteger("Next local offset, when more entries exist.")),
};

const productRequestOptionalFields = {
  codes: codesSchema,
  codeLimit: s.positiveInteger("Maximum products returned for each product code."),
  statsDays: s.positiveInteger("Number of recent days used for Keepa summary statistics at no additional token cost."),
  statsRange: statsRangeSchema,
  updateHours: s.integer("Refresh when older than these hours; zero forces refresh and -1 disables refresh.", {
    minimum: -1,
  }),
  offers: s.integer(
    "Number of marketplace offers to include; values from 20 through 100 may increase token cost and limit the request to 20 ASINs.",
    {
      minimum: 20,
      maximum: 100,
    },
  ),
  onlyLiveOffers: s.boolean("Whether to omit historical offers when offers are requested, reducing response size."),
  includeBuyBox: s.boolean(
    "Whether to include Keepa buy box data; this may consume two additional tokens per product when offers are not requested.",
  ),
  includeRating: s.boolean("Whether to include existing rating and review-count history in the product payload."),
  includeVideos: s.boolean("Whether to include existing product video metadata."),
  includeAPlus: s.boolean("Whether to include existing A+ content."),
  includeStock: s.boolean("Whether to include stock history with requested offers; may cost extra tokens."),
  includeHistoricalVariations: s.boolean(
    "Whether to include historical and out-of-stock variations; may cost extra tokens.",
  ),
};

const responseMetaSchema = s.requiredObject("Keepa request and token-budget metadata.", {
  timestamp: s.nullable(s.integer("Keepa server response time in Unix epoch milliseconds.")),
  tokensLeft: s.nullable(s.integer("Tokens remaining after this request.")),
  refillInMs: s.nullable(s.integer("Milliseconds until Keepa next refills tokens.")),
  refillRatePerMinute: s.nullable(s.integer("Number of Keepa tokens refilled per minute.")),
  tokensConsumed: s.nullable(s.integer("Tokens consumed by this request.")),
  processingTimeMs: s.nullable(s.integer("Server-side processing time in milliseconds.")),
});

const nullableStringSchema = (description: string) => s.nullable(s.string(description));
const nullableIntegerSchema = (description: string) => s.nullable(s.integer(description));

const namedIntegerValuesSchema = s.record(
  "Values keyed by official Keepa Product.CsvType name.",
  s.nullable(
    s.integer(
      "A Keepa price, rank, count, rating, or metadata value; price values use the marketplace's smallest currency unit.",
    ),
  ),
);

const namedBooleanValuesSchema = s.record(
  "Boolean values keyed by official Keepa Product.CsvType name.",
  s.boolean("A Keepa statistic flag."),
);

const productStatsSchema = s.requiredObject("Named Keepa product statistics.", {
  current: namedIntegerValuesSchema,
  average: namedIntegerValuesSchema,
  average30Days: namedIntegerValuesSchema,
  average90Days: namedIntegerValuesSchema,
  average180Days: namedIntegerValuesSchema,
  average365Days: namedIntegerValuesSchema,
  atIntervalStart: namedIntegerValuesSchema,
  isLowestEver: namedBooleanValuesSchema,
  isLowest90Days: namedBooleanValuesSchema,
  raw: s.looseObject("The complete Keepa stats object."),
});

const productSnapshotSchema = s.requiredObject("A normalized Keepa product snapshot.", {
  asin: s.string("Amazon ASIN."),
  domainId: nullableIntegerSchema("Keepa Amazon locale identifier."),
  title: nullableStringSchema("Amazon product title."),
  brand: nullableStringSchema("Product brand."),
  manufacturer: nullableStringSchema("Product manufacturer."),
  productGroup: nullableStringSchema("Amazon product group."),
  parentAsin: nullableStringSchema("Parent ASIN when this product is a variation."),
  rootCategory: nullableIntegerSchema("Root Amazon category node identifier."),
  categories: s.array(
    "Amazon category node identifiers assigned to the product.",
    s.integer("One Amazon category node identifier."),
  ),
  imageUrls: s.array(
    "Resolved Amazon image URLs derived from Keepa image metadata.",
    s.string("One Amazon media image URL."),
  ),
  monthlySold: nullableIntegerSchema("Estimated monthly sold count when available."),
  lastUpdate: nullableIntegerSchema("Last product update in Keepa Time minutes."),
  stats: s.nullable(productStatsSchema),
  raw: s.looseObject("The complete Keepa product object."),
});

const productSnapshotOutputSchema = s.requiredObject("Keepa product snapshot response.", {
  marketplace: marketplaceSchema,
  priceValuesUseMinorUnits: s.literal(true, {
    description: "Whether price integers remain in the marketplace's smallest currency unit.",
  }),
  products: s.array("Products returned by Keepa.", productSnapshotSchema),
  meta: responseMetaSchema,
});

const historyPointSchema = s.requiredObject("One normalized Keepa history data point.", {
  keepaTime: s.integer("Original Keepa Time value in minutes."),
  timestamp: s.dateTime("UTC timestamp converted from Keepa Time."),
  value: s.integer(
    "History value; price values use the marketplace's smallest currency unit and -1 represents no offer.",
  ),
  shipping: s.nullable(
    s.integer(
      "Shipping amount in the marketplace's smallest currency unit when this history type records it separately.",
    ),
  ),
});

const historySeriesSchema = s.requiredObject("One named Keepa product history series.", {
  type: s.stringEnum("Official Keepa Product.CsvType name.", keepaHistoryTypes),
  index: s.integer("Official Keepa Product.CsvType array index."),
  unit: s.stringEnum("Unit interpretation for values in this series; lower sales-rank values indicate better rank.", [
    "minor_currency_unit",
    "sales_rank",
    "count",
    "rating_tenths",
    "metadata",
  ]),
  includesShipping: s.boolean("Whether each raw point contains a separate shipping value after the main value."),
  points: s.array("Chronological history points.", historyPointSchema),
});

const monthlySoldHistoryPointSchema = s.requiredObject("One historical Amazon bought-in-past-month value.", {
  keepaTime: s.integer("Original Keepa Time value in minutes."),
  timestamp: s.dateTime("UTC timestamp converted from Keepa Time."),
  value: s.integer("Amazon's bought-in-past-month value observed by Keepa; this is not a sales estimate."),
});

const couponHistoryPointSchema = s.requiredObject("One historical Keepa coupon observation.", {
  keepaTime: s.integer("Original Keepa Time value in minutes."),
  timestamp: s.dateTime("UTC timestamp converted from Keepa Time."),
  oneTimeCoupon: s.integer(
    "One-time coupon discount: zero means unavailable, positive values use the marketplace's smallest currency unit, and negative values are percentage discounts.",
  ),
  subscribeAndSaveCoupon: s.integer(
    "Subscribe-and-Save coupon discount: zero means unavailable, positive values use the marketplace's smallest currency unit, and negative values are percentage discounts.",
  ),
});

const salesRankHistorySchema = s.requiredObject("One Amazon subcategory sales-rank history.", {
  categoryId: s.integer("Amazon subcategory node ID."),
  points: s.array(
    "Chronological sales-rank observations; lower values indicate better rank.",
    s.requiredObject("One historical sales-rank observation.", {
      keepaTime: s.integer("Original Keepa Time value in minutes."),
      timestamp: s.dateTime("UTC timestamp converted from Keepa Time."),
      value: s.integer("Amazon sales rank; lower values indicate better rank."),
    }),
  ),
});

const productHistorySchema = s.requiredObject("Normalized Keepa history for one product.", {
  asin: s.string("Amazon ASIN."),
  title: nullableStringSchema("Amazon product title."),
  brand: nullableStringSchema("Product brand."),
  series: s.array("Named Keepa history series.", historySeriesSchema),
  monthlySoldHistory: s.array(
    "Historical Amazon bought-in-past-month values returned by Keepa.",
    monthlySoldHistoryPointSchema,
  ),
  couponHistory: s.array("Historical coupon observations returned by Keepa.", couponHistoryPointSchema),
  salesRankHistory: s.array("Sales-rank histories grouped by Amazon subcategory.", salesRankHistorySchema),
  raw: s.looseObject("The complete Keepa product object including raw history arrays."),
});

const productHistoryOutputSchema = s.requiredObject("Keepa product history response.", {
  marketplace: marketplaceSchema,
  priceValuesUseMinorUnits: s.literal(true, {
    description: "Whether price integers remain in the marketplace's smallest currency unit.",
  }),
  products: s.array("Products and normalized histories returned by Keepa.", productHistorySchema),
  meta: responseMetaSchema,
});

const productFinderSortSchema = s.array(
  "Product Finder sort rules in priority order.",
  s.tuple(
    [
      s.nonEmptyString("Official Product Finder field name used for sorting."),
      s.stringEnum("Sort direction.", ["asc", "desc"]),
    ],
    { description: "One official Keepa Product Finder sort rule." },
  ),
  { minItems: 1 },
);

const productFinderFiltersSchema = s.looseObject(
  "Official Keepa ProductFinderRequest fields. Unknown official fields are preserved for forward compatibility.",
  {
    title: s.nonEmptyString("Case-insensitive product title search text."),
    brand: s.stringArray("Brands to include.", {
      minItems: 1,
      itemDescription: "One brand name.",
    }),
    manufacturer: s.stringArray("Manufacturers to include.", {
      minItems: 1,
      itemDescription: "One manufacturer name.",
    }),
    categories_include: s.array("Amazon category node IDs to include.", s.integer("One category node ID."), {
      minItems: 1,
    }),
    categories_exclude: s.array("Amazon category node IDs to exclude.", s.integer("One category node ID."), {
      minItems: 1,
    }),
    buyBoxSellerId: s.stringArray("Buy Box seller IDs to include.", {
      minItems: 1,
      itemDescription: "One Amazon seller ID.",
    }),
    current_AMAZON_gte: s.integer("Minimum current Amazon price in the marketplace's smallest currency unit."),
    current_AMAZON_lte: s.integer("Maximum current Amazon price in the marketplace's smallest currency unit."),
    current_NEW_gte: s.integer("Minimum current Marketplace New price in the marketplace's smallest currency unit."),
    current_NEW_lte: s.integer("Maximum current Marketplace New price in the marketplace's smallest currency unit."),
    current_BUY_BOX_SHIPPING_gte: s.integer(
      "Minimum current New Buy Box price including shipping in the marketplace's smallest currency unit.",
    ),
    current_BUY_BOX_SHIPPING_lte: s.integer(
      "Maximum current New Buy Box price including shipping in the marketplace's smallest currency unit.",
    ),
    current_SALES_gte: s.integer("Minimum current sales rank."),
    current_SALES_lte: s.integer("Maximum current sales rank."),
    current_RATING_gte: s.integer("Minimum product rating multiplied by 10.", {
      minimum: 0,
      maximum: 50,
    }),
    current_RATING_lte: s.integer("Maximum product rating multiplied by 10.", {
      minimum: 0,
      maximum: 50,
    }),
    current_COUNT_REVIEWS_gte: s.nonNegativeInteger("Minimum current review count."),
    current_COUNT_REVIEWS_lte: s.nonNegativeInteger("Maximum current review count."),
    monthlySold_gte: s.nonNegativeInteger("Minimum estimated monthly sold count."),
    monthlySold_lte: s.nonNegativeInteger("Maximum estimated monthly sold count."),
    totalOfferCount_gte: s.nonNegativeInteger("Minimum total offer count."),
    totalOfferCount_lte: s.nonNegativeInteger("Maximum total offer count."),
    hasReviews: s.boolean("Whether products must have review data."),
    isLowest_AMAZON: s.boolean("Whether the current Amazon price must be the lowest value since tracking began."),
    isLowest_NEW: s.boolean("Whether the current Marketplace New price must be the lowest value since tracking began."),
    isPrimeExclusive: s.boolean("Whether to include only Prime Exclusive products."),
    hasAPlus: s.boolean("Whether products must include A+ content."),
    hasMainVideo: s.boolean("Whether products must include a main video."),
    sort: productFinderSortSchema,
    page: s.nonNegativeInteger("Zero-based Product Finder result page."),
    perPage: s.integer("Number of ASINs requested per Product Finder page, from 50 to 10000.", {
      minimum: 50,
      maximum: 10_000,
    }),
  },
);

const categorySchema = s.looseObject("One category object returned by Keepa.", {
  catId: nullableIntegerSchema("Amazon category node identifier."),
  domainId: nullableIntegerSchema("Keepa Amazon locale identifier."),
  name: nullableStringSchema("Amazon category name."),
  parent: nullableIntegerSchema("Parent category node identifier."),
  children: s.nullable(s.array("Child category node identifiers.", s.integer("One child category node identifier."))),
  productCount: nullableIntegerSchema("Estimated product count."),
  sellerCount: nullableIntegerSchema("Estimated distinct seller count."),
});

const dealRangeSchema = s.tuple(
  [
    s.integer("Range lower bound."),
    s.integer("Range upper bound; some Keepa ranges accept -1 as an open upper bound."),
  ],
  { description: "Inclusive two-value range." },
);

const getTokenStatusAction = defineProviderAction(service, {
  name: "get_token_status",
  operationType: "read",
  description: "Retrieve Keepa token availability and refill information without consuming tokens.",
  requiredScopes: [],
  inputSchema: s.requiredObject("Input for retrieving Keepa token status.", {}),
  outputSchema: s.requiredObject("Current Keepa token status.", {
    meta: responseMetaSchema,
  }),
});

const getProductSnapshotAction = defineProviderAction(service, {
  name: "get_product_snapshot",
  operationType: "read",
  description: "Retrieve current Keepa product metadata and named statistics for one or more Amazon ASINs.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for retrieving Keepa product snapshots.",
    {
      marketplace: marketplaceSchema,
      asins: asinsSchema,
      ...productRequestOptionalFields,
    },
    {
      optional: ["asins", ...Object.keys(productRequestOptionalFields)],
    },
  ),
  outputSchema: productSnapshotOutputSchema,
});

const getProductHistoryAction = defineProviderAction(service, {
  name: "get_product_history",
  operationType: "read",
  description:
    "Retrieve named Keepa price, rank, offer-count, rating, review, monthly-sales, and coupon history for Amazon ASINs.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for retrieving Keepa product history.",
    {
      marketplace: marketplaceSchema,
      asins: asinsSchema,
      days: s.positiveInteger("Limit all returned history to the most recent number of 24-hour periods."),
      historyTypes: s.array(
        "Keepa CSV history series to include in `series`; this does not suppress monthlySoldHistory, couponHistory, or salesRankHistory when Keepa returns them.",
        s.stringEnum("One official Keepa Product.CsvType name.", keepaHistoryTypes),
        { minItems: 1 },
      ),
      ...productRequestOptionalFields,
    },
    {
      optional: ["asins", "days", "historyTypes", ...Object.keys(productRequestOptionalFields)],
    },
  ),
  outputSchema: productHistoryOutputSchema,
});

const findProductsAction = defineProviderAction(service, {
  name: "find_products",
  operationType: "read",
  description: "Find Amazon ASINs with Keepa Product Finder filters using official ProductFinderRequest field names.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for finding products in the Keepa catalog.",
    {
      marketplace: marketplaceSchema,
      filters: productFinderFiltersSchema,
      includeSearchInsights: s.boolean("Include charged, query-wide Search Insights statistics."),
    },
    { optional: ["includeSearchInsights"] },
  ),
  outputSchema: s.requiredObject("Keepa Product Finder results.", {
    marketplace: marketplaceSchema,
    asins: s.array("Matching Amazon ASINs.", s.string("One Amazon ASIN.")),
    totalResults: s.nullable(s.integer("Estimated total number of matching products.")),
    searchInsights: s.nullable(s.looseObject("Query-wide Search Insights returned when requested.")),
    meta: responseMetaSchema,
  }),
});

const searchCategoriesAction = defineProviderAction(service, {
  name: "search_categories",
  operationType: "read",
  description: "Search Keepa Amazon categories by name so category IDs can be used in product and best-seller queries.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for searching Keepa categories.",
    {
      marketplace: standardMarketplaceSchema,
      term: s.nonEmptyString("Space-separated category keywords; each keyword must contain at least three characters."),
      includeParents: s.boolean("Whether Keepa should include the parent tree for each category."),
    },
    { optional: ["includeParents"] },
  ),
  outputSchema: s.requiredObject("Keepa category search results.", {
    marketplace: standardMarketplaceSchema,
    categories: s.array("Matching categories.", categorySchema),
    categoryParents: s.array("Parent categories returned when requested.", categorySchema),
    meta: responseMetaSchema,
  }),
});

const getBestSellersAction = defineProviderAction(service, {
  name: "get_best_sellers",
  operationType: "read",
  description: "Retrieve Keepa's ordered Amazon best-seller ASIN list for a category node or website display group.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for retrieving Keepa best sellers.",
    {
      marketplace: standardMarketplaceSchema,
      category: s.anyOf("Amazon category node ID or Keepa website display group name.", [
        s.nonNegativeInteger("Amazon category node ID."),
        s.nonEmptyString("Keepa website display group name."),
      ]),
      range: s.anyOf("Sales-rank averaging interval: 0, 30, 90 or 180 days.", [
        s.literal(0, { description: "Current rank." }),
        s.literal(30, { description: "30-day average rank." }),
        s.literal(90, { description: "90-day average rank." }),
        s.literal(180, { description: "180-day average rank." }),
      ]),
      month: s.integer("Historical month from 1 to 12; requires year.", {
        minimum: 1,
        maximum: 12,
      }),
      year: s.integer("Four-digit year for a historical month; requires month."),
      variations: s.boolean("Return all variations instead of one representative."),
      sublist: s.boolean("Use subcategory rank instead of primary rank."),
      ...windowInputFields,
    },
    { optional: ["range", "month", "year", "variations", "sublist", "offset", "limit"] },
  ),
  outputSchema: s.requiredObject("Keepa best-seller results.", {
    marketplace: standardMarketplaceSchema,
    categoryId: s.nullable(s.integer("Amazon category node ID resolved by Keepa.")),
    lastUpdate: s.nullable(s.integer("Best-seller list update time in Keepa Time minutes.")),
    asins: s.array(
      "Ordered Amazon ASINs, starting with the product having the lowest sales rank.",
      s.string("One Amazon ASIN."),
    ),
    ...windowOutputFields,
    raw: s.looseObject("Keepa bestSellersList metadata without the full ASIN list."),
    meta: responseMetaSchema,
  }),
});

const findDealsAction = defineProviderAction(service, {
  name: "find_deals",
  operationType: "read",
  description: "Find recently changed Amazon products with Keepa deal filters and bounded pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for finding Keepa deals.",
    {
      marketplace: standardMarketplaceSchema,
      priceType: s.stringEnum("Keepa price or rank type whose change defines the deal.", keepaDealPriceTypes),
      page: s.nonNegativeInteger("Zero-based deal result page; each page contains at most 150 deals."),
      dateRange: s.integer("Change interval: 0 for one day, 1 for one week, 2 for one month, or 3 for 90 days.", {
        minimum: 0,
        maximum: 3,
      }),
      includeCategories: s.array("Amazon category node IDs to include.", s.integer("One category node ID."), {
        minItems: 1,
      }),
      excludeCategories: s.array("Amazon category node IDs to exclude.", s.integer("One category node ID."), {
        minItems: 1,
      }),
      currentRange: dealRangeSchema,
      deltaRange: dealRangeSchema,
      deltaPercentRange: dealRangeSchema,
      salesRankRange: dealRangeSchema,
      deltaLastRange: dealRangeSchema,
      titleSearch: s.nonEmptyString("Case-insensitive title keywords that must all appear in the product title."),
      minimumRating: s.integer("Minimum product rating multiplied by 10.", {
        minimum: 0,
        maximum: 50,
      }),
      sortBy: s.stringEnum("Deal result sorting rule.", ["newest", "absolute_delta", "sales_rank", "percentage_delta"]),
      invertSort: s.boolean("Whether to invert Keepa's default sort direction; newest cannot be inverted."),
      isLowestEver: s.boolean("Whether the selected price must be the lowest value since tracking began."),
      isLowest90Days: s.boolean("Whether the selected price must be the lowest value in the past 90 days."),
      isLowestOffer: s.boolean("Whether the selected price must be the lowest of all New offers."),
      isBackInStock: s.boolean("Whether to include only products that returned to stock in the past 24 hours."),
      isOutOfStock: s.boolean("Whether to include only products that went out of stock in the past 24 hours."),
      hasReviews: s.boolean("Whether to exclude products without reviews."),
      isPrimeExclusive: s.boolean("Whether to include only Prime Exclusive products."),
      mustHaveAmazonOffer: s.boolean("Whether products must have an offer sold and fulfilled by Amazon."),
      mustNotHaveAmazonOffer: s.boolean("Whether products must not have an offer sold and fulfilled by Amazon."),
      isHighest: s.boolean("Whether the selected value must be the highest since tracking began."),
      singleVariation: s.boolean("Return one randomly chosen variation per matching family."),
      isRisers: s.boolean("Include only products whose price rose in the selected interval."),
      filterErotic: s.boolean("Exclude adult items when true."),
      warehouseConditions: s.array("Amazon Warehouse condition codes.", s.integer("One condition code.")),
      ...Object.fromEntries(
        keepaDealAttributeNames.map((name) => [
          name,
          s.stringArray(`Values for the official ${name} deal attribute filter.`, {
            itemDescription: `One ${name} value.`,
          }),
        ]),
      ),
    },
    {
      optional: [
        "page",
        "dateRange",
        "includeCategories",
        "excludeCategories",
        "currentRange",
        "deltaRange",
        "deltaPercentRange",
        "salesRankRange",
        "deltaLastRange",
        "titleSearch",
        "minimumRating",
        "sortBy",
        "invertSort",
        "isLowestEver",
        "isLowest90Days",
        "isLowestOffer",
        "isBackInStock",
        "isOutOfStock",
        "hasReviews",
        "isPrimeExclusive",
        "mustHaveAmazonOffer",
        "mustNotHaveAmazonOffer",
        "isHighest",
        "singleVariation",
        "isRisers",
        "filterErotic",
        "warehouseConditions",
        ...keepaDealAttributeNames,
      ],
    },
  ),
  outputSchema: s.requiredObject("Keepa deal search results.", {
    marketplace: standardMarketplaceSchema,
    deals: s.array(
      "Deal records returned by Keepa.",
      s.looseObject("One Keepa deal record.", {
        asin: nullableStringSchema("Amazon ASIN."),
        title: nullableStringSchema("Amazon product title."),
      }),
    ),
    categoryIds: s.array("Root category IDs represented in the results.", s.integer("One root category ID.")),
    categoryNames: s.array("Root category names represented in the results.", s.string("One root category name.")),
    categoryCount: s.array(
      "Deal counts aligned with categoryIds and categoryNames.",
      s.integer("Deal count for one root category."),
    ),
    raw: s.looseObject("The complete Keepa deals response object."),
    meta: responseMetaSchema,
  }),
});

const getSellerSnapshotAction = defineProviderAction(service, {
  name: "get_seller_snapshot",
  operationType: "read",
  description:
    "Retrieve compact Keepa marketplace seller profiles, ratings, category statistics, brands, and competitors.",
  requiredScopes: [],
  inputSchema: s.requiredObject("Input for retrieving Keepa seller snapshots.", {
    marketplace: standardMarketplaceSchema,
    sellerIds: s.array("Amazon marketplace seller IDs.", s.nonEmptyString("One Amazon seller ID."), {
      minItems: 1,
      maxItems: 100,
    }),
  }),
  outputSchema: s.requiredObject("Keepa seller snapshot results.", {
    marketplace: standardMarketplaceSchema,
    sellers: s.array(
      "Seller profiles returned by Keepa.",
      s.looseObject("One normalized Keepa seller profile.", {
        sellerId: s.string("Amazon seller ID."),
        sellerName: nullableStringSchema("Amazon seller display name."),
        currentRating: nullableIntegerSchema("Current seller rating percentage."),
        ratingCount: s.nullable(
          s.array(
            "Rating counts for the last 30, 90, and 365 days and lifetime.",
            s.integer("One seller rating count."),
          ),
        ),
        hasFba: s.nullable(s.boolean("Whether Keepa has observed current FBA listings.")),
        shipsFromChina: s.nullable(s.boolean("Whether Keepa identifies the seller as shipping from China.")),
        raw: s.looseObject("The complete Keepa seller object."),
      }),
    ),
    meta: responseMetaSchema,
  }),
});

const lightningStateSchema = s.stringEnum("Official Keepa lightning deal state.", [
  "AVAILABLE",
  "WAITLIST",
  "SOLDOUT",
  "WAITLISTFULL",
  "EXPIRED",
  "SUPPRESSED",
]);

const sellerFinderFiltersSchema = s.looseObject(
  "Official Seller Finder selection fields; other official filters are preserved.",
  {
    search: s.nonEmptyString("Text query for seller discovery."),
    sellerName: s.nonEmptyString("Seller display name to match."),
    businessName: s.nonEmptyString("Registered business name to match."),
    addressCountry: s.stringArray("Seller business country codes.", {
      itemDescription: "One country code.",
    }),
    currentRating_gte: s.integer("Minimum current seller rating percentage."),
    currentRatingCount_gte: s.integer("Minimum current seller rating count."),
    totalStorefrontAsins_gte: s.integer("Minimum observed storefront ASIN count."),
    brands: s.stringArray("Brands sold by the merchant.", { itemDescription: "One brand." }),
    rootCategories_include: s.array("Root category IDs to include.", s.integer("One root category ID.")),
    competitorSellerIds: s.stringArray("Seller IDs whose listing competitors should be found.", {
      itemDescription: "One seller ID.",
    }),
    page: s.nonNegativeInteger("Zero-based seller result page."),
    perPage: s.anyOf("Seller IDs per page; zero means 100, otherwise from 50 to 10000.", [
      s.literal(0, { description: "Use Keepa's 100-seller page shortcut." }),
      s.integer("Seller IDs requested per page.", { minimum: 50, maximum: 10_000 }),
    ]),
    sort: s.array(
      "Up to three seller sort rules.",
      s.tuple(
        [
          s.nonEmptyString("Official Seller Finder field name."),
          s.stringEnum("Ascending or descending order.", ["asc", "desc"]),
        ],
        { description: "One seller sort rule." },
      ),
      { maxItems: 3 },
    ),
  },
);

const searchProductsAction = defineProviderAction(service, {
  name: "search_products",
  operationType: "read",
  description: "Search Amazon products by keyword in Amazon result order, without fetching more details.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for Keepa keyword product search.",
    {
      marketplace: standardMarketplaceSchema,
      term: s.nonEmptyString("Amazon product search terms."),
      asinsOnly: s.boolean("Return only ordered ASINs instead of product objects."),
      statsDays: s.positiveInteger("Recent days for free product statistics."),
      statsRange: statsRangeSchema,
      updateHours: s.integer("Refresh threshold in hours; zero can cost extra tokens.", {
        minimum: 0,
      }),
      includeHistory: s.boolean("Include available product price history."),
      includeRating: s.boolean("Include existing rating and review history, possibly at extra cost."),
    },
    {
      optional: ["asinsOnly", "statsDays", "statsRange", "updateHours", "includeHistory", "includeRating"],
    },
  ),
  outputSchema: s.requiredObject("Ordered Keepa keyword search results.", {
    marketplace: standardMarketplaceSchema,
    asins: s.array("Ordered matching ASINs.", s.string("One ASIN.")),
    products: s.array("Product objects when ASIN-only mode is disabled.", productSnapshotSchema),
    meta: responseMetaSchema,
  }),
});

const lookupCategoriesAction = defineProviderAction(service, {
  name: "lookup_categories",
  operationType: "read",
  description: "Look up up to ten Amazon category IDs and optionally their parent tree; ID zero lists roots.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for Keepa category lookup.",
    {
      marketplace: standardMarketplaceSchema,
      categoryIds: s.array("Category IDs, or a sole zero to list roots.", s.nonNegativeInteger("One category ID."), {
        minItems: 1,
        maxItems: 10,
      }),
      includeParents: s.boolean("Include parent categories up to the root."),
    },
    { optional: ["includeParents"] },
  ),
  outputSchema: s.requiredObject("Keepa category lookup results.", {
    marketplace: standardMarketplaceSchema,
    categories: s.array("Matched categories.", categorySchema),
    categoryParents: s.array("Parent categories when requested.", categorySchema),
    meta: responseMetaSchema,
  }),
});

const findSellersAction = defineProviderAction(service, {
  name: "find_sellers",
  operationType: "read",
  description: "Find seller IDs by official Seller Finder criteria without fetching seller profiles.",
  requiredScopes: [],
  inputSchema: s.requiredObject("Input for Keepa Seller Finder.", {
    marketplace: standardMarketplaceSchema,
    filters: sellerFinderFiltersSchema,
  }),
  outputSchema: s.requiredObject("Keepa Seller Finder results.", {
    marketplace: standardMarketplaceSchema,
    sellerIds: s.array("Ordered seller IDs in this upstream result page.", s.string("One seller ID.")),
    totalResults: s.nullable(s.integer("Total sellers matched across pages.")),
    meta: responseMetaSchema,
  }),
});

const getMostRatedSellersAction = defineProviderAction(service, {
  name: "get_most_rated_sellers",
  operationType: "read",
  description:
    "Get seller IDs ordered by rating count, with a local result window; each window fetches and pays for the full upstream list.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for most rated sellers.",
    {
      marketplace: standardMarketplaceSchema,
      ...windowInputFields,
    },
    { optional: ["offset", "limit"] },
  ),
  outputSchema: s.requiredObject("Most rated sellers result window.", {
    marketplace: standardMarketplaceSchema,
    sellerIds: s.array("Seller IDs ordered by rating count.", s.string("One seller ID.")),
    ...windowOutputFields,
    meta: responseMetaSchema,
  }),
});

const getSellerStorefrontAction = defineProviderAction(service, {
  name: "get_seller_storefront",
  operationType: "read",
  description:
    "Inspect one seller's observed storefront ASINs and aligned last-seen times; the list can be incomplete.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for one seller storefront.",
    {
      marketplace: standardMarketplaceSchema,
      sellerId: s.nonEmptyString("One Amazon seller ID that does not contain commas.", { pattern: "^[^,]+$" }),
      ...windowInputFields,
    },
    { optional: ["offset", "limit"] },
  ),
  outputSchema: s.requiredObject("Observed seller storefront window.", {
    marketplace: standardMarketplaceSchema,
    seller: s.nullable(s.looseObject("Seller profile without full storefront arrays.")),
    items: s.array(
      "Observed ASIN and last-seen pairs.",
      s.requiredObject("One storefront listing observation.", {
        asin: s.string("Amazon ASIN."),
        lastSeen: s.nullable(s.integer("Last observed Keepa Time minute.")),
      }),
    ),
    ...windowOutputFields,
    meta: responseMetaSchema,
  }),
});

const getLightningDealAction = defineProviderAction(service, {
  name: "get_lightning_deal",
  operationType: "read",
  description: "Get lightning deals for a required ASIN, avoiding the costly full-list request.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for one product's lightning deal.",
    {
      marketplace: standardMarketplaceSchema,
      asin: asinSchema,
      state: lightningStateSchema,
    },
    { optional: ["state"] },
  ),
  outputSchema: s.requiredObject("Lightning deals for one ASIN.", {
    marketplace: standardMarketplaceSchema,
    lightningDeals: s.array("Lightning deal objects.", s.looseObject("One upstream lightning deal.")),
    meta: responseMetaSchema,
  }),
});

const listLightningDealsAction = defineProviderAction(service, {
  name: "list_lightning_deals",
  operationType: "read",
  description:
    "List lightning deals with a local result window; Keepa charges 500 tokens for each full upstream request, regardless of window size.",
  requiredScopes: [],
  inputSchema: s.object(
    "Input for the full Keepa lightning deal list.",
    {
      marketplace: standardMarketplaceSchema,
      state: lightningStateSchema,
      ...windowInputFields,
    },
    { optional: ["state", "offset", "limit"] },
  ),
  outputSchema: s.requiredObject("Lightning deal result window.", {
    marketplace: standardMarketplaceSchema,
    lightningDeals: s.array("Lightning deals in this local window.", s.looseObject("One upstream lightning deal.")),
    ...windowOutputFields,
    meta: responseMetaSchema,
  }),
});

export const keepaActions: ActionDefinition[] = [
  getTokenStatusAction,
  getProductSnapshotAction,
  getProductHistoryAction,
  findProductsAction,
  searchCategoriesAction,
  getBestSellersAction,
  findDealsAction,
  getSellerSnapshotAction,
  searchProductsAction,
  lookupCategoriesAction,
  findSellersAction,
  getMostRatedSellersAction,
  getSellerStorefrontAction,
  getLightningDealAction,
  listLightningDealsAction,
] satisfies ActionDefinition[];
