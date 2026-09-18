import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "junglescout" as const;

export const jungleScoutMarketplaces = ["us", "uk", "de", "in", "ca", "fr", "it", "es", "mx", "jp"] as const;

const keywordSortValues = [
  "name",
  "-name",
  "dominant_category",
  "-dominant_category",
  "monthly_trend",
  "-monthly_trend",
  "quarterly_trend",
  "-quarterly_trend",
  "monthly_search_volume_exact",
  "-monthly_search_volume_exact",
  "monthly_search_volume_broad",
  "-monthly_search_volume_broad",
  "recommended_promotions",
  "-recommended_promotions",
  "sp_brand_ad_bid",
  "-sp_brand_ad_bid",
  "ppc_bid_broad",
  "-ppc_bid_broad",
  "ppc_bid_exact",
  "-ppc_bid_exact",
  "ease_of_ranking_score",
  "-ease_of_ranking_score",
  "relevancy_score",
  "-relevancy_score",
  "organic_product_count",
  "-organic_product_count",
] as const;

const productSortValues = [
  "name",
  "-name",
  "category",
  "-category",
  "revenue",
  "-revenue",
  "sales",
  "-sales",
  "price",
  "-price",
  "rank",
  "-rank",
  "reviews",
  "-reviews",
  "lqs",
  "-lqs",
  "sellers",
  "-sellers",
] as const;

const marketplaceSchema = s.stringEnum("Amazon marketplace code supported by Jungle Scout.", jungleScoutMarketplaces);

const asinSchema = s.nonEmptyString("A 10-character Amazon ASIN normalized and validated at execution time.");
const salesEstimateAsinSchema = asinSchema;

const keywordFilterFields = {
  min_monthly_search_volume_exact: s.nonNegativeInteger("Minimum exact-match monthly search volume."),
  max_monthly_search_volume_exact: s.nonNegativeInteger("Maximum exact-match monthly search volume."),
  min_monthly_search_volume_broad: s.nonNegativeInteger("Minimum broad-match monthly search volume."),
  max_monthly_search_volume_broad: s.nonNegativeInteger("Maximum broad-match monthly search volume."),
  min_word_count: s.nonNegativeInteger("Minimum keyword word count."),
  max_word_count: s.nonNegativeInteger("Maximum keyword word count."),
  min_organic_product_count: s.nonNegativeInteger("Minimum organic product count."),
  max_organic_product_count: s.nonNegativeInteger("Maximum organic product count."),
};

const keywordFilterNames = Object.keys(keywordFilterFields);

const keywordAttributesSchema = s.looseObject(
  "Official Jungle Scout keyword result attributes; additional documented fields are preserved.",
  {
    country: s.nullable(s.string("Amazon marketplace code.")),
    name: s.nullable(s.string("Keyword or phrase.")),
    primary_asin: s.nullable(s.string("Primary ASIN used for a reverse lookup.")),
    monthly_trend: s.nullable(s.number("Thirty-day keyword performance trend.")),
    quarterly_trend: s.nullable(s.number("Ninety-day keyword performance trend.")),
    monthly_search_volume_exact: s.nullable(s.integer("Exact-match searches in the past 30 days.")),
    monthly_search_volume_broad: s.nullable(s.integer("Broad-match searches in the past 30 days.")),
    dominant_category: s.nullable(s.string("Dominant Amazon category among top results.")),
    organic_product_count: s.nullable(s.integer("Organic product count.")),
    sponsored_product_count: s.nullable(s.integer("Sponsored product count.")),
    relevancy_score: s.nullable(s.integer("Keyword relevancy score.")),
  },
);

const historicalVolumeAttributesSchema = s.looseObject("Official Jungle Scout historical search-volume attributes.", {
  estimate_start_date: s.nullable(s.date("Start date of the estimate period.")),
  estimate_end_date: s.nullable(s.date("End date of the estimate period.")),
  estimated_exact_search_volume: s.integer("Exact search volume estimated for the period."),
});

