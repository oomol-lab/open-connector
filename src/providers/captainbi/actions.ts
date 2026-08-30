import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "captainbi";

const trimmedString = (description: string) => s.nonEmptyString(description);

const openChannelIdSchema = trimmedString("The CaptainBI OpenChannelId returned by list_stores for the target store.");
const pageSchema = s.integer("The one-based page number. Defaults to 1.", { minimum: 1 });
const rowsSchema = s.integer("The number of records to return. Defaults to 100.", {
  minimum: 1,
  maximum: 100,
});
const timestampSchema = s.nonNegativeInteger(
  "A CaptainBI Unix timestamp in seconds or milliseconds. The start and end timestamps must use the same unit.",
);
const reportDaySchema = s.string("A report date in YYYYMMDD format.", { pattern: "^[0-9]{8}$" });

function timestampRangeInputSchema(
  description: string,
  range: "modified" | "created",
  extraFields: Record<string, Record<string, unknown>> = {},
) {
  const startField = range === "modified" ? "startModifiedTime" : "startCreateTime";
  const endField = range === "modified" ? "endModifiedTime" : "endCreateTime";
  return s.object(description, {
    openChannelId: openChannelIdSchema,
    page: s.optional(pageSchema),
    rows: s.optional(rowsSchema),
    [startField]: timestampSchema,
    [endField]: timestampSchema,
    ...extraFields,
  });
}

const storesInputSchema = s.object(
  "Pagination and optional modification window for listing authorized CaptainBI stores.",
  {
    page: s.optional(pageSchema),
    rows: s.optional(rowsSchema),
    startModifiedTime: s.optional(timestampSchema),
    endModifiedTime: s.optional(timestampSchema),
  },
);

const productRangeInputSchema = timestampRangeInputSchema(
  "The store, pagination, and modification window for listing CaptainBI products.",
  "modified",
);
const inventoryInputSchema = timestampRangeInputSchema(
  "The store, pagination, modification window, and optional product filters for CaptainBI inventory.",
  "modified",
  {
    sku: s.optional(trimmedString("An exact or partial SKU filter accepted by CaptainBI.")),
    asin: s.optional(trimmedString("An exact or partial ASIN filter accepted by CaptainBI.")),
  },
);
const businessReportInputSchema = timestampRangeInputSchema(
  "The store, pagination, and creation-time window for a CaptainBI business report.",
  "created",
);
const afterSalesInputSchema = timestampRangeInputSchema(
  "The store, pagination, modification window, and optional report date for CaptainBI after-sales records.",
  "modified",
  { reportDate: s.optional(reportDaySchema) },
);

const profitReportInputSchema = s.object(
  "The store, accounting basis, period, report date, and pagination for a profit report.",
  {
    openChannelId: openChannelIdSchema,
    period: s.stringEnum("Whether to return a daily or monthly profit report.", ["day", "month"]),
    accountingBasis: s.stringEnum(
      "Whether CaptainBI should group the report by order date or financial settlement date.",
      ["order", "finance"],
    ),
    reportDate: s.string("The report date in YYYYMMDD for day or YYYYMM for month.", {
      pattern: "^[0-9]{6}([0-9]{2})?$",
    }),
    page: s.optional(pageSchema),
    rows: s.optional(rowsSchema),
  },
);

const storeSchema = s.looseObject("A normalized CaptainBI authorized store.", {
  id: s.integer("The CaptainBI store identifier."),
  siteId: s.integer("The CaptainBI site identifier."),
  name: s.string("The store name."),
  merchantId: s.string("The Amazon merchant identifier."),
  openChannelId: s.string("The OpenChannelId required by store-scoped CaptainBI actions."),
  status: s.integer("The CaptainBI store status code."),
  operationMode: s.integer("The CaptainBI goods operation mode code."),
  createdAt: s.integer("The store authorization timestamp."),
  modifiedAt: s.integer("The store modification timestamp."),
});

const productSchema = s.looseObject("A normalized CaptainBI product.", {
  id: s.integer("The CaptainBI product identifier."),
  siteId: s.integer("The CaptainBI site identifier."),
  sku: s.string("The seller SKU."),
  asin: s.string("The Amazon ASIN."),
  parentAsin: s.string("The parent Amazon ASIN."),
  transportMode: s.integer("The CaptainBI transport mode code, where 1 is FBM and 2 is FBA."),
  title: s.string("The product title."),
  description: s.string("The product description."),
  imageUrl: s.string("The product image URL."),
  price: s.number("The product price."),
  status: s.integer("The CaptainBI product publication status code."),
  listingStatus: s.integer("The CaptainBI listing status code."),
  deleted: s.boolean("Whether CaptainBI marks the product as deleted."),
  createdAt: s.integer("The product creation timestamp."),
  modifiedAt: s.integer("The product modification timestamp."),
});

