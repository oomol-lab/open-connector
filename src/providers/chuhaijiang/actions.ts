import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chuhaijiang";

const countrySchema = s.stringEnum("TikTok Shop market country code.", [
  "br",
  "de",
  "es",
  "fr",
  "gb",
  "id",
  "it",
  "jp",
  "mx",
  "my",
  "ph",
  "sg",
  "th",
  "us",
  "vn",
]);

const pageSchema = s.integer("One-based page number.", { minimum: 1 });
const pageSizeSchema = s.integer("Number of results per page, up to 10.", {
  minimum: 1,
  maximum: 10,
});
const rankingPageSizeSchema = s.integer("Number of ranking results per page, up to 20.", {
  minimum: 1,
  maximum: 20,
});

const rankingDateSchema = s.string("Statistics date in YYYYMMDD format.", {
  pattern: "^[0-9]{8}$",
});
const rankingGranularitySchema = s.stringEnum("Statistics period used by the ranking.", ["daily", "weekly", "monthly"]);
const rankingSellerTypeSchema = s.stringEnum(
  "Seller type: 1 for overseas, 2 for local, 3 for brand, or 4 for non-brand.",
  ["1", "2", "3", "4"],
);
const rankingCommonProperties = {
  country: countrySchema,
  category: s.nonEmptyString("TikTok product category ID used to filter the ranking."),
  seller_type: rankingSellerTypeSchema,
  page: pageSchema,
  page_size: rankingPageSizeSchema,
};

const usageSchema = s.object("Credits consumed and remaining after the request.", {
  creditsCost: s.integer("Credits consumed by this request."),
  creditsBalance: s.integer("Credits remaining after this request."),
});

const listOutputSchema = s.object(
  "A normalized page of records returned by Chuhaijiang.",
  {
    items: s.array(
      "Records returned by Chuhaijiang for this page.",
      s.looseObject("A Chuhaijiang record whose documented fields depend on the selected product resource."),
    ),
    totalCount: s.integer("Total number of matching records reported by Chuhaijiang."),
    requestId: s.string("Chuhaijiang request identifier used for support and tracing."),
    usage: usageSchema,
  },
  { optional: ["usage"] },
);

const productOutputSchema = s.object(
  "A normalized TikTok product detail returned by Chuhaijiang.",
  {
    product: s.looseObject(
      "The TikTok product record, including documented product, shop, pricing, sales, and category fields.",
    ),
    requestId: s.string("Chuhaijiang request identifier used for support and tracing."),
    usage: usageSchema,
  },
  { optional: ["usage"] },
);

const productIdSchema = s.nonEmptyString("The TikTok product ID returned by Chuhaijiang.");

const relatedProductInputSchema = s.object(
  "Input for retrieving resources related to one TikTok product.",
  {
    product_id: productIdSchema,
    country: countrySchema,
    page: pageSchema,
    page_size: pageSizeSchema,
  },
  { optional: ["page", "page_size"] },
);