const productAttributesSchema = s.looseObject(
  "Official Jungle Scout product database attributes; additional documented fields are preserved.",
  {
    title: s.nullable(s.string("Last known Amazon listing title.")),
    price: s.nullable(s.number("Last known product price.")),
    reviews: s.nullable(s.integer("Last known review count.")),
    category: s.nullable(s.string("Main Amazon category.")),
    rating: s.nullable(s.number("Amazon product rating.", { minimum: 1, maximum: 5 })),
    image_url: s.nullable(s.string("Main Amazon product image URL.")),
    parent_asin: s.nullable(s.string("Parent ASIN, or null for a standalone product.")),
    brand: s.nullable(s.string("Product brand.")),
    product_rank: s.nullable(s.number("Product rank.")),
    approximate_30_day_revenue: s.nullable(s.number("Estimated revenue over the past 30 days.")),
    approximate_30_day_units_sold: s.nullable(s.integer("Estimated units sold over the past 30 days.")),
    is_available: s.boolean("Whether the product is currently available."),
    is_parent: s.nullable(s.boolean("Whether the product is a parent ASIN.")),
    is_variant: s.nullable(s.boolean("Whether the product is a variant ASIN.")),
    is_standalone: s.nullable(s.boolean("Whether the product is a standalone ASIN.")),
    updated_at: s.nullable(s.string("Timestamp when Jungle Scout last updated the product.")),
  },
);

const salesEstimateAttributesSchema = s.looseObject("Official Jungle Scout sales estimate attributes.", {
  parent_asin: s.nullable(s.string("Parent ASIN, or null for a standalone product.")),
  is_parent: s.nullable(s.boolean("Whether the queried ASIN is a parent.")),
  is_variant: s.nullable(s.boolean("Whether the queried ASIN is a variant.")),
  is_standalone: s.nullable(s.boolean("Whether the queried ASIN is standalone.")),
  data: s.array(
    "Daily sales estimates.",
    s.looseObject("One daily sales estimate.", {
      date: s.date("Estimate date."),
      estimated_units_sold: s.integer("Estimated units sold on this date."),
      last_known_price: s.nullable(s.number("Last known price for this date.")),
    }),
  ),
  variants: s.nullable(
    s.stringArray("Variant ASINs when the queried ASIN is a parent.", {
      itemDescription: "One variant ASIN.",
    }),
  ),
});

const shareOfVoiceAttributesSchema = s.looseObject(
  "Official Jungle Scout share-of-voice attributes; brand and top-ASIN details are preserved.",
  {
    estimated_30_day_search_volume: s.integer("Exact-match search volume over 30 days."),
    exact_suggested_bid_median: s.nullable(s.number("Median suggested exact-match bid.")),
    product_count: s.integer("Number of ASINs included in the result."),
    updated_at: s.dateTime("Timestamp when Jungle Scout refreshed the data."),
    brands: s.array(
      "Brand share-of-voice results.",
      s.looseObject("One brand share-of-voice result.", {
        brand: s.nullable(s.string("Brand name.")),
        combined_products: s.nullable(s.integer("Organic and sponsored products for the brand.")),
        combined_weighted_sov: s.nullable(s.number("Weighted combined share of voice.")),
        combined_basic_sov: s.nullable(s.number("Basic combined share of voice.")),
      }),
    ),
    top_asins: s.nullable(
      s.array(
        "Top ASIN click and conversion results.",
        s.looseObject("One top-ASIN result.", {
          asin: s.nullable(s.string("Amazon ASIN.")),
          name: s.nullable(s.string("Product name.")),
          brand: s.nullable(s.string("Product brand.")),
          clicks: s.nullable(s.integer("Customer clicks in the modeled period.")),
          conversions: s.nullable(s.integer("Purchases in the modeled period.")),
          conversion_rate: s.nullable(s.number("Conversions divided by clicks.")),
        }),
      ),
    ),
  },
);

const paginationFields = {
  meta: s.looseObject("Pagination metadata returned by Jungle Scout.", {
    total_items: s.integer("Total number of matching items."),
  }),
  links: s.looseObject("JSON:API pagination links returned by Jungle Scout.", {
    self: s.string("URL for the current page."),
    next: s.nullable(s.string("URL for the next page, or null when no page remains.")),
  }),
};

const keywordsByAsinInputSchema = s.object(
  "Parameters for retrieving keywords that rank for one or more Amazon ASINs.",
  {
    marketplace: marketplaceSchema,
    asins: s.array("Amazon ASINs to compare, with the first ASIN used as primary.", asinSchema, {
      minItems: 1,
      maxItems: 10,
    }),
    include_variants: s.boolean("Whether to include ASIN variants; Jungle Scout defaults to true."),
    sort: s.stringEnum("Keyword sort field; a leading minus sign selects descending order.", keywordSortValues),
    page_size: s.integer("Number of keyword results per page; defaults to 50.", {
      minimum: 1,
      maximum: 100,
    }),
    cursor: s.nonEmptyString("Pagination cursor returned by Jungle Scout."),
    ...keywordFilterFields,
  },
  {
    optional: ["include_variants", "sort", "page_size", "cursor", ...keywordFilterNames],
  },
);

