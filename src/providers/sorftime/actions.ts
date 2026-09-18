import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sorftime" as const;

function trimmedString(description: string) {
  return s.nonEmptyString(description);
}

const amazonDomainSchema = s.integer(
  "Amazon marketplace domain code: 1=US, 2=UK, 3=DE, 4=FR, 5=IN, 6=CA, 7=JP, 8=ES, 9=IT, 10=MX, 11=AE, 12=AU, 13=BR, or 14=SA. Defaults to 1 (US).",
  { minimum: 1, maximum: 14 },
);

const keywordDomainSchema = s.anyOf(
  "Amazon marketplace domain code supported by this keyword endpoint. Defaults to 1 (US).",
  [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((domain) =>
    s.literal(domain, { description: `Sorftime Amazon domain ${domain}.` }),
  ),
);

const asinSchema = s.string("A single Amazon ASIN.", { minLength: 10, maxLength: 10 });

const pageIndexSchema = s.integer("One-based result page number. Defaults to 1.", {
  minimum: 1,
});

const walmartProductIdSchema = trimmedString("Walmart product ID.");
const walmartKeywordPageSizeSchema = s.integer("Number of Walmart keyword results per page. Defaults to 20.", {
  minimum: 20,
  maximum: 200,
});
const walmartPagedKeywordInputSchema = s.object(
  "Parameters for querying a paginated Sorftime Walmart keyword endpoint.",
  {
    keyword: trimmedString("Walmart keyword to query."),
    page_index: pageIndexSchema,
    page_size: walmartKeywordPageSizeSchema,
  },
  { optional: ["page_index", "page_size"] },
);
const walmartProductSalesHistoryInputSchema = s.object(
  "Parameters for querying Sorftime Walmart product sales history.",
  {
    product_id: walmartProductIdSchema,
    query_start_date: s.date("Sales history start date in YYYY-MM-DD format. Sorftime supports dates from 2023-09-01."),
    query_end_date: s.date("Sales history end date in YYYY-MM-DD format. Requires query_start_date."),
    page_index: pageIndexSchema,
  },
  { optional: ["query_start_date", "query_end_date", "page_index"] },
);
const walmartKeywordSearchInputSchema = s.object(
  "Filters for querying Sorftime Walmart US hot keywords.",
  {
    keyword: trimmedString("Keyword text to match."),
    rank_condition: s.stringArray("Weekly search-rank range containing one lower bound or a lower and upper bound.", {
      minItems: 1,
      maxItems: 2,
      itemDescription: "A non-negative rank boundary.",
    }),
    search_volume_condition: s.stringArray(
      "Recent 30-day search-volume range containing one lower bound or a lower and upper bound.",
      { minItems: 1, maxItems: 2, itemDescription: "A non-negative search-volume boundary." },
    ),
    page_index: pageIndexSchema,
    page_size: walmartKeywordPageSizeSchema,
  },
  { optional: ["keyword", "rank_condition", "search_volume_condition", "page_index", "page_size"] },
);

const keywordPageSizeSchema = s.integer("Number of keyword results per page. Defaults to 20.", {
  minimum: 20,
  maximum: 200,
});

const yearMonthSchema = s.nonEmptyString("Month in YYYY-MM format.", {
  pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$",
});

const keywordTrendDomainSchema = s.anyOf(
  "Amazon marketplace domain code supported by the keyword search-result trend endpoint. Defaults to 1 (US).",
  [1, 2, 3, 6, 7, 8, 10, 11, 12, 13, 14].map((domain) =>
    s.literal(domain, { description: `Sorftime Amazon domain ${domain}.` }),
  ),
);

const responseSchema = s.object(
  "A successful Sorftime API response envelope.",
  {
    RequestLeft: s.nonNegativeInteger("Number of API requests remaining for the account."),
    RequestConsumed: s.nonNegativeInteger("Number of requests consumed by this call."),
    Code: s.literal(0, { description: "Sorftime business status code. Zero indicates success." }),
    Message: s.nullable(s.string("Sorftime status message, or null when none is returned.")),
    Data: s.unknown("Endpoint-specific structured data returned by Sorftime."),
  },
  { additionalProperties: true },
);

const productDetailsInputSchema = s.object(
  "Parameters for querying Sorftime Amazon product details.",
  {
    domain: amazonDomainSchema,
    asin: asinSchema,
    trend: s.integer("Trend inclusion mode: 1 includes trend data and 2 excludes it. Sorftime defaults to 1.", {
      minimum: 1,
      maximum: 2,
    }),
    query_trend_start_date: s.date(
      "Start date for trend data in YYYY-MM-DD format. Requests longer than 15 days consume two requests.",
    ),
    query_trend_end_date: s.date("End date for trend data in YYYY-MM-DD format. Requires query_trend_start_date."),
  },
  { optional: ["domain", "trend", "query_trend_start_date", "query_trend_end_date"] },
);

const categoryBestSellersInputSchema = s.object(
  "Parameters for querying Sorftime Amazon category Best Seller products.",
  {
    domain: amazonDomainSchema,
    node_id: trimmedString("Amazon category NodeId."),
    query_start: s.date("Historical range start date in YYYY-MM-DD format. Historical ranges must span 3 to 40 days."),
    query_date: s.date(
      "Historical range end date in YYYY-MM-DD format. Historical data is available through two days before today.",
    ),
  },
  { optional: ["domain", "query_start", "query_date"] },
);

const creditUsageInputSchema = s.object(
  "Parameters for querying Sorftime credit usage records.",
  {
    platform: s.stringEnum("Platform whose credit usage should be returned. Defaults to Amazon.", [
      "amazon",
      "shopee",
      "walmart",
    ]),
    query_start_date: s.date("Credit usage range start date in YYYY-MM-DD format. Requires query_end_date."),
    query_end_date: s.date("Credit usage range end date in YYYY-MM-DD format. Requires query_start_date."),
    page_index: pageIndexSchema,
    page_size: s.integer("Number of credit usage records per page. Defaults to 20.", {
      minimum: 1,
      maximum: 200,
    }),
  },
  {
    optional: ["platform", "query_start_date", "query_end_date", "page_index", "page_size"],
  },
);

const productSearchInputSchema = s.object(
  "Filters for searching the Sorftime Amazon product database.",
  {
    domain: amazonDomainSchema,
    query_month: yearMonthSchema,
    page: pageIndexSchema,
    asin: asinSchema,
    node_id: trimmedString("Amazon category NodeId."),
    brand: trimmedString("Product brand name."),
    seller_name: trimmedString("Seller display name."),
    seller_id: trimmedString("Amazon seller identifier."),
    keyword: trimmedString("Keyword that should match the product."),
    attribute_name: trimmedString("Product attribute name to match."),
    peak_selling_months: s.array(
      "Peak-selling calendar months from 1 through 12.",
      s.integer("A calendar month number.", { minimum: 1, maximum: 12 }),
      { minItems: 1, maxItems: 12 },
    ),
    shipping_type: trimmedString("Sorftime shipping type filter."),
    price_min: s.number("Minimum product price."),
    price_max: s.number("Maximum product price."),
    monthly_sales_min: s.nonNegativeInteger("Minimum estimated monthly sales volume."),
    monthly_sales_max: s.nonNegativeInteger("Maximum estimated monthly sales volume."),
    listed_from: s.date("Earliest product listing date in YYYY-MM-DD format."),
    listed_to: s.date("Latest product listing date in YYYY-MM-DD format."),
    rating_min: s.number("Minimum product rating.", { minimum: 0, maximum: 5 }),
    rating_max: s.number("Maximum product rating.", { minimum: 0, maximum: 5 }),
    reviews_min: s.nonNegativeInteger("Minimum product review count."),
    reviews_max: s.nonNegativeInteger("Maximum product review count."),
    subcategory_rank_min: s.nonNegativeInteger("Minimum subcategory rank."),
    subcategory_rank_max: s.nonNegativeInteger("Maximum subcategory rank."),
    variation_count_min: s.nonNegativeInteger("Minimum variation count."),
    variation_count_max: s.nonNegativeInteger("Maximum variation count."),
    category_rank_min: s.nonNegativeInteger("Minimum category rank."),
    category_rank_max: s.nonNegativeInteger("Maximum category rank."),
  },
  {
    optional: [
      "domain",
      "query_month",
      "page",
      "asin",
      "node_id",
      "brand",
      "seller_name",
      "seller_id",
      "keyword",
      "attribute_name",
      "peak_selling_months",
      "shipping_type",
      "price_min",
      "price_max",
      "monthly_sales_min",
      "monthly_sales_max",
      "listed_from",
      "listed_to",
      "rating_min",
      "rating_max",
      "reviews_min",
      "reviews_max",
      "subcategory_rank_min",
      "subcategory_rank_max",
      "variation_count_min",
      "variation_count_max",
      "category_rank_min",
      "category_rank_max",
    ],
  },
);

const asinSalesHistoryInputSchema = s.object(
  "Parameters for querying Sorftime ASIN sales history.",
  {
    domain: amazonDomainSchema,
    asin: asinSchema,
    page: pageIndexSchema,
    query_start_date: s.date("Sales history range start date in YYYY-MM-DD format."),
    query_end_date: s.date("Sales history range end date in YYYY-MM-DD format. Requires query_start_date."),
  },
  { optional: ["domain", "page", "query_start_date", "query_end_date"] },
);

const keywordSearchInputSchema = s.object(
  "Parameters for searching the Sorftime Amazon keyword database.",
  {
    domain: keywordDomainSchema,
    keyword: trimmedString("Keyword text to search for."),
    node_ids: s.array(
      "Amazon category NodeIds used to narrow the keyword search.",
      trimmedString("An Amazon category NodeId."),
      { minItems: 1 },
    ),
    rank_condition: s.stringArray("Sorftime keyword rank range with one or two values.", {
      minItems: 1,
      maxItems: 2,
      itemDescription: "A Sorftime rank boundary value.",
    }),
    search_volume_condition: s.stringArray("Sorftime keyword search-volume range with one or two values.", {
      minItems: 1,
      maxItems: 2,
      itemDescription: "A Sorftime search-volume boundary value.",
    }),
    weekly_rank_change_condition: s.tuple(
      [
        trimmedString("Minimum weekly rank change."),
        trimmedString("Maximum weekly rank change."),
        s.stringEnum("Weekly rank-change sort direction.", ["1", "2"]),
      ],
      { description: "Sorftime weekly rank-change range followed by sort direction 1 for rising or 2 for falling." },
    ),
    history: trimmedString(
      "Historical query selector formatted as 1,YYYY-MM-DD for weekly data or 2,YYYY-MM for monthly data.",
    ),
    page_index: pageIndexSchema,
    page_size: keywordPageSizeSchema,
  },
  {
    optional: [
      "domain",
      "node_ids",
      "rank_condition",
      "search_volume_condition",
      "weekly_rank_change_condition",
      "history",
      "page_index",
      "page_size",
    ],
  },
);

const keywordSearchResultTrendInputSchema = s.object(
  "Parameters for querying Sorftime keyword search-result trends.",
  {
    domain: keywordTrendDomainSchema,
    keyword: trimmedString("Amazon keyword to query."),
    query_start: yearMonthSchema,
    query_end: yearMonthSchema,
  },
  { optional: ["domain", "query_start", "query_end"] },
);

const keywordProductRankingsInputSchema = s.object(
  "Parameters for querying products ranked for a Sorftime Amazon keyword.",
  {
    domain: keywordDomainSchema,
    keyword: trimmedString("Amazon keyword to query."),
    month: yearMonthSchema,
    page: pageIndexSchema,
  },
  { optional: ["domain", "month", "page"] },
);

const asinKeywordRankingsInputSchema = s.object(
  "Parameters for querying a US Amazon ASIN's rankings for one keyword.",
  {
    keyword: trimmedString("Amazon keyword to query."),
    asin: asinSchema,
    query_start: s.date("Ranking history range start date in YYYY-MM-DD format."),
    query_end: s.date("Ranking history range end date in YYYY-MM-DD format."),
    page: pageIndexSchema,
  },
  { optional: ["query_start", "query_end", "page"] },
);

export const sorftimeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_product_details",
    operationType: "read",
    description:
      "Get Sorftime Amazon product details for one ASIN, optionally including price, rank, sales, and other historical trends. Consumes one request, or two for trend ranges longer than 15 days.",
    inputSchema: productDetailsInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "search_products_by_name",
    operationType: "read",
    description:
      "Search Amazon products by name through Sorftime and return product research results. Consumes two Sorftime requests.",
    inputSchema: s.object(
      "Parameters for searching Sorftime Amazon products by name.",
      {
        domain: amazonDomainSchema,
        name: trimmedString("Product name or phrase to search for."),
        page_index: pageIndexSchema,
      },
      { optional: ["domain", "page_index"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "search_categories_by_name",
    operationType: "read",
    description:
      "Search Amazon category markets by natural-language name through Sorftime and return matching NodeIds. Consumes one Sorftime request.",
    inputSchema: s.object(
      "Parameters for searching Sorftime Amazon categories by name.",
      {
        domain: amazonDomainSchema,
        name: trimmedString("Category name or phrase to search for."),
      },
      { optional: ["domain"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_category_best_sellers",
    operationType: "read",
    description:
      "Get the current or historical Amazon Best Seller Top 100 products for a category through Sorftime. Consumes five requests; historical lookup costs ten requests per three-day block.",
    inputSchema: categoryBestSellersInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_category_trend",
    operationType: "read",
    description:
      "Get up to two years of a selected Sorftime Amazon category market trend. Consumes five Sorftime requests.",
    inputSchema: s.object(
      "Parameters for querying a Sorftime Amazon category trend.",
      {
        domain: amazonDomainSchema,
        node_id: trimmedString("Amazon category NodeId."),
        trend_index: s.integer(
          "Sorftime category trend metric index from 0 through 39, such as 0 for sales, 1 for brand count, or 2 for seller count.",
          { minimum: 0, maximum: 39 },
        ),
      },
      { optional: ["domain"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_keyword_details",
    operationType: "read",
    description:
      "Get Sorftime Amazon keyword details including search volume, conversion, competition, and CPC trends. Consumes one Sorftime request.",
    inputSchema: s.object(
      "Parameters for querying Sorftime Amazon keyword details.",
      {
        domain: keywordDomainSchema,
        keyword: trimmedString("Amazon keyword to query."),
      },
      { optional: ["domain"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "extend_keywords",
    operationType: "read",
    description: "Find related Amazon keywords from a seed keyword through Sorftime. Consumes five Sorftime requests.",
    inputSchema: s.object(
      "Parameters for finding extended Sorftime Amazon keywords.",
      {
        domain: keywordDomainSchema,
        keyword: trimmedString("Seed Amazon keyword used to find related keywords."),
        page_index: pageIndexSchema,
        page_size: keywordPageSizeSchema,
      },
      { optional: ["domain", "page_index", "page_size"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_lookup_asin_keywords",
    operationType: "read",
    description:
      "Find Amazon keywords that exposed an ASIN in the first three search-result pages during the last 30 days through Sorftime. Consumes one Sorftime request.",
    inputSchema: s.object(
      "Parameters for reverse-looking up Sorftime Amazon ASIN keywords.",
      {
        domain: keywordDomainSchema,
        asin: asinSchema,
        page_index: pageIndexSchema,
        page_size: keywordPageSizeSchema,
      },
      { optional: ["domain", "page_index", "page_size"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_credit_balance",
    operationType: "read",
    description: "Get the current Sorftime credit balance. Consumes one Sorftime request.",
    inputSchema: s.requiredObject("Parameters for querying the Sorftime credit balance.", {}),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_credit_usage",
    operationType: "read",
    description:
      "List paginated Sorftime credit usage records for Amazon, Shopee, or Walmart. Consumes one Sorftime request.",
    inputSchema: creditUsageInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_request_usage",
    operationType: "read",
    description: "Get Sorftime monthly request purchases and consumption history without consuming a request.",
    inputSchema: s.requiredObject("Parameters for querying Sorftime monthly request usage.", {}),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "search_products",
    operationType: "read",
    description:
      "Search and filter the Sorftime Amazon product database. Returns up to 100 products per page and consumes five Sorftime requests.",
    inputSchema: productSearchInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_asin_sales_history",
    operationType: "read",
    description:
      "Get current or historical Sorftime estimated sales for one Amazon ASIN. Consumes one Sorftime request.",
    inputSchema: asinSalesHistoryInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_product_variations",
    operationType: "read",
    description:
      "List Amazon product variations through Sorftime, optionally including variation sales. Consumes one request, or two when sales are included.",
    inputSchema: s.object(
      "Parameters for querying Sorftime Amazon product variations.",
      {
        domain: amazonDomainSchema,
        asin: asinSchema,
        page_index: pageIndexSchema,
        include_sales_volume: s.boolean(
          "Whether to include variation sales volume. Enabling it increases the cost from one to two requests.",
        ),
      },
      { optional: ["domain", "page_index", "include_sales_volume"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_product_review_summary",
    operationType: "read",
    description: "Get Sorftime's Amazon customer review summary for one ASIN. Consumes one Sorftime request.",
    inputSchema: s.object(
      "Parameters for querying Sorftime's Amazon customer review summary.",
      { domain: amazonDomainSchema, asin: asinSchema },
      { optional: ["domain"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_product_reviews",
    operationType: "read",
    description:
      "List Sorftime Amazon product review records with rating and verified-purchase filters. Returns 100 records per page and consumes five Sorftime requests.",
    inputSchema: s.object(
      "Parameters for querying Sorftime Amazon product reviews.",
      {
        domain: amazonDomainSchema,
        asin: asinSchema,
        query_start_date: s.date("Earliest review date in YYYY-MM-DD format."),
        page_index: pageIndexSchema,
        stars: s.array(
          "Review sentiment or star filters. Values 1 through 5 select stars, 10 selects negative reviews, and 11 selects positive reviews.",
          s.anyOf(
            "A Sorftime review star or sentiment filter code.",
            [1, 2, 3, 4, 5, 10, 11].map((value) =>
              s.literal(value, { description: `Sorftime review filter code ${value}.` }),
            ),
          ),
          { minItems: 1 },
        ),
        verified_purchase_only: s.boolean("Whether to return only verified-purchase reviews."),
      },
      {
        optional: ["domain", "query_start_date", "page_index", "stars", "verified_purchase_only"],
      },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_products",
    operationType: "read",
    description:
      "List Sorftime Amazon products in a category ordered by monthly sales. Returns 100 products per page and consumes five Sorftime requests.",
    inputSchema: s.object(
      "Parameters for listing Sorftime Amazon category products.",
      {
        domain: amazonDomainSchema,
        node_id: trimmedString("Amazon category NodeId."),
        page: pageIndexSchema,
        range: s.positiveInteger("Maximum category rank range to include."),
      },
      { optional: ["domain", "page", "range"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "search_keywords",
    operationType: "read",
    description: "Search and filter the Sorftime Amazon keyword database. Consumes five Sorftime requests.",
    inputSchema: keywordSearchInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_keyword_search_results",
    operationType: "read",
    description:
      "Get Amazon products appearing in organic or advertising search results for a keyword through Sorftime. Consumes five Sorftime requests.",
    inputSchema: s.object(
      "Parameters for querying Sorftime Amazon keyword search results.",
      {
        domain: keywordDomainSchema,
        keyword: trimmedString("Amazon keyword to query."),
        position_type: s.stringEnum("Search-result placement filter. Sorftime defaults to organic results.", [
          "all",
          "organic",
          "ad",
        ]),
        page_index: pageIndexSchema,
        page_size: keywordPageSizeSchema,
      },
      { optional: ["domain", "position_type", "page_index", "page_size"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_keyword_search_result_trend",
    operationType: "read",
    description:
      "Get monthly Amazon search-result trends for a keyword through Sorftime. Consumes ten Sorftime requests.",
    inputSchema: keywordSearchResultTrendInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_lookup_category_keywords",
    operationType: "read",
    description:
      "Find Amazon keywords associated with a leaf category through Sorftime. Consumes one Sorftime request.",
    inputSchema: s.object(
      "Parameters for reverse-looking up Sorftime Amazon category keywords.",
      {
        domain: keywordDomainSchema,
        node_id: trimmedString("Amazon leaf-category NodeId."),
        page_index: pageIndexSchema,
        page_size: keywordPageSizeSchema,
      },
      { optional: ["domain", "page_index", "page_size"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_keyword_product_rankings",
    operationType: "read",
    description:
      "List products ranked for an Amazon keyword through Sorftime. Returns 200 products per page and consumes five Sorftime requests.",
    inputSchema: keywordProductRankingsInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_asin_keyword_rankings",
    operationType: "read",
    description:
      "Get up to two years of US Amazon rankings for an ASIN and keyword through Sorftime. Returns 200 records per page and consumes two Sorftime requests.",
    inputSchema: asinKeywordRankingsInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_walmart_category_report",
    operationType: "read",
    description:
      "Get Sorftime's Walmart US category report and Best Seller Top 80 products for a known node path. Consumes five Sorftime requests.",
    inputSchema: s.object("Parameters for querying a Sorftime Walmart category report.", {
      node_path: trimmedString(
        "Walmart category path made of numeric node IDs separated by underscores; obtain it from known product or category data.",
      ),
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_walmart_product_details",
    operationType: "read",
    description: "Get current Sorftime Walmart US details for one product ID. Consumes one Sorftime request.",
    inputSchema: s.object("Parameters for querying Sorftime Walmart product details.", {
      product_id: walmartProductIdSchema,
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_walmart_product_trend",
    operationType: "read",
    description:
      "Get Sorftime Walmart US sales, price, review, rating, and category-rank trends for one product ID. Consumes two Sorftime requests.",
    inputSchema: s.object("Parameters for querying Sorftime Walmart product trends.", {
      product_id: walmartProductIdSchema,
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_walmart_product_sales_history",
    operationType: "read",
    description:
      "Get Sorftime Walmart US published variant sales history for one product ID. Defaults to the latest 30 days, returns up to 100 rows per page, and consumes one Sorftime request.",
    inputSchema: walmartProductSalesHistoryInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "search_walmart_keywords",
    operationType: "read",
    description:
      "Search and filter Sorftime's current Walmart US hot-keyword database. Consumes five Sorftime requests.",
    inputSchema: walmartKeywordSearchInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "search_walmart_keywords_by_name",
    operationType: "read",
    description: "Search Sorftime Walmart US hot keywords from a natural-language name. Consumes one Sorftime request.",
    inputSchema: s.object("Parameters for searching Sorftime Walmart keywords by name.", {
      name: trimmedString("Keyword name or phrase to search for."),
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_walmart_keyword_search_results",
    operationType: "read",
    description:
      "Get products appearing in the last 15 days of Walmart US results for a current Sorftime hot keyword. Consumes five Sorftime requests.",
    inputSchema: walmartPagedKeywordInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_walmart_keyword_details",
    operationType: "read",
    description:
      "Get Sorftime Walmart US keyword details such as search volume, competition, and first-page averages. Consumes one Sorftime request.",
    inputSchema: s.object("Parameters for querying Sorftime Walmart keyword details.", {
      keyword: trimmedString("Walmart keyword to query."),
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_lookup_walmart_product_keywords",
    operationType: "read",
    description:
      "Find keywords that exposed a Walmart US product in the first three search-result pages during the last 30 days. Consumes one Sorftime request.",
    inputSchema: s.object(
      "Parameters for reverse-looking up Sorftime Walmart product keywords.",
      { product_id: walmartProductIdSchema, page_index: pageIndexSchema, page_size: walmartKeywordPageSizeSchema },
      { optional: ["page_index", "page_size"] },
    ),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "extend_walmart_keywords",
    operationType: "read",
    description: "Find related Sorftime Walmart US keywords from a seed keyword. Consumes five Sorftime requests.",
    inputSchema: walmartPagedKeywordInputSchema,
    outputSchema: responseSchema,
  }),
];

export type SorftimeActionName =
  | "get_product_details"
  | "search_products_by_name"
  | "search_categories_by_name"
  | "get_category_best_sellers"
  | "get_category_trend"
  | "get_keyword_details"
  | "extend_keywords"
  | "reverse_lookup_asin_keywords"
  | "get_credit_balance"
  | "list_credit_usage"
  | "get_request_usage"
  | "search_products"
  | "get_asin_sales_history"
  | "get_product_variations"
  | "get_product_review_summary"
  | "list_product_reviews"
  | "list_category_products"
  | "search_keywords"
  | "get_keyword_search_results"
  | "get_keyword_search_result_trend"
  | "reverse_lookup_category_keywords"
  | "get_keyword_product_rankings"
  | "get_asin_keyword_rankings"
  | "get_walmart_category_report"
  | "get_walmart_product_details"
  | "get_walmart_product_trend"
  | "get_walmart_product_sales_history"
  | "search_walmart_keywords"
  | "search_walmart_keywords_by_name"
  | "get_walmart_keyword_search_results"
  | "get_walmart_keyword_details"
  | "reverse_lookup_walmart_product_keywords"
  | "extend_walmart_keywords";
