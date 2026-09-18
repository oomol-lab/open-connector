import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const literal = (description: string, value: string | number | boolean): JsonSchema =>
  s.literal(value, { description });

const strictObject = (
  description: string,
  properties: Record<string, JsonSchema>,
  options?: { required?: string[]; optional?: string[] },
): JsonSchema => s.object(description, properties, options ?? { required: Object.keys(properties) });

interface SeerfarOperation {
  path: string;
  usage: number;
  action: ProviderActionDefinition;
}
function operation<const TName extends string>(
  name: TName,
  operationType: ActionDefinition["operationType"],
  path: string,
  usage: number,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): SeerfarOperation {
  return {
    path,
    usage,
    action: defineProviderAction("linkfox", { name, operationType, description, inputSchema, outputSchema }),
  };
}
const pageSchema = s.object("Pagination and sorting.", {
  page: s.optional(s.integer("The result page, starting at 1.", { minimum: 1, default: 1 })),
  pageSize: s.optional(s.integer("Records per page; at most 20.", { minimum: 1, default: 20, maximum: 20 })),
  orders: s.optional(
    s.array(
      "Sort rules.",
      s.object("One supplier sort rule.", {
        field: s.nonEmptyString("A response metric such as sales, price, revenue or reviewRating."),
        direction: s.stringEnum("Sort direction.", ["DESC", "ASC"]),
      }),
    ),
  ),
});
const dateSchema = s.string("A historical month in YYYY-MM format.", {
  pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$",
});
const uIdSchema = s.string("The supplier user ID.", { maxLength: 1000 });
const memberIdSchema = s.string("The member ID that owns the supplier data.", { maxLength: 1000 });
const costTokenSchema = s.number("The LinkFox token usage when returned.");
const costTimeSchema = s.integer("The request duration in milliseconds.");
const typeSchema = s.string("The supplier display type.");
const columnsSchema = s.array("Supplier display columns.", s.looseObject("A display column.", {}));
const totalSchema = s.integer("The number of records on this page, not the overall product count.");
const dataSchema = s.array(
  "Returned supplier records with original metrics and currency units.",
  s.looseObject("A supplier record.", {}),
);
const productsSchema = s.array(
  "Product records, duplicated in data; do not count both arrays.",
  s.looseObject("A supplier product record.", {}),
);
const totalSalesSchema = s.number("Total sales units in the statistics window.");
const totalRevenueSchema = s.number("Total revenue in RUB.");
const ratingSchema = s.number("Average rating.");
const startDateSchema = s.string("The actual statistics start date.");
const endDateSchema = s.string("The actual statistics end date.");
const hasNextPageSchema = s.boolean("Whether another result page is available.");
const pageSchema2 = s.object("Pagination and sorting.", {
  page: s.optional(s.integer("The result page, starting at 1.", { minimum: 1, default: 1 })),
  pageSize: s.optional(s.integer("Records per page.", { minimum: 1, default: 20 })),
  orders: s.optional(
    s.array(
      "Sort rules.",
      s.object("One supplier sort rule.", {
        field: s.nonEmptyString("A response metric such as sales, price, revenue or reviewRating."),
        direction: s.stringEnum("Sort direction.", ["DESC", "ASC"]),
      }),
    ),
  ),
});
const matchTypeSchema = s.anyOf("Keyword match mode: 0 exact, 1 fuzzy.", [
  literal("The integer value 0.", 0),
  literal("The integer value 1.", 1),
]);
const includeKeywordsSchema = s.array("Keywords to include.", s.string("An array entry."), {
  maxItems: 1000,
});
const excludeKeywordsSchema = s.array("Keywords to exclude.", s.string("An array entry."), {
  maxItems: 1000,
});
const searchVolumeSchema = s.object("Search popularity range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const searchChange30Schema = s.object("30-day search growth range; negative values are allowed.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const wordCountSchema = s.object("Keyword word count range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const productViewsSchema = s.object("Product view count range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const productsSchema2 = s.object("Product count range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const sellersSchema = s.object("Seller count range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const marketSpaceSchema = s.object("Market space range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const conversionSharingSchema = s.object("Conversion concentration range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const uniqQueriesWCaSchema = s.object("Add-to-cart count range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const caSchema = s.object("Add-to-cart conversion rate range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const titleDensitySchema = s.object("Title density range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const adRivalCountSchema = s.object("Advertising competitor count range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const uIdSchema2 = s.string("The supplier user ID.");
const memberIdSchema2 = s.string("The member ID that owns the supplier data.");
const totalSchema2 = s.integer("The total matching record count across pages.");
const priceSchema = s.object("Price range in RUB.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const searchDateSchema = s.date("The query date in YYYY-MM-DD format; 2026-04-01 selects March 2026 data.");
const monthlySalesSchema = s.object("Monthly sales unit range.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const monthlyRevenueSchema = s.object("Monthly revenue range in RUB.", {
  min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
  max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
});
const dailySalesSchema = s.number("Average daily sales units.");
export const seerfarOperations: SeerfarOperation[] = [
  operation(
    "list_seerfar_ozon_category_products",
    "read",
    "/seerfar/ozon/categorySearch",
    15,
    "List Ozon category products and aggregate statistics through LinkFox and Seerfar.",
    strictObject(
      "Seerfar Ozon request parameters.",
      {
        categoryId: s.nonEmptyString("The Seerfar Ozon category ID; join category levels with underscores."),
        page: pageSchema,
        date: dateSchema,
        fulfillment: s.stringEnum("Fulfillment method.", ["FBO", "FBS", "RFBS", "FBP", "OZON"]),
        uId: uIdSchema,
        memberId: memberIdSchema,
      },
      { required: ["categoryId", "page"] },
    ),
    s.looseRequiredObject("Seerfar Ozon result with supplier metrics preserved.", {
      costToken: s.optional(costTokenSchema),
      costTime: s.optional(costTimeSchema),
      type: s.optional(typeSchema),
      columns: s.optional(columnsSchema),
      total: totalSchema,
      data: dataSchema,
      products: s.optional(productsSchema),
      totalSales: s.optional(totalSalesSchema),
      totalRevenue: s.optional(totalRevenueSchema),
      avgPrice: s.optional(s.number("Average price in RUB.")),
      rating: s.optional(ratingSchema),
      startDate: s.optional(startDateSchema),
      endDate: s.optional(endDateSchema),
      hasNextPage: s.optional(hasNextPageSchema),
      id: s.optional(s.string("The echoed category ID.")),
      sellerType: s.optional(s.looseObject("Fulfillment counts, not domestic or cross-border seller types.", {})),
      categoryInfo: s.optional(s.looseObject("Category metadata.", {})),
      seasonalityAmplitude: s.optional(s.string("Seasonality strength.")),
      seasonalityCoef: s.optional(s.string("Seasonality phase.")),
    }),
  ),
  operation(
    "reverse_search_seerfar_ozon_keywords",
    "read",
    "/seerfar/ozon/keywordBackSearch",
    23,
    "Reverse-search Ozon keywords for SKU IDs through LinkFox and Seerfar.",
    strictObject(
      "Seerfar Ozon request parameters.",
      {
        skuIds: s.array("Up to 20 SKU IDs to reverse-search.", s.integer("An Ozon SKU ID."), {
          maxItems: 20,
        }),
        hasVariant: s.anyOf("Whether to remove variants: 0 keep, 1 remove.", [
          literal("The integer value 0.", 0),
          literal("The integer value 1.", 1),
        ]),
        page: pageSchema2,
        matchType: matchTypeSchema,
        type: s.array("Search channels: 0 organic, 1 advertising.", s.stringEnum("Search channel code.", ["0", "1"])),
        historyDate: dateSchema,
        includeKeywords: includeKeywordsSchema,
        excludeKeywords: excludeKeywordsSchema,
        searchVolume: searchVolumeSchema,
        searchChange30: searchChange30Schema,
        wordCount: wordCountSchema,
        productViews: productViewsSchema,
        products: productsSchema2,
        sellers: sellersSchema,
        marketSpace: marketSpaceSchema,
        conversionSharing: conversionSharingSchema,
        uniqQueriesWCa: uniqQueriesWCaSchema,
        ca: caSchema,
        conversion: s.object("Conversion rate range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        titleDensity: titleDensitySchema,
        adRivalCount: adRivalCountSchema,
        adRank: s.object("Advertising rank range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        naturalRank: s.object("Organic search rank range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        exposure: s.object("Exposure range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        uId: uIdSchema2,
        memberId: memberIdSchema2,
      },
      { required: ["skuIds", "hasVariant", "page"] },
    ),
    s.looseRequiredObject("Seerfar Ozon result with supplier metrics preserved.", {
      costToken: s.optional(costTokenSchema),
      costTime: s.optional(costTimeSchema),
      type: s.optional(typeSchema),
      columns: s.optional(columnsSchema),
      total: totalSchema2,
      data: dataSchema,
    }),
  ),
  operation(
    "mine_seerfar_ozon_keywords",
    "read",
    "/seerfar/ozon/keywordMining",
    23,
    "Mine Ozon keywords from a seed keyword through LinkFox and Seerfar.",
    strictObject(
      "Seerfar Ozon request parameters.",
      {
        keyword: s.nonEmptyString("The seed keyword.", { maxLength: 1000 }),
        page: pageSchema2,
        matchType: matchTypeSchema,
        includeKeywords: includeKeywordsSchema,
        excludeKeywords: excludeKeywordsSchema,
        wordCount: wordCountSchema,
        searchVolume: searchVolumeSchema,
        searchChange30: searchChange30Schema,
        productViews: productViewsSchema,
        products: productsSchema2,
        sellers: sellersSchema,
        price: priceSchema,
        marketSpace: marketSpaceSchema,
        conversionSharing: conversionSharingSchema,
        relevancy: s.object("Relevance to the seed keyword range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        uniqQueriesWCa: uniqQueriesWCaSchema,
        ca: caSchema,
        titleDensity: titleDensitySchema,
        adRivalCount: adRivalCountSchema,
        uId: uIdSchema2,
        memberId: memberIdSchema2,
      },
      { required: ["keyword", "page"] },
    ),
    s.looseRequiredObject("Seerfar Ozon result with supplier metrics preserved.", {
      costToken: s.optional(costTokenSchema),
      costTime: s.optional(costTimeSchema),
      type: s.optional(typeSchema),
      columns: s.optional(columnsSchema),
      total: totalSchema2,
      data: dataSchema,
    }),
  ),
  operation(
    "search_seerfar_ozon_market_keywords",
    "read",
    "/seerfar/ozon/marketKeywordSearch",
    15,
    "Search Ozon market keywords through LinkFox and Seerfar.",
    strictObject(
      "Seerfar Ozon request parameters.",
      {
        page: pageSchema2,
        keywords: s.array("Search keywords.", s.string("An array entry."), { maxItems: 1000 }),
        matchType: matchTypeSchema,
        searchDate: searchDateSchema,
        categories: s.array("Seerfar category IDs, not category names.", s.string("An array entry."), {
          maxItems: 1000,
        }),
        searchVolume: searchVolumeSchema,
        searchChange30: searchChange30Schema,
        monthlySales: monthlySalesSchema,
        monthlyRevenue: monthlyRevenueSchema,
        price: priceSchema,
        productViews: productViewsSchema,
        products: productsSchema2,
        volume: s.object("Supplier volume metric range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        marketSpace: marketSpaceSchema,
        conversionSharing: conversionSharingSchema,
        reviews: s.object("Review count range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        ratings: s.object("Rating range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        sellers: sellersSchema,
        weight: s.object("Supplier weight metric range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        uId: uIdSchema2,
        memberId: memberIdSchema2,
      },
      { required: ["page"] },
    ),
    s.looseRequiredObject("Seerfar Ozon result with supplier metrics preserved.", {
      costToken: s.optional(costTokenSchema),
      costTime: s.optional(costTimeSchema),
      type: s.optional(typeSchema),
      columns: s.optional(columnsSchema),
      total: totalSchema2,
      data: dataSchema,
    }),
  ),
  operation(
    "get_seerfar_ozon_product",
    "read",
    "/seerfar/ozon/productDetailSearch",
    5,
    "Get an Ozon product snapshot and sales history through LinkFox and Seerfar.",
    strictObject(
      "Seerfar Ozon request parameters.",
      {
        sku: s.nonEmptyString("A single Ozon SKU as a string."),
        dateRange: {
          ...s.stringEnum("The sales statistics window; product metadata remains a current snapshot.", [
            "past_7_days",
            "past_30_days",
            "past_60_days",
            "past_90_days",
            "past_180_days",
            "past_365_days",
          ]),
          default: "past_30_days",
        },
        uId: uIdSchema,
        memberId: memberIdSchema,
      },
      { required: ["sku"] },
    ),
    s.looseRequiredObject("Seerfar Ozon result with supplier metrics preserved.", {
      costToken: s.optional(costTokenSchema),
      costTime: s.optional(costTimeSchema),
      type: s.optional(typeSchema),
      columns: s.optional(columnsSchema),
      total: s.integer("The number of matching records; product detail returns 0 or 1."),
      data: dataSchema,
      products: s.optional(productsSchema),
      totalSales: s.optional(totalSalesSchema),
      dailySales: s.optional(dailySalesSchema),
      totalRevenue: s.optional(totalRevenueSchema),
      stock: s.optional(s.number("Available stock.")),
      startDate: s.optional(startDateSchema),
      endDate: s.optional(endDateSchema),
      salesTrendVOList: s.optional(
        s.array(
          "Daily sales, revenue, price, stock and review history.",
          s.looseObject("A daily statistics record.", {}),
        ),
      ),
      categoryRanks: s.optional(s.array("Historical category ranks.", s.looseObject("A category rank record.", {}))),
    }),
  ),
  operation(
    "search_seerfar_ozon_product_reports",
    "read",
    "/seerfar/ozon/productReportSearch",
    15,
    "Search Ozon product reports with commercial filters through LinkFox and Seerfar.",
    strictObject(
      "Seerfar Ozon request parameters.",
      {
        page: pageSchema2,
        skus: s.array("Up to 10 exact SKU IDs.", s.integer("An Ozon SKU ID."), { maxItems: 10 }),
        keywords: s.array("Search keywords.", s.string("An array entry.")),
        categoryIds: s.array("Seerfar category IDs.", s.string("An array entry.")),
        sellerName: s.array("Seller names.", s.string("An array entry.")),
        brand: s.object("Brand filter.", {
          brandName: s.optional(s.array("Brand names.", s.string("An array entry."))),
          type: s.optional(
            s.anyOf("Brand mode: 0 include, 1 exclude, 2 unbranded.", [
              literal("The integer value 0.", 0),
              literal("The integer value 1.", 1),
              literal("The integer value 2.", 2),
            ]),
          ),
        }),
        fulfillment: s.array(
          "Fulfillment methods.",
          s.stringEnum("Fulfillment method.", ["FBO", "FBS", "RFBS", "FBP", "OZON"]),
        ),
        labels: s.array(
          "Product labels.",
          s.anyOf("Product label: 0 new, 1 authentic, 2 bestseller.", [
            literal("The integer value 0.", 0),
            literal("The integer value 1.", 1),
            literal("The integer value 2.", 2),
          ]),
        ),
        creationDate: s.anyOf("Listing age filter in months.", [
          literal("The integer value 1.", 1),
          literal("The integer value 3.", 3),
          literal("The integer value 6.", 6),
          literal("The integer value 12.", 12),
          literal("The integer value 24.", 24),
        ]),
        variationsMerge: s.anyOf("Whether to merge variants: 0 no, 1 yes.", [
          literal("The integer value 0.", 0),
          literal("The integer value 1.", 1),
        ]),
        searchDate: searchDateSchema,
        tag: s.string("The product tag."),
        uId: uIdSchema2,
        memberId: memberIdSchema2,
        monthlySales: monthlySalesSchema,
        monthlySalesRate: s.object("Monthly sales growth range in percent.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        monthlyRevenue: monthlyRevenueSchema,
        price: priceSchema,
        convToCartPdp: s.object("Product-page cart conversion range in percent.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        reviewRating: s.object("Product rating range from 0 to 5.", {
          min: s.optional(
            s.number("The inclusive lower bound; omit for no lower bound.", {
              minimum: 0,
              maximum: 5,
            }),
          ),
          max: s.optional(
            s.number("The inclusive upper bound; omit for no upper bound.", {
              minimum: 0,
              maximum: 5,
            }),
          ),
        }),
        reviewCount: s.object("Product review count range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        questionsAndAnswers: s.object("Question and answer count range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        variants: s.object("Variant count range.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        drr: s.object("Advertising cost share range, expressed as a ratio.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        grossMargin: s.object("Gross margin range in percent.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        returnCancellationRate: s.object("Return and cancellation rate range in percent.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        weight: s.object("Product weight range in grams.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
        volume: s.object("Product volume range in liters.", {
          min: s.optional(s.number("The inclusive lower bound; omit for no lower bound.")),
          max: s.optional(s.number("The inclusive upper bound; omit for no upper bound.")),
        }),
      },
      { required: ["page"] },
    ),
    s.looseRequiredObject("Seerfar Ozon result with supplier metrics preserved.", {
      costToken: s.optional(costTokenSchema),
      costTime: s.optional(costTimeSchema),
      type: s.optional(typeSchema),
      columns: s.optional(columnsSchema),
      total: totalSchema2,
      data: dataSchema,
      products: s.optional(productsSchema),
    }),
  ),
  operation(
    "list_seerfar_ozon_shop_products",
    "read",
    "/seerfar/ozon/shopSearch",
    15,
    "List Ozon shop products and aggregate statistics through LinkFox and Seerfar.",
    strictObject(
      "Seerfar Ozon request parameters.",
      {
        id: s.integer("The seller ID; negative values identify Ozon-operated sellers."),
        page: pageSchema,
        uId: uIdSchema,
        memberId: memberIdSchema,
      },
      { required: ["id", "page"] },
    ),
    s.looseRequiredObject("Seerfar Ozon result with supplier metrics preserved.", {
      costToken: s.optional(costTokenSchema),
      costTime: s.optional(costTimeSchema),
      type: s.optional(typeSchema),
      columns: s.optional(columnsSchema),
      total: totalSchema,
      data: dataSchema,
      products: s.optional(productsSchema),
      totalSales: s.optional(totalSalesSchema),
      totalRevenue: s.optional(totalRevenueSchema),
      dailySales: s.optional(dailySalesSchema),
      rating: s.optional(ratingSchema),
      productCount: s.optional(s.number("The overall shop product count, not the current page size.")),
      hasNextPage: s.optional(hasNextPageSchema),
      fulfillment: s.optional(s.looseObject("Shop fulfillment distribution; unlike product fulfillment arrays.", {})),
    }),
  ),
] as const;
export const seerfarActions: ProviderActionDefinition[] = seerfarOperations.map(({ action }) => action);
