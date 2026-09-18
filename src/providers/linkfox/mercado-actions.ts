import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const strictObject = (
  description: string,
  properties: Record<string, JsonSchema>,
  options?: { required?: string[]; optional?: string[] },
): JsonSchema => s.object(description, properties, options ?? { required: Object.keys(properties) });

const outputSchema = s.looseObject("Mercado Libre supplier results returned through LinkFox.", {
  toolName: s.string("The supplier tool that was called."),
  data: s.anyOf("The supplier business result: usually formatted text, or a JSON object or array.", [
    s.string("Formatted supplier result text."),
    s.looseObject("Structured supplier result data."),
    s.array("Supplier result records.", s.unknown("A supplier result item.")),
  ]),
  charged: s.optional(s.boolean("Whether the supplier tool is chargeable.")),
  contentText: s.optional(s.string("The original concatenated MCP text content.")),
  textParsedAsJson: s.optional(s.boolean("Whether the text was parsed as JSON, including JSON-encoded strings.")),
  rawResponse: s.optional(s.looseObject("The original MCP result; the gateway may return an empty object.")),
  total: s.optional(s.integer("The result count when the gateway can infer it.")),
  costToken: s.optional(s.number("The actual LinkFox token cost; zero for free tools.")),
  costTime: s.optional(s.integer("The upstream elapsed time in milliseconds.")),
});
const range = (description: string) =>
  strictObject(description, {
    start: s.optional(s.number("The inclusive lower boundary.")),
    end: s.optional(s.number("The inclusive upper boundary.")),
  });
const keywordSort = strictObject("The keyword sort criterion.", {
  key: s.stringEnum("The keyword metric to sort by.", ["sale30", "item_total_count", "visit30", "view_count"]),
  order: s.stringEnum("The keyword sort direction.", ["ascending", "descending"]),
});
interface MercadoOperation {
  toolName: string;
  usage: number;
  marketplace: boolean;
  action: ProviderActionDefinition;
}
function operation<const T extends string>(
  name: T,
  operationType: ActionDefinition["operationType"],
  toolName: string,
  description: string,
  inputSchema: JsonSchema,
  usage: number,
  marketplace = true,
): MercadoOperation {
  return {
    toolName,
    usage,
    marketplace,
    action: defineProviderAction("linkfox", { name, operationType, description, inputSchema, outputSchema }),
  };
}