const keywordsByKeywordInputSchema = s.object(
  "Parameters for retrieving related keyword data from a search term.",
  {
    marketplace: marketplaceSchema,
    search_terms: s.nonEmptyString("Keyword or phrase to search for."),
    categories: s.array(
      "Dominant Amazon categories to include; omit to search all categories.",
      s.nonEmptyString("One marketplace-specific Amazon category name."),
      { minItems: 1 },
    ),
    sort: s.stringEnum("Keyword sort field; a leading minus sign selects descending order.", keywordSortValues),
    page_size: s.integer("Number of keyword results per page; defaults to 50.", {
      minimum: 1,
      maximum: 100,
    }),
    cursor: s.nonEmptyString("Pagination cursor returned by Jungle Scout."),
    ...keywordFilterFields,
  },
  {
    optional: ["categories", "sort", "page_size", "cursor", ...keywordFilterNames],
  },
);

const historicalSearchVolumeInputSchema = s.object(
  "Parameters for retrieving historical search volume for one keyword.",
  {
    marketplace: marketplaceSchema,
    keyword: s.nonEmptyString("Keyword to retrieve historical search volume for."),
    start_date: s.date("Start date in YYYY-MM-DD format."),
    end_date: s.date("End date in YYYY-MM-DD format."),
  },
);

const productFilterFields = {
  product_tiers: s.array(
    "Product size tiers to include.",
    s.stringEnum("One Jungle Scout product size tier.", ["oversize", "standard"]),
    { minItems: 1 },
  ),
  seller_types: s.array(
    "Seller fulfillment types to include.",
    s.stringEnum("One seller fulfillment type.", ["amz", "fba", "fbm"]),
    { minItems: 1 },
  ),
  categories: s.stringArray("Amazon categories to include.", {
    minItems: 1,
    itemDescription: "One marketplace-specific Amazon category name.",
  }),
  include_keywords: s.array(
    "Title keywords or ASINs to include.",
    s.nonEmptyString("One keyword or ASIN to include.", { maxLength: 50 }),
    { minItems: 1, maxItems: 100 },
  ),
  exclude_keywords: s.array(
    "Title keywords or ASINs to exclude.",
    s.nonEmptyString("One keyword or ASIN to exclude.", { maxLength: 50 }),
    { minItems: 1, maxItems: 100 },
  ),
  exclude_top_brands: s.boolean("Whether to exclude top brands."),
  exclude_unavailable_products: s.boolean("Whether to exclude unavailable products."),
  min_price: s.number("Minimum product price."),
  max_price: s.number("Maximum product price."),
  min_net: s.number("Minimum product price less FBA fees."),
  max_net: s.number("Maximum product price less FBA fees."),
  min_rank: s.integer("Minimum best-seller rank."),
  max_rank: s.integer("Maximum best-seller rank."),
  min_sales: s.integer("Minimum estimated monthly sales."),
  max_sales: s.integer("Maximum estimated monthly sales."),
  min_revenue: s.number("Minimum estimated monthly revenue."),
  max_revenue: s.number("Maximum estimated monthly revenue."),
  min_reviews: s.integer("Minimum review count."),
  max_reviews: s.integer("Maximum review count."),
  min_rating: s.number("Minimum star rating.", { minimum: 1, maximum: 5 }),
  max_rating: s.number("Maximum star rating.", { minimum: 1, maximum: 5 }),
  min_weight: s.number("Minimum product weight in pounds."),
  max_weight: s.number("Maximum product weight in pounds."),
  min_sellers: s.integer("Minimum seller count."),
  max_sellers: s.integer("Maximum seller count."),
  min_lqs: s.number("Minimum listing quality score.", { minimum: 1, maximum: 10 }),
  max_lqs: s.number("Maximum listing quality score.", { minimum: 1, maximum: 10 }),
  min_updated_at: s.date("Earliest product update date."),
  max_updated_at: s.date("Latest product update date."),
};

const productFilterNames = Object.keys(productFilterFields);

const productDatabaseInputSchema = s.object(
  "Filters for searching the Jungle Scout Amazon product database.",
  {
    marketplace: marketplaceSchema,
    sort: s.stringEnum("Product sort field; a leading minus sign selects descending order.", productSortValues),
    collapse_by_parent: s.boolean("Whether to collapse product results so only parent ASINs are returned."),
    page_size: s.integer("Number of products per page; defaults to 50.", {
      minimum: 1,
      maximum: 100,
    }),
    cursor: s.nonEmptyString("Pagination cursor returned by Jungle Scout."),
    ...productFilterFields,
  },
  {
    optional: ["sort", "collapse_by_parent", "page_size", "cursor", ...productFilterNames],
  },
);