const productDetailSchema = s.looseObject("Normalized extended CaptainBI product data.", {
  productId: s.integer("The related CaptainBI product identifier."),
  fnsku: s.string("The Amazon FNSKU."),
  purchaseCostCurrency: s.string("The purchase cost currency code."),
  purchaseCost: s.number("The purchase cost in its source currency."),
  purchaseCostCny: s.number("The purchase cost converted to CNY."),
  fbaCostCurrency: s.string("The FBA cost currency code."),
  fbaCost: s.number("The FBA cost in its source currency."),
  fbaCostCny: s.number("The FBA cost converted to CNY."),
  fbmCostCurrency: s.string("The FBM cost currency code."),
  fbmCost: s.number("The FBM cost in its source currency."),
  fbmCostCny: s.number("The FBM cost converted to CNY."),
  price: s.number("The current product price."),
  salePrice: s.number("The current product sale price."),
  groupId: s.integer("The CaptainBI product group identifier."),
  operatorId: s.integer("The CaptainBI product operator identifier."),
  tagIds: s.string("The CaptainBI product tag identifier list."),
  createdAt: s.integer("The extended product record creation timestamp."),
  modifiedAt: s.integer("The extended product record modification timestamp."),
});

const inventorySchema = s.looseObject("A normalized CaptainBI inventory record.", {
  id: s.integer("The CaptainBI inventory record identifier."),
  title: s.string("The product title."),
  asin: s.string("The Amazon ASIN."),
  sku: s.string("The seller SKU."),
  fulfillableQuantity: s.integer("The quantity currently available for sale."),
  inboundShippedQuantity: s.integer("The inbound quantity already shipped."),
  inboundReceivingQuantity: s.integer("The inbound quantity currently being received."),
  inboundWorkingQuantity: s.integer("The inbound quantity currently being prepared."),
  reservedQuantity: s.integer("The reserved inventory quantity."),
  unsellableQuantity: s.integer("The unsellable inventory quantity."),
  sales1Day: s.integer("The quantity sold yesterday."),
  sales7Days: s.integer("The quantity sold during the last seven days."),
  sales30Days: s.integer("The quantity sold during the last thirty days."),
  averageDailySales: s.integer("The average daily sales quantity reported by CaptainBI."),
  availableDays: s.string("The estimated number of days the available inventory will last."),
  replenishmentQuantity: s.string("The replenishment quantity suggested by CaptainBI."),
  suggestedReplenishmentTime: s.string("The replenishment time suggested by CaptainBI."),
});

const businessMetricSchema = s.looseObject("A normalized CaptainBI product business metric.", {
  id: s.integer("The CaptainBI business report record identifier."),
  parentAsin: s.string("The parent Amazon ASIN."),
  asin: s.string("The Amazon ASIN."),
  sku: s.string("The seller SKU."),
  title: s.string("The product title."),
  visits: s.string("The number of product visits returned by CaptainBI."),
  buyerVisitPercentage: s.number("The percentage of visits attributed to buyers."),
  browsePercentage: s.number("The product browse percentage."),
  buyBoxWinRate: s.string("The buy box winning rate returned by CaptainBI."),
  unitsOrdered: s.number("The quantity of goods ordered."),
  b2bUnitsOrdered: s.number("The B2B quantity of goods ordered."),
  conversionRate: s.number("The order conversion rate."),
  b2bConversionRate: s.number("The B2B order conversion rate."),
  sales: s.number("The sales amount for ordered goods."),
  b2bSales: s.number("The B2B sales amount for ordered goods."),
});

const profitSchema = s.looseObject("A normalized CaptainBI profit record.", {
  sku: s.string("The seller SKU when the report includes a product dimension."),
  channelId: s.integer("The CaptainBI store identifier."),
  siteId: s.integer("The CaptainBI site identifier."),
  reportTime: s.string("The report period returned by CaptainBI."),
  totalIncome: s.number("The total income reported by CaptainBI."),
  totalExpenses: s.number("The total expenses reported by CaptainBI."),
  profit: s.number("The gross profit reported by CaptainBI."),
  profitRate: s.number("The gross profit rate reported by CaptainBI."),
  sales: s.number("The product sales amount reported by CaptainBI."),
  refundAmount: s.number("The sales refund amount reported by CaptainBI."),
  unitsSold: s.number("The sales quantity reported by CaptainBI."),
  unitsReturned: s.number("The returned quantity reported by CaptainBI."),
  advertisingCost: s.number("The advertising cost reported by CaptainBI."),
  productCost: s.number("The purchase or product cost reported by CaptainBI."),
  logisticsCost: s.number("The logistics cost reported by CaptainBI."),
  platformExpenses: s.number("The total platform expenses reported by CaptainBI."),
});

const returnSchema = s.looseObject("A normalized CaptainBI return record without buyer PII.", {
  id: s.integer("The CaptainBI return record identifier."),
  orderId: s.string("The related Amazon order identifier."),
  channelId: s.integer("The CaptainBI store identifier."),
  asin: s.string("The Amazon ASIN."),
  sku: s.string("The seller SKU."),
  orderTime: s.integer("The order timestamp."),
  returnDate: s.integer("The return date returned by CaptainBI."),
  quantity: s.integer("The returned quantity."),
  reason: s.string("The return reason."),
  status: s.string("The return status."),
  fulfillmentCenterId: s.string("The Amazon fulfillment center identifier."),
  disposition: s.string("The detailed inventory disposition."),
});

