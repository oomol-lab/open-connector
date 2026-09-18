import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sorftime_mcp";

const amazonSites = ["US", "GB", "DE", "FR", "IN", "CA", "JP", "ES", "IT", "MX", "AE", "AU", "BR", "SA"];
const keywordSites = amazonSites.filter((site) => site !== "IN");
const amazonSite = s.stringEnum("Amazon marketplace region. GB denotes the United Kingdom.", amazonSites);
const amazonKeywordSite = s.stringEnum(
  "Amazon keyword marketplace region. GB denotes the United Kingdom.",
  keywordSites,
);
const shopeeSite = s.stringEnum("Shopee marketplace region.", ["VN", "ID", "SG", "TH", "MY", "TW", "PH", "BR"]);
const tiktokSite = s.stringEnum("TikTok marketplace region. GB denotes the United Kingdom.", [
  "US",
  "MY",
  "PH",
  "VN",
  "TH",
  "ID",
  "GB",
  "JP",
]);
const temuSite = s.stringEnum("Temu marketplace region.", ["US", "EU"]);
const page = s.optional(
  s.positiveInteger("Page number starting at 1. Omit for the first page; page sizes are determined by Sorftime."),
);
const productId = s.nonEmptyString("Product identifier returned by the platform's product search.");
const categoryId = s.nonEmptyString(
  "Category identifier returned by the platform's category tree; use a leaf category for reports.",
);
const parentId = s.optional(
  s.nonEmptyString("Parent category identifier. Omit to start at the top of the category tree."),
);
const keyword = s.nonEmptyString("Keyword to research.");
const dateRange = {
  startDate: s.optional(s.date("Start of the historical range. Omit for the provider's default range.")),
  endDate: s.optional(s.date("End of the historical range. Omit for the latest available data.")),
};

const outputSchema = s.object(
  "Structured research data with the provider's field explanations and response metadata.",
  {
    data: s.unknown(
      "Decoded research result. Product and category fields remain provider-defined; plain text and non-text content are preserved when returned.",
    ),
    fieldDescriptions: s.unknown(
      "Sorftime's field documentation, including units and sentinel values, or null when absent.",
    ),
    metadata: s.record(
      "Additional response fields supplied by Sorftime.",
      s.unknown("An additional provider response value."),
    ),
  },
);