export const mercadoOperations: MercadoOperation[] = [
  operation(
    "get_mercado_item",
    "read",
    "itemInfo",
    "Get Mercado Libre product details through LinkFox.",
    strictObject("Get Mercado Libre product details parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      itemId: s.string("The Mercado Libre item ID, such as MLM178237632.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "get_mercado_item_history",
    "read",
    "itemHistory",
    "Get Mercado Libre product sales history through LinkFox.",
    strictObject("Get Mercado Libre product sales history parameters.", {
      itemId: s.string("The Mercado Libre item ID, such as MLM178237632.", { minLength: 1 }),
      productId: s.optional(s.string("The Mercado Libre catalog product ID, such as MLM21333.")),
    }),
    16000,
  ),
  operation(
    "search_mercado_items",
    "read",
    "itemSearch",
    "Search Mercado Libre products with commercial filters through LinkFox.",
    strictObject("Search Mercado Libre products with commercial filters parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      title: s.optional(s.string("Search keywords matched against the product title.")),
      categoryId: s.optional(s.string("The Mercado Libre category ID.")),
      sellerId: s.optional(s.string("The seller ID; item search also accepts a seller name.")),
      itemUrl: s.optional(s.string("The Mercado Libre product URL.")),
      priceBegin: s.optional(s.integer("The minimum product price.")),
      priceEnd: s.optional(s.integer("The maximum product price.")),
      soldTotalBegin: s.optional(s.integer("The minimum lifetime units sold.")),
      soldTotalEnd: s.optional(s.integer("The maximum lifetime units sold.")),
      sale30Start: s.optional(s.integer("The minimum units sold in 30 days.")),
      sale30End: s.optional(s.integer("The maximum units sold in 30 days.")),
      scoreStart: s.optional(s.number("The minimum product rating.")),
      scoreEnd: s.optional(s.number("The maximum product rating.")),
      commentBegin: s.optional(s.integer("The minimum review count.")),
      commentEnd: s.optional(s.integer("The maximum review count.")),
      weightStart: s.optional(s.integer("The minimum product weight in grams.")),
      weightEnd: s.optional(s.integer("The maximum product weight in grams.")),
      startTimeAdded: s.optional({
        type: "integer",
        enum: [15, 30, 60, 90, 180, 365],
        description: "The listing age window in days.",
      }),
      startTimeBegin: s.optional(s.string("The earliest listing date in yyyy-MM-dd format.", { format: "date" })),
      startTimeEnd: s.optional(s.string("The latest listing date in yyyy-MM-dd format.", { format: "date" })),
      storageType: s.optional(
        s.stringEnum("The warehouse type: None all, FULL official warehouse, CBT cross-border, LOCAL self-fulfilled.", [
          "None",
          "FULL",
          "CBT",
          "LOCAL",
        ]),
      ),
      sellerType: s.optional(
        s.stringEnum(
          "The seller type; LOCAL local, CBT cross-border, None all, CBT_OTHER remote cross-border, CBT_FBM full cross-border, where supported.",
          ["None", "LOCAL", "CBT"],
        ),
      ),
      follow: s.optional({
        type: "integer",
        enum: [0, 1],
        description: "Whether the product follows an existing listing: 0 no, 1 yes.",
      }),
      isUsaFull: s.optional(s.boolean("Whether the product uses a US forwarding warehouse.")),
      itemStatus: s.optional(s.stringEnum("The product status.", ["active", "paused"])),
      sortKey: s.optional(
        s.stringEnum("The supplier sort field.", [
          "title",
          "price",
          "sale7",
          "sale30d",
          "sold_quantity",
          "sales_amount30",
          "available_quantity",
          "start_time",
          "brand_id",
          "bsr",
        ]),
      ),
      sortOrder: s.optional(s.stringEnum("The sort direction. Default: desc.", ["asc", "desc"])),
      pageNo: s.optional(s.integer("The page number, starting at 1. Default: 1.", { minimum: 1 })),
      pageSize: s.optional(s.integer("The number of records per page. Default: 50.", { minimum: 1 })),
    }),
    16000,
  ),
  operation(
    "get_mercado_catalog",
    "read",
    "catalogInfo",
    "Get Mercado Libre catalog product details through LinkFox.",
    strictObject("Get Mercado Libre catalog product details parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      productId: s.string("The Mercado Libre catalog product ID, such as MLM21333.", {
        minLength: 1,
      }),
    }),
    16000,
  ),
  operation(
    "get_mercado_catalog_history",
    "read",
    "catalogHistory",
    "Get Mercado Libre catalog product sales history through LinkFox.",
    strictObject("Get Mercado Libre catalog product sales history parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      productId: s.string("The Mercado Libre catalog product ID, such as MLM21333.", {
        minLength: 1,
      }),
    }),
    16000,
  ),
  operation(
    "search_mercado_catalogs",
    "read",
    "catalogSearch",
    "Search Mercado Libre catalog products with commercial filters through LinkFox.",
    strictObject("Search Mercado Libre catalog products with commercial filters parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      searchText: s.optional(s.string("The search text; category searches accept Spanish, Portuguese, or Chinese.")),
      catalogId: s.optional(s.string("The Mercado Libre catalog product ID.")),
      categoryId: s.optional(s.string("The Mercado Libre category ID.")),
      bland: s.optional(s.string("The brand name. The upstream field is spelled bland.")),
      sellerId: s.optional(s.string("The seller ID; item search also accepts a seller name.")),
      priceVolStart: s.optional(s.integer("The minimum catalog product price.")),
      priceVolEnd: s.optional(s.integer("The maximum catalog product price.")),
      sales30VolStart: s.optional(s.integer("The minimum catalog units sold in 30 days.")),
      sales30VolEnd: s.optional(s.integer("The maximum catalog units sold in 30 days.")),
      hisVolStart: s.optional(s.integer("The minimum historical units sold.")),
      hisVolEnd: s.optional(s.integer("The maximum historical units sold.")),
      scoreVolStart: s.optional(s.string("The minimum catalog product rating, as a string.")),
      scoreVolEnd: s.optional(s.string("The maximum catalog product rating, as a string.")),
      commentVolStart: s.optional(s.integer("The minimum catalog review count.")),
      commentVolEnd: s.optional(s.integer("The maximum catalog review count.")),
      stockVolStart: s.optional(s.integer("The minimum stock quantity.")),
      stockVolEnd: s.optional(s.integer("The maximum stock quantity.")),
      weightStart: s.optional(s.integer("The minimum product weight in grams.")),
      weightEnd: s.optional(s.integer("The maximum product weight in grams.")),
      bsrVolStart: s.optional(s.integer("The minimum BSR rank.")),
      bsrVolEnd: s.optional(s.integer("The maximum BSR rank.")),
      followVol: s.optional({
        type: "integer",
        enum: [0, 1],
        description: "Whether the catalog product follows an existing listing: 0 no, 1 yes.",
      }),
      isUsaFull: s.optional(s.boolean("Whether the product uses a US forwarding warehouse.")),
      storageTypeVol: s.optional(
        s.stringEnum("The catalog warehouse type: FULL official warehouse, CBT cross-border, LOCAL local.", [
          "FULL",
          "CBT",
          "LOCAL",
        ]),
      ),
      sellerTypeVol: s.optional(
        s.stringEnum("The catalog seller type: LOCAL local, CBT cross-border.", ["LOCAL", "CBT"]),
      ),
      storeStatusVol: s.optional(s.stringEnum("The catalog product status.", ["active", "paused"])),
      sortKey: s.optional(s.stringEnum("The supplier sort field.", ["sold_his", "price", "sale30d", "sale7", "bsr"])),
      sortOrder: s.optional(s.stringEnum("The sort direction. Default: desc.", ["asc", "desc"])),
      pageNo: s.optional(s.integer("The page number, starting at 1. Default: 1.", { minimum: 1 })),
      pageSize: s.optional(
        s.integer("The number of records per page. Default: 50. Maximum: 200.", {
          minimum: 1,
          maximum: 200,
        }),
      ),
      month: s.optional(s.string("The reporting month in YYYYMM format.", { minLength: 6, maxLength: 6 })),
      addedVol: s.optional(s.integer("The listing age window in days, for example 15, 30, 60, 90, 180, or 365.")),
    }),
    16000,
  ),
  operation(
    "search_mercado_daily_keywords",
    "read",
    "keywordDateSearch",
    "Search daily Mercado Libre trending keywords through LinkFox.",
    strictObject("Search daily Mercado Libre trending keywords parameters. Maximum pagination depth: 10000.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      runDate: s.string("The search date in YYYYMMDD format.", { minLength: 8, maxLength: 8 }),
      categoryId: s.optional(s.string("The Mercado Libre category ID.")),
      searchText: s.optional(s.string("The search text; category searches accept Spanish, Portuguese, or Chinese.")),
      sort: s.optional(keywordSort),
      sale30: s.optional(range("The 30-day units sold range; either boundary may be omitted.")),
      visit30: s.optional(range("The visits range; either boundary may be omitted.")),
      totalItem: s.optional(range("The product count range; either boundary may be omitted.")),
      adCount: s.optional(range("The advertisement count range; either boundary may be omitted.")),
      pageNo: s.optional(s.integer("The page number, starting at 1. Default: 1.", { minimum: 1 })),
      pageSize: s.optional(s.integer("The number of records per page. Default: 50.", { minimum: 1 })),
    }),
    16000,
  ),
  operation(
    "search_mercado_monthly_keywords",
    "read",
    "keywordMonthSearch",
    "Search monthly Mercado Libre trending keywords through LinkFox.",
    strictObject("Search monthly Mercado Libre trending keywords parameters. Maximum pagination depth: 10000.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      runMonth: s.string("The search month in YYYYMM format.", { minLength: 6, maxLength: 6 }),
      categoryId: s.optional(s.string("The Mercado Libre category ID.")),
      searchText: s.optional(s.string("The search text; category searches accept Spanish, Portuguese, or Chinese.")),
      sort: s.optional(keywordSort),
      sale30: s.optional(range("The 30-day units sold range; either boundary may be omitted.")),
      visit30: s.optional(range("The visits range; either boundary may be omitted.")),
      totalItem: s.optional(range("The product count range; either boundary may be omitted.")),
      pageNo: s.optional(s.integer("The page number, starting at 1. Default: 1.", { minimum: 1 })),
      pageSize: s.optional(s.integer("The number of records per page. Default: 50.", { minimum: 1 })),
    }),
    16000,
  ),
  operation(
    "reverse_search_mercado_item_keywords",
    "read",
    "keywordReverse",
    "Find keywords driving traffic to a Mercado Libre product through LinkFox.",
    strictObject("Find keywords driving traffic to a Mercado Libre product parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      itemId: s.string("The Mercado Libre item ID, such as MLM178237632.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "search_mercado_categories",
    "read",
    "categorySearch",
    "Search Mercado Libre categories through LinkFox.",
    strictObject("Search Mercado Libre categories parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      searchText: s.string("The search text; category searches accept Spanish, Portuguese, or Chinese.", {
        minLength: 1,
      }),
    }),
    0,
  ),
  operation(
    "search_mercado_leaf_categories",
    "read",
    "categorySmallSearch",
    "Search Mercado Libre leaf categories through LinkFox.",
    strictObject("Search Mercado Libre leaf categories parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
      searchText: s.string("The search text; category searches accept Spanish, Portuguese, or Chinese.", {
        minLength: 1,
      }),
    }),
    0,
  ),
  operation(
    "list_mercado_top_brands",
    "read",
    "trendBrandTopBrand",
    "Get top brands in a Mercado Libre category through LinkFox.",
    strictObject("Get top brands in a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "list_mercado_top_items",
    "read",
    "trendBrandTopItem",
    "Get top products in a Mercado Libre category through LinkFox.",
    strictObject("Get top products in a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "list_mercado_top_sellers",
    "read",
    "trendBrandTopSeller",
    "Get top sellers in a Mercado Libre category through LinkFox.",
    strictObject("Get top sellers in a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "get_mercado_new_item_opportunities",
    "read",
    "trendNewItems",
    "Get new product opportunities in a Mercado Libre category through LinkFox.",
    strictObject("Get new product opportunities in a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "get_mercado_category_price_distribution",
    "read",
    "trendPrice",
    "Get the price distribution in a Mercado Libre category through LinkFox.",
    strictObject("Get the price distribution in a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "get_mercado_category_sales_history",
    "read",
    "trendSoldHis",
    "Get sales history for a Mercado Libre category through LinkFox.",
    strictObject("Get sales history for a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "get_mercado_category_statistics",
    "read",
    "trendStatistical",
    "Get summary statistics for a Mercado Libre category through LinkFox.",
    strictObject("Get summary statistics for a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
    }),
    16000,
  ),
  operation(
    "get_mercado_category_sales_distribution",
    "read",
    "trendSale",
    "Get the sales distribution in a Mercado Libre category through LinkFox.",
    strictObject("Get the sales distribution in a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
      month: s.optional(s.string("The reporting month in YYYYMM format.", { minLength: 6, maxLength: 6 })),
    }),
    16000,
  ),
  operation(
    "get_mercado_category_inventory_types",
    "read",
    "trendStoreInventoryType",
    "Get warehouse type distribution in a Mercado Libre category through LinkFox.",
    strictObject("Get warehouse type distribution in a Mercado Libre category parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      categoryId: s.string("The Mercado Libre category ID.", { minLength: 1 }),
      month: s.optional(s.string("The reporting month in YYYYMM format.", { minLength: 6, maxLength: 6 })),
    }),
    16000,
  ),
  operation(
    "search_mercado_sellers",
    "read",
    "sellerSearch",
    "Search Mercado Libre sellers by type and reputation through LinkFox.",
    strictObject("Search Mercado Libre sellers by type and reputation parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC", "MCO"],
      ),
      sellerType: s.optional(
        s.stringEnum(
          "The seller type; LOCAL local, CBT cross-border, None all, CBT_OTHER remote cross-border, CBT_FBM full cross-border, where supported.",
          ["LOCAL", "CBT", "CBT_OTHER", "CBT_FBM"],
        ),
      ),
      levelId: s.optional(
        s.stringEnum("The seller reputation level: 5_green, 4_light_green, or 3_yellow.", [
          "5_green",
          "4_light_green",
          "3_yellow",
        ]),
      ),
      powerType: s.optional(s.stringEnum("The seller quality tier.", ["platinum", "gold", "silver"])),
      pageNo: s.optional(s.integer("The page number, starting at 1. Default: 1.", { minimum: 1 })),
      pageSize: s.optional(s.integer("The number of records per page. Default: 50.", { minimum: 1 })),
    }),
    16000,
  ),
  operation(
    "list_mercado_item_reviews",
    "read",
    "reviewSearch",
    "Get reviews for a Mercado Libre product through LinkFox.",
    strictObject("Get reviews for a Mercado Libre product parameters.", {
      itemId: s.string("The Mercado Libre item ID, such as MLM178237632.", { minLength: 1 }),
      pageNo: s.optional(s.integer("The page number, starting at 1. Default: 1.", { minimum: 1 })),
      pageSize: s.optional(s.integer("The number of records per page. Default: 50.", { minimum: 1 })),
    }),
    0,
  ),
  operation(
    "get_mercado_exchange_rate",
    "read",
    "rateInfo",
    "Get the exchange rate for a Mercado Libre market through LinkFox.",
    strictObject("Get the exchange rate for a Mercado Libre market parameters.", {
      siteId: s.stringEnum(
        "The Mercado Libre site: MLM Mexico, MLB Brazil, MLA Argentina, MLC Chile; MCO Colombia is supported only where listed.",
        ["MLM", "MLB", "MLA", "MLC"],
      ),
    }),
    0,
  ),
  operation(
    "get_mercado_account_usage",
    "read",
    "myUsage",
    "Get the connected supplier account package and usage information through LinkFox.",
    strictObject("Get the connected supplier account package and usage information parameters.", {}),
    0,
    false,
  ),
] as const;

export const mercadoActions: ProviderActionDefinition[] = mercadoOperations.map(({ action }) => action);