const salesEstimatesInputSchema = s.object(
  "Parameters for retrieving daily Jungle Scout sales estimates for one ASIN.",
  {
    marketplace: marketplaceSchema,
    asin: salesEstimateAsinSchema,
    start_date: s.date("Start date in YYYY-MM-DD format."),
    end_date: s.date("End date in YYYY-MM-DD format and before the current date."),
  },
);

const getKeywordsByAsinAction = defineProviderAction(service, {
  name: "get_keywords_by_asin",
  operationType: "read",
  description:
    "Retrieve keywords that rank for up to 10 Amazon ASINs, including volume, trend, bid, relevance, and rank data.",
  requiredScopes: [],
  inputSchema: keywordsByAsinInputSchema,
  outputSchema: collectionOutputSchema(
    "Jungle Scout keyword-by-ASIN JSON:API response.",
    resourceSchema("One keyword result for the supplied ASINs.", keywordAttributesSchema),
  ),
});

const getKeywordsByKeywordAction = defineProviderAction(service, {
  name: "get_keywords_by_keyword",
  operationType: "read",
  description:
    "Retrieve related Amazon keywords from a search term with volume, trend, bid, relevance, and competition data.",
  requiredScopes: [],
  inputSchema: keywordsByKeywordInputSchema,
  outputSchema: collectionOutputSchema(
    "Jungle Scout keyword search JSON:API response.",
    resourceSchema("One related keyword result.", keywordAttributesSchema),
  ),
});

const getHistoricalSearchVolumeAction = defineProviderAction(service, {
  name: "get_historical_search_volume",
  operationType: "read",
  description: "Retrieve weekly historical exact-search-volume estimates for one Amazon keyword.",
  requiredScopes: [],
  inputSchema: historicalSearchVolumeInputSchema,
  outputSchema: collectionOutputSchema(
    "Jungle Scout historical search-volume JSON:API response.",
    resourceSchema("One historical search-volume period.", historicalVolumeAttributesSchema),
  ),
});

const searchProductsAction = defineProviderAction(service, {
  name: "search_products",
  operationType: "read",
  description:
    "Search the Jungle Scout Amazon product database by category, keywords, price, demand, revenue, rating, seller, and listing-quality filters.",
  requiredScopes: [],
  inputSchema: productDatabaseInputSchema,
  outputSchema: collectionOutputSchema(
    "Jungle Scout product database JSON:API response.",
    resourceSchema("One Amazon product database result.", productAttributesSchema),
  ),
});

const getSalesEstimatesAction = defineProviderAction(service, {
  name: "get_sales_estimates",
  operationType: "read",
  description: "Retrieve daily estimated Amazon unit sales for one ASIN over a date range.",
  requiredScopes: [],
  inputSchema: salesEstimatesInputSchema,
  outputSchema: collectionOutputSchema(
    "Jungle Scout sales-estimates JSON:API response.",
    resourceSchema("Sales estimates for the queried ASIN or its variants.", salesEstimateAttributesSchema),
  ),
});

const getShareOfVoiceAction = defineProviderAction(service, {
  name: "get_share_of_voice",
  operationType: "read",
  description:
    "Retrieve Amazon keyword share of voice by brand, including organic, sponsored, and top-ASIN conversion data.",
  requiredScopes: [],
  inputSchema: s.object("Parameters for retrieving share of voice for one Amazon keyword.", {
    marketplace: marketplaceSchema,
    keyword: s.nonEmptyString("Keyword to analyze."),
  }),
  outputSchema: s.object("Jungle Scout share-of-voice JSON:API response.", {
    data: resourceSchema("Share-of-voice data for one keyword.", shareOfVoiceAttributesSchema),
  }),
});

export const jungleScoutActions: ActionDefinition[] = [
  getKeywordsByAsinAction,
  getKeywordsByKeywordAction,
  getHistoricalSearchVolumeAction,
  searchProductsAction,
  getSalesEstimatesAction,
  getShareOfVoiceAction,
];

function resourceSchema(description: string, attributes: JsonSchema) {
  return s.object(description, {
    id: s.string("Jungle Scout JSON:API resource identifier."),
    type: s.string("Jungle Scout JSON:API resource type."),
    attributes,
  });
}

function collectionOutputSchema(description: string, itemSchema: JsonSchema) {
  return s.object(
    description,
    {
      data: s.array("Resources returned by Jungle Scout.", itemSchema),
      ...paginationFields,
    },
    { optional: ["meta", "links"] },
  );
}
