import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "keepa";

export const keepaMarketplaces = ["US", "GB", "DE", "FR", "JP", "CA", "IT", "ES", "IN", "MX", "BR"] as const;

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
  "USED_NEW_SHIPPING",
  "USED_VERY_GOOD_SHIPPING",
  "USED_GOOD_SHIPPING",
  "USED_ACCEPTABLE_SHIPPING",
  "COLLECTIBLE_NEW_SHIPPING",
  "COLLECTIBLE_VERY_GOOD_SHIPPING",
  "COLLECTIBLE_GOOD_SHIPPING",
  "COLLECTIBLE_ACCEPTABLE_SHIPPING",
  "REFURBISHED_SHIPPING",
  "BUY_BOX_USED_SHIPPING",
  "PRIME_EXCL",
] as const;

const marketplaceSchema = s.stringEnum(
  "Amazon marketplace code using Keepa's official AmazonLocale names.",
  keepaMarketplaces,
);

const asinSchema = s.stringPattern("^[A-Za-z0-9]{10}$", {
  description: "A 10-character Amazon ASIN containing only ASCII letters or digits.",
});

const asinsSchema = s.array("Amazon ASINs to request.", asinSchema, {
  minItems: 1,
  maxItems: 100,
});

const productRequestOptionalFields: Record<string, JsonSchema> = {
  statsDays: s.positiveInteger("Number of recent days used for Keepa summary statistics at no additional token cost."),
  updateHours: s.nonNegativeInteger(
    "Refresh data when Keepa's stored product data is older than this many hours; zero may consume an extra token per product.",
  ),
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
};

const responseMetaSchema = s.object("Keepa request and token-budget metadata.", {
  timestamp: s.nullableInteger("Keepa server response time in Unix epoch milliseconds."),
  tokensLeft: s.nullableInteger("Tokens remaining after this request."),
  refillInMs: s.nullableInteger("Milliseconds until Keepa next refills tokens."),
  refillRatePerMinute: s.nullableInteger("Number of Keepa tokens refilled per minute."),
  tokensConsumed: s.nullableInteger("Tokens consumed by this request."),
  processingTimeMs: s.nullableInteger("Server-side processing time in milliseconds."),
});

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

const productStatsSchema = s.object("Named Keepa product statistics.", {
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

const productSnapshotSchema = s.object("A normalized Keepa product snapshot.", {
  asin: s.string("Amazon ASIN."),
  domainId: s.nullableInteger("Keepa Amazon locale identifier."),
  title: s.nullableString("Amazon product title."),
  brand: s.nullableString("Product brand."),
  manufacturer: s.nullableString("Product manufacturer."),
  productGroup: s.nullableString("Amazon product group."),
  parentAsin: s.nullableString("Parent ASIN when this product is a variation."),
  rootCategory: s.nullableInteger("Root Amazon category node identifier."),
  categories: s.array(
    "Amazon category node identifiers assigned to the product.",
    s.integer("One Amazon category node identifier."),
  ),
  imageUrls: s.array(
    "Resolved Amazon image URLs derived from Keepa image metadata.",
    s.string("One Amazon media image URL."),
  ),
  monthlySold: s.nullableInteger("Estimated monthly sold count when available."),
  lastUpdate: s.nullableInteger("Last product update in Keepa Time minutes."),
  stats: s.nullable(productStatsSchema),
  raw: s.looseObject("The complete Keepa product object."),
});

const productSnapshotOutputSchema = s.actionOutput(
  {
    marketplace: marketplaceSchema,
    priceValuesUseMinorUnits: s.literal(true, {
      description: "Whether price integers remain in the marketplace's smallest currency unit.",
    }),
    products: s.array("Products returned by Keepa.", productSnapshotSchema),
    meta: responseMetaSchema,
  },
  "Keepa product snapshot response.",
);

const historyPointSchema = s.object("One normalized Keepa history data point.", {
  keepaTime: s.integer("Original Keepa Time value in minutes."),
  timestamp: s.dateTime("UTC timestamp converted from Keepa Time."),
  value: s.integer(
    "History value; price values use the marketplace's smallest currency unit and -1 represents no offer.",
  ),
  shipping: s.nullableInteger(
    "Shipping amount in the marketplace's smallest currency unit when this history type records it separately.",
  ),
});

const historySeriesSchema = s.object("One named Keepa product history series.", {
  type: s.stringEnum("Official Keepa Product.CsvType name.", keepaHistoryTypes),
  index: s.integer("Official Keepa Product.CsvType array index."),
  unit: s.stringEnum("Unit interpretation for values in this series.", [
    "minor_currency_unit",
    "sales_rank",
    "count",
    "rating_tenths",
    "metadata",
  ]),
  includesShipping: s.boolean("Whether each raw point contains a separate shipping value after the main value."),
  points: s.array("Chronological history points.", historyPointSchema),
});

const productHistorySchema = s.object("Normalized Keepa history for one product.", {
  asin: s.string("Amazon ASIN."),
  title: s.nullableString("Amazon product title."),
  brand: s.nullableString("Product brand."),
  series: s.array("Named Keepa history series.", historySeriesSchema),
  raw: s.looseObject("The complete Keepa product object including raw history arrays."),
});

const productHistoryOutputSchema = s.actionOutput(
  {
    marketplace: marketplaceSchema,
    priceValuesUseMinorUnits: s.literal(true, {
      description: "Whether price integers remain in the marketplace's smallest currency unit.",
    }),
    products: s.array("Products and normalized histories returned by Keepa.", productHistorySchema),
    meta: responseMetaSchema,
  },
  "Keepa product history response.",
);

const productFinderSortRuleSchema: JsonSchema = {
  type: "array",
  prefixItems: [
    s.nonEmptyString("Official Product Finder field name used for sorting."),
    s.stringEnum("Sort direction.", ["asc", "desc"]),
  ],
  items: false,
  minItems: 2,
  maxItems: 2,
  description: "One official Keepa Product Finder sort rule.",
};

const productFinderSortSchema = s.array("Product Finder sort rules in priority order.", productFinderSortRuleSchema, {
  minItems: 1,
});

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
    perPage: s.integer("Number of ASINs requested per Product Finder page.", {
      minimum: 1,
    }),
  },
);