function action(
  name: string,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
) {
  return defineProviderAction(service, {
    name,
    operationType,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

export const sorftimeMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description: "List all tools available to your Sorftime MCP account with their descriptions and argument schemas.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current Sorftime MCP tool catalog.", {
      tools: s.array(
        "Available tools and their current contracts.",
        s.object("One tool exposed by Sorftime MCP.", {
          name: s.nonEmptyString("Exact tool name to pass to call_tool."),
          description: s.optional(s.string("Tool description supplied by Sorftime.")),
          inputSchema: s.looseObject("Live JSON Schema for this tool's arguments."),
          annotations: s.optional(
            s.looseObject("Optional upstream behavior hints; these are not guarantees of safety."),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Run a tool from list_tools with its required arguments. Supports research queries and changes to favorites, including deletion. Credit cost depends on the tool.",
    requiredScopes: [],
    inputSchema: s.object("Invoke one current Sorftime MCP tool.", {
      toolName: s.nonEmptyString("Exact tool name returned by list_tools."),
      arguments: s.optional(
        s.record(
          "Arguments matching the selected tool's live inputSchema. Omit for a tool with no arguments.",
          s.unknown("A tool-specific argument value."),
        ),
      ),
    }),
    outputSchema: s.object("The result returned by the selected Sorftime MCP tool.", {
      result: s.unknown("Structured MCP content when available, otherwise the complete MCP content envelope."),
    }),
  }),
  action(
    "ali1688_search_products",
    "read",
    "Search 1688 products by name to find sourcing suppliers and procurement prices.",
    s.object("Research parameters for 1688.", {
      query: s.nonEmptyString("Product name or search phrase."),
      page,
    }),
  ),
  action(
    "ali1688_get_product",
    "read",
    "Inspect one 1688 product using its ID from ali1688_search_products.",
    s.object("Research parameters for 1688.", {
      productId,
    }),
  ),
  action(
    "ali1688_list_categories",
    "read",
    "Browse 1688 categories. Omit parentId for the top levels, then pass a returned category ID to explore its children.",
    s.object("Research parameters for 1688.", {
      parentId,
    }),
  ),
  action(
    "amazon_search_products",
    "read",
    "Find Amazon products by name.",
    s.object("Research parameters for Amazon.", {
      site: amazonSite,
      query: s.nonEmptyString("Product name or search phrase."),
      page,
    }),
  ),
  action(
    "amazon_get_product",
    "read",
    "Inspect one Amazon product using its ID from amazon_search_products.",
    s.object("Research parameters for Amazon.", {
      site: amazonSite,
      productId: s.nonEmptyString("Amazon ASIN returned by amazon_search_products."),
    }),
  ),
  action(
    "amazon_get_product_trend",
    "read",
    "Inspect historical Amazon product performance. Select one metric.",
    s.object("Research parameters for Amazon.", {
      site: amazonSite,
      productId: s.nonEmptyString("Amazon ASIN returned by amazon_search_products."),
      metric: s.stringEnum("Historical metric to query.", [
        "sales_volume",
        "sales_amount",
        "price",
        "rank",
        "subcategory_rank",
      ]),
    }),
  ),
  action(
    "amazon_list_categories",
    "read",
    "Browse Amazon categories. Omit parentId for the top levels, then pass a returned category ID to explore its children.",
    s.object("Research parameters for Amazon.", {
      site: amazonSite,
      parentId,
    }),
  ),
  action(
    "amazon_get_category_report",
    "read",
    "Research an Amazon category market using a category ID from amazon_list_categories.",
    s.object("Research parameters for Amazon.", {
      site: amazonSite,
      categoryId,
    }),
  ),
  action(
    "amazon_list_keywords",
    "read",
    "Discover Amazon keywords ranked by weekly search volume. Supports optional rank and search-volume bounds.",
    s.object("Research parameters for Amazon.", {
      site: amazonKeywordSite,
      page,
      minRank: s.optional(s.positiveInteger("Minimum weekly search-volume rank, inclusive.")),
      maxRank: s.optional(s.positiveInteger("Maximum weekly search-volume rank, inclusive.")),
      minSearchVolume: s.optional(s.nonNegativeInteger("Minimum monthly search volume, inclusive.")),
      maxSearchVolume: s.optional(s.nonNegativeInteger("Maximum monthly search volume, inclusive.")),
    }),
  ),
  action(
    "amazon_get_keyword",
    "read",
    "Inspect demand for a specific Amazon keyword.",
    s.object("Research parameters for Amazon.", {
      site: amazonKeywordSite,
      keyword,
    }),
  ),
  action(
    "amazon_find_related_keywords",
    "read",
    "Expand an Amazon keyword into related and long-tail search terms.",
    s.object("Research parameters for Amazon.", {
      site: amazonKeywordSite,
      keyword,
      page,
    }),
  ),
  action(
    "walmart_search_products",
    "read",
    "Find Walmart US products by name.",
    s.object("Research parameters for Walmart US.", {
      query: s.nonEmptyString("Product name or search phrase."),
      page,
    }),
  ),
  action(
    "walmart_get_product",
    "read",
    "Inspect one Walmart US product using its ID from walmart_search_products.",
    s.object("Research parameters for Walmart US.", {
      productId,
    }),
  ),
  action(
    "walmart_get_product_trend",
    "read",
    "Inspect historical Walmart US product performance. Select one metric.",
    s.object("Research parameters for Walmart US.", {
      productId,
      metric: s.stringEnum("Historical metric to query.", [
        "sales_volume",
        "sales_amount",
        "price",
        "rank",
        "reviews",
        "rating",
      ]),
      ...dateRange,
    }),
  ),
  action(
    "walmart_list_categories",
    "read",
    "Browse Walmart US categories. Omit parentId for the top levels, then pass a returned category ID to explore its children.",
    s.object("Research parameters for Walmart US.", {
      parentId,
    }),
  ),
  action(
    "walmart_get_category_report",
    "read",
    "Research a Walmart US category market using a category ID from walmart_list_categories.",
    s.object("Research parameters for Walmart US.", {
      categoryId,
    }),
  ),
  action(
    "walmart_list_keywords",
    "read",
    "Discover Walmart US keywords ranked by monthly search volume. Requires minRank and maxRank.",
    s.object("Research parameters for Walmart US.", {
      page,
      minRank: s.positiveInteger("Minimum monthly search rank, inclusive."),
      maxRank: s.positiveInteger("Maximum monthly search rank, inclusive."),
    }),
  ),
  action(
    "walmart_get_keyword",
    "read",
    "Inspect demand for a specific Walmart US keyword.",
    s.object("Research parameters for Walmart US.", {
      keyword,
    }),
  ),
  action(
    "walmart_find_related_keywords",
    "read",
    "Expand a Walmart US keyword into related and long-tail search terms.",
    s.object("Research parameters for Walmart US.", {
      keyword,
      page,
    }),
  ),
  action(
    "shopee_search_products",
    "read",
    "Find Shopee products by name.",
    s.object("Research parameters for Shopee.", {
      site: shopeeSite,
      query: s.nonEmptyString("Product name or search phrase."),
      page,
    }),
  ),
  action(
    "shopee_get_product",
    "read",
    "Inspect one Shopee product using its ID from shopee_search_products.",
    s.object("Research parameters for Shopee.", {
      site: shopeeSite,
      productId,
    }),
  ),
  action(
    "shopee_get_product_trend",
    "read",
    "Inspect historical Shopee product performance. Returns available dimensions together. Ranges beyond one year cost 10 credits.",
    s.object("Research parameters for Shopee.", {
      site: shopeeSite,
      productId,
      ...dateRange,
    }),
  ),
  action(
    "shopee_list_categories",
    "read",
    "Browse Shopee categories. Omit parentId for the top levels, then pass a returned category ID to explore its children.",
    s.object("Research parameters for Shopee.", {
      site: shopeeSite,
      parentId,
    }),
  ),
  action(
    "shopee_list_category_products",
    "read",
    "Find best-selling products in a Shopee category. Optionally query historical natural-week snapshots for leaf categories.",
    s.object("Research parameters for Shopee.", {
      site: shopeeSite,
      categoryId,
      page,
      date: s.optional(s.date("Date within the historical natural week; supported only for leaf categories.")),
    }),
  ),
  action(
    "shopee_list_keywords",
    "read",
    "Discover Shopee keywords ranked by monthly search volume. Supports optional rank and search-volume bounds.",
    s.object("Research parameters for Shopee.", {
      site: shopeeSite,
      page,
      query: s.optional(s.nonEmptyString("Narrow the trending list to this keyword.")),
      minRank: s.optional(s.positiveInteger("Minimum monthly search rank, inclusive.")),
      maxRank: s.optional(s.positiveInteger("Maximum monthly search rank, inclusive.")),
      minSearchVolume: s.optional(s.nonNegativeInteger("Minimum monthly search volume, inclusive.")),
      maxSearchVolume: s.optional(s.nonNegativeInteger("Maximum monthly search volume, inclusive.")),
    }),
  ),
  action(
    "tiktok_search_products",
    "read",
    "Find TikTok products by name.",
    s.object("Research parameters for TikTok.", {
      site: tiktokSite,
      query: s.nonEmptyString(
        "Product name or search phrase. For all_words/any_word modes, separate keywords with commas.",
      ),
      page,
      match: s.optional(
        s.stringEnum("TikTok product title matching mode; defaults to semantic search.", [
          "semantic",
          "all_words",
          "any_word",
          "exact",
        ]),
      ),
    }),
  ),
  action(
    "tiktok_get_product",
    "read",
    "Inspect one TikTok product using its ID from tiktok_search_products.",
    s.object("Research parameters for TikTok.", {
      site: tiktokSite,
      productId,
    }),
  ),
  action(
    "tiktok_get_product_trend",
    "read",
    "Inspect historical TikTok product performance. Returns available dimensions together.",
    s.object("Research parameters for TikTok.", {
      site: tiktokSite,
      productId,
    }),
  ),
  action(
    "tiktok_list_categories",
    "read",
    "Browse TikTok categories. Omit parentId for the top levels, then pass a returned category ID to explore its children.",
    s.object("Research parameters for TikTok.", {
      site: tiktokSite,
      parentId,
    }),
  ),
  action(
    "tiktok_get_category_report",
    "read",
    "Research a TikTok category market using a category ID from tiktok_list_categories.",
    s.object("Research parameters for TikTok.", {
      site: tiktokSite,
      categoryId,
    }),
  ),
  action(
    "temu_search_products",
    "read",
    "Find Temu products by name.",
    s.object("Research parameters for Temu.", {
      site: temuSite,
      query: s.nonEmptyString("Product name or search phrase."),
      page,
    }),
  ),
  action(
    "temu_get_product",
    "read",
    "Inspect one Temu product using its ID from temu_search_products.",
    s.object("Research parameters for Temu.", {
      site: temuSite,
      productId,
    }),
  ),
  action(
    "temu_get_product_trend",
    "read",
    "Inspect historical Temu product performance. Returns available dimensions together. Ranges beyond one year cost 10 credits.",
    s.object("Research parameters for Temu.", {
      site: temuSite,
      productId,
      ...dateRange,
    }),
  ),
  action(
    "temu_list_categories",
    "read",
    "Browse Temu categories. Omit parentId for the top levels, then pass a returned category ID to explore its children.",
    s.object("Research parameters for Temu.", {
      site: temuSite,
      parentId,
    }),
  ),
  action(
    "temu_list_category_products",
    "read",
    "Find best-selling products in a Temu category.",
    s.object("Research parameters for Temu.", {
      site: temuSite,
      categoryId,
      page,
    }),
  ),
];