const refundSchema = s.looseObject("A normalized CaptainBI refund record without buyer PII.", {
  id: s.integer("The CaptainBI refund record identifier."),
  orderId: s.string("The related Amazon order identifier."),
  channelId: s.integer("The CaptainBI store identifier."),
  asin: s.string("The Amazon ASIN."),
  sku: s.string("The seller SKU."),
  orderTime: s.integer("The order timestamp."),
  refundTime: s.integer("The refund timestamp."),
  returnedDate: s.integer("The returned-goods timestamp when present."),
  quantity: s.integer("The refunded quantity."),
  refundAmount: s.number("The refund amount."),
  returnCommission: s.number("The returned commission amount."),
  distributionFee: s.number("The refunded distribution fee."),
  fbaRefundTreatmentFee: s.number("The FBA refund treatment fee."),
  fbaRefundFee: s.number("The FBA refund fee."),
  refundManagementFee: s.number("The refund management fee."),
  reason: s.string("The refund reason."),
  disposition: s.string("The returned inventory disposition."),
  status: s.string("The refund status."),
});

function pageOutputSchema(description: string, key: string, itemSchema: Record<string, unknown>) {
  return s.object(description, {
    [key]: s.array(`The ${key} returned for this page.`, itemSchema),
    page: s.integer("The one-based page number used for this request."),
    pageSize: s.integer("The requested page size."),
    total: s.nullable(s.nonNegativeInteger("The total number of records when CaptainBI reports max_result.")),
    hasMore: s.nullable(s.boolean("Whether more records exist when CaptainBI reports a total, otherwise null.")),
    message: s.nullable(s.string("The message returned by CaptainBI, or null when absent.")),
  });
}

export const captainBiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_stores",
    description: "List Amazon stores authorized for the connected CaptainBI API credential.",
    requiredScopes: [],
    inputSchema: storesInputSchema,
    outputSchema: pageOutputSchema("A page of authorized CaptainBI stores.", "stores", storeSchema),
    followUpActions: ["captainbi.list_products"],
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List CaptainBI product records modified during a controlled time window.",
    requiredScopes: [],
    inputSchema: productRangeInputSchema,
    outputSchema: pageOutputSchema("A page of CaptainBI products.", "products", productSchema),
    followUpActions: ["captainbi.list_product_details"],
  }),
  defineProviderAction(service, {
    name: "list_product_details",
    description: "List extended CaptainBI product cost, price, operator, group, and tag data.",
    requiredScopes: [],
    inputSchema: productRangeInputSchema,
    outputSchema: pageOutputSchema("A page of extended CaptainBI product data.", "productDetails", productDetailSchema),
  }),
  defineProviderAction(service, {
    name: "list_inventory",
    description: "List CaptainBI FBA inventory, recent sales, and replenishment indicators.",
    requiredScopes: [],
    inputSchema: inventoryInputSchema,
    outputSchema: pageOutputSchema("A page of CaptainBI inventory records.", "inventory", inventorySchema),
  }),
  defineProviderAction(service, {
    name: "get_business_report",
    description: "Get CaptainBI product traffic, order, conversion, and sales metrics.",
    requiredScopes: [],
    inputSchema: businessReportInputSchema,
    outputSchema: pageOutputSchema("A page of CaptainBI product business metrics.", "metrics", businessMetricSchema),
  }),
  defineProviderAction(service, {
    name: "get_store_profit_report",
    description: "Get a CaptainBI store profit report by day or month and by order or financial accounting basis.",
    requiredScopes: [],
    inputSchema: profitReportInputSchema,
    outputSchema: pageOutputSchema("A page of CaptainBI store profit records.", "profits", profitSchema),
  }),
  defineProviderAction(service, {
    name: "get_product_profit_report",
    description: "Get a CaptainBI product profit report by day or month and by order or financial accounting basis.",
    requiredScopes: [],
    inputSchema: profitReportInputSchema,
    outputSchema: pageOutputSchema("A page of CaptainBI product profit records.", "profits", profitSchema),
  }),
  defineProviderAction(service, {
    name: "list_returns",
    description: "List CaptainBI return records without exposing customer comments or buyer contacts.",
    requiredScopes: [],
    inputSchema: afterSalesInputSchema,
    outputSchema: pageOutputSchema("A page of CaptainBI return records.", "returns", returnSchema),
  }),
  defineProviderAction(service, {
    name: "list_refunds",
    description: "List CaptainBI refund status, quantity, reason, and fee records without buyer PII.",
    requiredScopes: [],
    inputSchema: afterSalesInputSchema,
    outputSchema: pageOutputSchema("A page of CaptainBI refund records.", "refunds", refundSchema),
  }),
];