const categorySchema = s.looseObject("One category object returned by Keepa.", {
  catId: s.nullableInteger("Amazon category node identifier."),
  domainId: s.nullableInteger("Keepa Amazon locale identifier."),
  name: s.nullableString("Amazon category name."),
  parent: s.nullableInteger("Parent category node identifier."),
  children: s.nullable(s.array("Child category node identifiers.", s.integer("One child category node identifier."))),
  productCount: s.nullableInteger("Estimated product count."),
  sellerCount: s.nullableInteger("Estimated distinct seller count."),
});

const dealRangeSchema: JsonSchema = {
  type: "array",
  prefixItems: [
    s.integer("Range lower bound."),
    s.integer("Range upper bound; some Keepa ranges accept -1 as an open upper bound."),
  ],
  items: false,
  minItems: 2,
  maxItems: 2,
  description: "Inclusive two-value range.",
};

const getTokenStatusAction = defineProviderAction(service, {
  name: "get_token_status",
  description: "Retrieve Keepa token availability and refill information without consuming tokens.",
  requiredScopes: [],
  inputSchema: s.actionInput({}, [], "Input for retrieving Keepa token status."),
  outputSchema: s.actionOutput(
    {
      meta: responseMetaSchema,
    },
    "Current Keepa token status.",
  ),
});

const getProductSnapshotAction = defineProviderAction(service, {
  name: "get_product_snapshot",
  description: "Retrieve current Keepa product metadata and named statistics for one or more Amazon ASINs.",
  requiredScopes: [],
  inputSchema: withProductRequestRules(
    s.actionInput(
      {
        marketplace: marketplaceSchema,
        asins: asinsSchema,
        ...productRequestOptionalFields,
      },
      ["marketplace", "asins"],
      "Input for retrieving Keepa product snapshots.",
    ),
  ),
  outputSchema: productSnapshotOutputSchema,
});

const getProductHistoryAction = defineProviderAction(service, {
  name: "get_product_history",
  description:
    "Retrieve named, timestamped Keepa price, rank, offer-count, rating, and review history for Amazon ASINs.",
  requiredScopes: [],
  inputSchema: withProductRequestRules(
    s.actionInput(
      {
        marketplace: marketplaceSchema,
        asins: asinsSchema,
        days: s.positiveInteger("Limit all returned history to the most recent number of 24-hour periods."),
        historyTypes: s.array(
          "Keepa history series to include in the normalized output.",
          s.stringEnum("One official Keepa Product.CsvType name.", keepaHistoryTypes),
          { minItems: 1 },
        ),
        ...productRequestOptionalFields,
      },
      ["marketplace", "asins"],
      "Input for retrieving Keepa product history.",
    ),
  ),
  outputSchema: productHistoryOutputSchema,
});

const findProductsAction = defineProviderAction(service, {
  name: "find_products",
  description: "Find Amazon ASINs with Keepa Product Finder filters using official ProductFinderRequest field names.",
  requiredScopes: [],
  inputSchema: s.actionInput(
    {
      marketplace: marketplaceSchema,
      filters: productFinderFiltersSchema,
    },
    ["marketplace", "filters"],
    "Input for finding products in the Keepa catalog.",
  ),
  outputSchema: s.actionOutput(
    {
      marketplace: marketplaceSchema,
      asins: s.array("Matching Amazon ASINs.", s.string("One Amazon ASIN.")),
      totalResults: s.nullableInteger("Estimated total number of matching products."),
      meta: responseMetaSchema,
    },
    "Keepa Product Finder results.",
  ),
});