export const chuhaijiangActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_products",
    operationType: "read",
    description:
      "Search TikTok Shop products in Chuhaijiang by market, keyword, category, price, rating, sales, shipping, and sort order.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for searching TikTok Shop products in Chuhaijiang.",
      {
        country: countrySchema,
        keyword: s.nonEmptyString("Keyword used to search product names and related text."),
        category: s.nonEmptyString(
          "Numeric TikTok product category ID, available from the l1_category field in search results.",
        ),
        seller_type: s.string(
          'Seller type accepted by Chuhaijiang, such as "1" for overseas non-brand, "2" for local, "3" for brand, "4" for non-brand, or "local" as shown in the official example.',
        ),
        min_price: s.number("Minimum product price in US dollars.", { minimum: 0 }),
        max_price: s.number("Maximum product price in US dollars.", { minimum: 0 }),
        min_rating: s.number("Minimum product rating.", { minimum: 0, maximum: 5 }),
        max_rating: s.number("Maximum product rating.", { minimum: 0, maximum: 5 }),
        min_sold_7d: s.number("Minimum product sales during the last 7 days.", {
          minimum: 0,
        }),
        max_sold_7d: s.number("Maximum product sales during the last 7 days.", {
          minimum: 0,
        }),
        min_sold_30d: s.number("Minimum product sales during the last 30 days.", {
          minimum: 0,
        }),
        max_sold_30d: s.number("Maximum product sales during the last 30 days.", {
          minimum: 0,
        }),
        free_shipping: s.boolean("Whether to return only products with free shipping."),
        sort_field: s.stringEnum("Product field used to sort search results.", [
          "daily_sold",
          "gmv_30d",
          "gmv_7d",
          "price",
          "rating",
          "sold_30d",
          "sold_7d",
        ]),
        sort_direction: s.stringEnum("Direction used to sort search results.", ["asc", "desc"]),
        page: pageSchema,
        page_size: pageSizeSchema,
      },
      {
        optional: [
          "keyword",
          "category",
          "seller_type",
          "min_price",
          "max_price",
          "min_rating",
          "max_rating",
          "min_sold_7d",
          "max_sold_7d",
          "min_sold_30d",
          "max_sold_30d",
          "free_shipping",
          "sort_field",
          "sort_direction",
          "page",
          "page_size",
        ],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description:
      "Retrieve a TikTok Shop product from Chuhaijiang with product, shop, pricing, sales, and category details.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for retrieving one TikTok Shop product from Chuhaijiang.",
      {
        product_id: productIdSchema,
        country: countrySchema,
        include: s.array(
          "Optional related sections to include in the product detail.",
          s.stringEnum("A related product-detail section.", ["channel", "core"]),
          { maxItems: 2 },
        ),
      },
      { optional: ["include"] },
    ),
    outputSchema: productOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_product_creators",
    operationType: "read",
    description: "List TikTok creators associated with a product in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: relatedProductInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_product_videos",
    operationType: "read",
    description: "List TikTok videos associated with a product in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: relatedProductInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_product_lives",
    operationType: "read",
    description: "List TikTok live streams associated with a product in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: relatedProductInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_product_reviews",
    operationType: "read",
    description: "List TikTok Shop reviews associated with a product in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: relatedProductInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_similar_products",
    operationType: "read",
    description: "List TikTok products similar to a selected product in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: relatedProductInputSchema,
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_top_selling_products",
    operationType: "read",
    description:
      "List TikTok Shop products ranked by sales for a selected market and statistics period in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: s.object(
      "Market, period, filters, sorting, and pagination for the Chuhaijiang top-selling product ranking.",
      {
        ...rankingCommonProperties,
        date: rankingDateSchema,
        granularity: rankingGranularitySchema,
        sort_field: s.stringEnum("Product field used to sort the sales ranking.", [
          "gmv_growth_rate",
          "interval_gmv",
          "interval_sold_count",
          "sold_count_growth_rate",
          "total_gmv",
          "total_sold_count",
        ]),
        sort_direction: s.stringEnum("Direction used to sort the sales ranking.", ["asc", "desc"]),
      },
      {
        optional: ["category", "seller_type", "sort_field", "sort_direction", "page", "page_size"],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_most_promoted_products",
    operationType: "read",
    description:
      "List TikTok Shop products most heavily promoted by creators, videos, and live streams in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: s.object(
      "Market, period, filters, sorting, and pagination for the Chuhaijiang most-promoted product ranking.",
      {
        ...rankingCommonProperties,
        date: rankingDateSchema,
        granularity: rankingGranularitySchema,
        sort_field: s.stringEnum("Product field used to sort the promotion ranking.", [
          "interval_gmv",
          "interval_sold_count",
          "live_count",
          "live_user_count",
          "related_creator_count",
          "video_play_count",
        ]),
        sort_direction: s.stringEnum("Direction used to sort the promotion ranking.", ["asc", "desc"]),
      },
      {
        optional: ["category", "seller_type", "sort_field", "sort_direction", "page", "page_size"],
      },
    ),
    outputSchema: listOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_new_arrival_products",
    operationType: "read",
    description: "List recently launched TikTok Shop products that are quickly gaining sales in Chuhaijiang.",
    requiredScopes: [],
    inputSchema: s.object(
      "Market, listing-date filters, sorting, and pagination for the Chuhaijiang new-arrival product ranking.",
      {
        ...rankingCommonProperties,
        listed_from: s.string("Earliest product listing date in YYYYMMDD format.", {
          pattern: "^[0-9]{8}$",
        }),
        listed_to: s.string("Latest product listing date in YYYYMMDD format.", {
          pattern: "^[0-9]{8}$",
        }),
        product_status: s.stringEnum("Chuhaijiang product status option used to filter results.", ["1", "2", "3", "4"]),
        sort_field: s.stringEnum("Product field used to sort the new-arrival ranking.", [
          "gmv_3d",
          "sold_count_3d",
          "total_gmv",
          "total_sold_count",
        ]),
        sort_direction: s.stringEnum("Direction used to sort the new-arrival ranking.", ["asc", "desc"]),
      },
      {
        optional: [
          "category",
          "seller_type",
          "listed_from",
          "listed_to",
          "product_status",
          "sort_field",
          "sort_direction",
          "page",
          "page_size",
        ],
      },
    ),
    outputSchema: listOutputSchema,
  }),
];