const searchCategoriesAction = defineProviderAction(service, {
  name: "search_categories",
  description: "Search Keepa Amazon categories by name so category IDs can be used in product and best-seller queries.",
  requiredScopes: [],
  inputSchema: s.actionInput(
    {
      marketplace: marketplaceSchema,
      term: s.nonEmptyString("Space-separated category keywords; each keyword must contain at least three characters."),
      includeParents: s.boolean("Whether Keepa should include the parent tree for each category."),
    },
    ["marketplace", "term"],
    "Input for searching Keepa categories.",
  ),
  outputSchema: s.actionOutput(
    {
      marketplace: marketplaceSchema,
      categories: s.array("Matching categories.", categorySchema),
      categoryParents: s.array("Parent categories returned when requested.", categorySchema),
      meta: responseMetaSchema,
    },
    "Keepa category search results.",
  ),
});

const getBestSellersAction = defineProviderAction(service, {
  name: "get_best_sellers",
  description: "Retrieve Keepa's ordered Amazon best-seller ASIN list for a category node or website display group.",
  requiredScopes: [],
  inputSchema: s.actionInput(
    {
      marketplace: marketplaceSchema,
      category: s.anyOf("Amazon category node ID or Keepa website display group name.", [
        s.nonNegativeInteger("Amazon category node ID."),
        s.nonEmptyString("Keepa website display group name."),
      ]),
    },
    ["marketplace", "category"],
    "Input for retrieving Keepa best sellers.",
  ),
  outputSchema: s.actionOutput(
    {
      marketplace: marketplaceSchema,
      categoryId: s.nullableInteger("Amazon category node ID resolved by Keepa."),
      lastUpdate: s.nullableInteger("Best-seller list update time in Keepa Time minutes."),
      asins: s.array(
        "Ordered Amazon ASINs, starting with the product having the lowest sales rank.",
        s.string("One Amazon ASIN."),
      ),
      raw: s.looseObject("The complete Keepa bestSellersList object."),
      meta: responseMetaSchema,
    },
    "Keepa best-seller results.",
  ),
});

const findDealsAction = defineProviderAction(service, {
  name: "find_deals",
  description: "Find recently changed Amazon products with Keepa deal filters and bounded pagination.",
  requiredScopes: [],
  inputSchema: s.actionInput(
    {
      marketplace: marketplaceSchema,
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
    },
    ["marketplace", "priceType"],
    "Input for finding Keepa deals.",
  ),
  outputSchema: s.actionOutput(
    {
      marketplace: marketplaceSchema,
      deals: s.array(
        "Deal records returned by Keepa.",
        s.looseObject("One Keepa deal record.", {
          asin: s.nullableString("Amazon ASIN."),
          title: s.nullableString("Amazon product title."),
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
    },
    "Keepa deal search results.",
  ),
});

const getSellerSnapshotAction = defineProviderAction(service, {
  name: "get_seller_snapshot",
  description:
    "Retrieve compact Keepa marketplace seller profiles, ratings, category statistics, brands, and competitors.",
  requiredScopes: [],
  inputSchema: s.actionInput(
    {
      marketplace: marketplaceSchema,
      sellerIds: s.array("Amazon marketplace seller IDs.", s.nonEmptyString("One Amazon seller ID."), {
        minItems: 1,
        maxItems: 100,
      }),
    },
    ["marketplace", "sellerIds"],
    "Input for retrieving Keepa seller snapshots.",
  ),
  outputSchema: s.actionOutput(
    {
      marketplace: marketplaceSchema,
      sellers: s.array(
        "Seller profiles returned by Keepa.",
        s.looseObject("One normalized Keepa seller profile.", {
          sellerId: s.string("Amazon seller ID."),
          sellerName: s.nullableString("Amazon seller display name."),
          currentRating: s.nullableInteger("Current seller rating percentage."),
          ratingCount: s.nullable(
            s.array(
              "Rating counts for the last 30, 90, and 365 days and lifetime.",
              s.integer("One seller rating count."),
            ),
          ),
          hasFba: s.nullableBoolean("Whether Keepa has observed current FBA listings."),
          shipsFromChina: s.nullableBoolean("Whether Keepa identifies the seller as shipping from China."),
          raw: s.looseObject("The complete Keepa seller object."),
        }),
      ),
      meta: responseMetaSchema,
    },
    "Keepa seller snapshot results.",
  ),
});

export type KeepaActionName =
  | "get_token_status"
  | "get_product_snapshot"
  | "get_product_history"
  | "find_products"
  | "search_categories"
  | "get_best_sellers"
  | "find_deals"
  | "get_seller_snapshot";

export const keepaActions: ActionDefinition[] = [
  getTokenStatusAction,
  getProductSnapshotAction,
  getProductHistoryAction,
  findProductsAction,
  searchCategoriesAction,
  getBestSellersAction,
  findDealsAction,
  getSellerSnapshotAction,
];

function withProductRequestRules(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    allOf: [
      {
        if: {
          required: ["offers"],
        },
        then: {
          properties: {
            asins: {
              maxItems: 20,
            },
          },
        },
      },
      {
        if: {
          required: ["onlyLiveOffers"],
          properties: {
            onlyLiveOffers: {
              const: true,
            },
          },
        },
        then: {
          required: ["offers"],
        },
      },
    ],
  };
}
