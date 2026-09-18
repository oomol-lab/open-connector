import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wangdian";

const pageNoSchema = s.integer("The zero-based page number. Defaults to 0.", { minimum: 0 });
const pageSizeSchema = s.integer("The number of records to return, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const refundPageSizeSchema = s.integer("The number of refund records to return, from 1 to 40.", {
  minimum: 1,
  maximum: 40,
});
const dateTimeSchema = s.nonWhitespaceString("A China Standard Time timestamp in YYYY-MM-DD HH:mm:ss format.");
const integerEnumSchema = (description: string, values: readonly number[]) =>
  s.describe({ type: "integer", enum: values }, description);
const shopNosSchema = s.array(
  "The shop codes used to filter records, with at most 20 shops per request.",
  s.nonWhitespaceString("One Wangdian shop code."),
  { minItems: 1, maxItems: 20 },
);

function pagedOutputSchema(description: string, field: string, itemDescription: string) {
  return s.object(description, {
    [field]: s.array(itemDescription, s.looseObject(itemDescription)),
    totalCount: s.nullableInteger(
      "The total number of matching records, or null when Wangdian omits it after page 0.",
      { minimum: 0 },
    ),
  });
}

const goodsInputSchema = s.object(
  "The input payload for listing Wangdian ERP goods records.",
  {
    specNo: s.nonWhitespaceString("The merchant SKU code to retrieve."),
    goodsNo: s.nonWhitespaceString("The product or SPU code to retrieve."),
    brandNo: s.nonWhitespaceString("The brand code used to filter goods."),
    className: s.nonWhitespaceString("The goods category name used to filter results."),
    barcode: s.nonWhitespaceString("The barcode used to filter goods."),
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
    includeDeleted: s.boolean("Whether to include deleted goods records."),
    pageNo: pageNoSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: [
      "specNo",
      "goodsNo",
      "brandNo",
      "className",
      "barcode",
      "startTime",
      "endTime",
      "includeDeleted",
      "pageNo",
      "pageSize",
    ],
  },
);

const inventoryInputSchema = s.object(
  "The input payload for listing Wangdian ERP inventory records.",
  {
    warehouseNo: s.nonWhitespaceString("The warehouse code used to filter inventory."),
    specNo: s.nonWhitespaceString("The merchant SKU code used to retrieve inventory."),
    barcode: s.nonWhitespaceString("The barcode used to retrieve inventory."),
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
    onlyExistingInventory: s.boolean(
      "Whether to return only inventory records that are not deleted in inventory management.",
    ),
    includeDeletedGoods: s.boolean("Whether to include inventory for deleted goods records."),
    pageNo: pageNoSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: [
      "warehouseNo",
      "specNo",
      "barcode",
      "startTime",
      "endTime",
      "onlyExistingInventory",
      "includeDeletedGoods",
      "pageNo",
      "pageSize",
    ],
  },
);

const orderInputSchema = s.object(
  "The input payload for listing Wangdian ERP sales orders.",
  {
    tradeNo: s.nonWhitespaceString("The Wangdian ERP sales order number to retrieve."),
    sourceTradeNo: s.nonWhitespaceString("The original platform order number to retrieve."),
    logisticsNo: s.nonWhitespaceString("The outbound logistics number to retrieve."),
    status: integerEnumSchema(
      "The Wangdian sales order status code used to filter results.",
      [5, 10, 12, 13, 15, 16, 19, 20, 21, 22, 25, 27, 30, 35, 40, 45, 50, 53, 55, 95, 105, 110, 113],
    ),
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
    shopNo: s.nonWhitespaceString("The shop code used to filter sales orders."),
    shopNos: shopNosSchema,
    warehouseNo: s.nonWhitespaceString("The warehouse code used to filter sales orders."),
    logisticsState: integerEnumSchema(
      "The logistics-number filter: 0 for any, 1 for present, or 2 for absent.",
      [0, 1, 2],
    ),
    fuzzySourceTradeNo: s.boolean("Whether to use a fuzzy match when querying by sourceTradeNo."),
    includePaymentDetails: s.boolean("Whether to include payment transaction details in returned orders."),
    calculateTaxBySku: s.boolean("Whether Wangdian should calculate tax by individual SKU."),
    pageNo: pageNoSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: [
      "tradeNo",
      "sourceTradeNo",
      "logisticsNo",
      "status",
      "startTime",
      "endTime",
      "shopNo",
      "shopNos",
      "warehouseNo",
      "logisticsState",
      "fuzzySourceTradeNo",
      "includePaymentDetails",
      "calculateTaxBySku",
      "pageNo",
      "pageSize",
    ],
  },
);

const salesStockoutInputSchema = s.object(
  "The input payload for listing Wangdian ERP sales stockout records.",
  {
    stockoutNo: s.nonWhitespaceString("The Wangdian sales stockout number to retrieve."),
    tradeNo: s.nonWhitespaceString("The Wangdian ERP sales order number to retrieve."),
    sourceTradeNo: s.nonWhitespaceString("The original platform order number to retrieve."),
    status: integerEnumSchema(
      "The Wangdian sales stockout status code used to filter results.",
      [5, 55, 95, 105, 110, 113],
    ),
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
    shopNo: s.nonWhitespaceString("The shop code used to filter sales stockouts."),
    shopNos: shopNosSchema,
    warehouseNo: s.nonWhitespaceString("The warehouse code used to filter sales stockouts."),
    queryByModified: s.boolean("Whether the time range should use last-modified time instead of consign time."),
    includePositionDetails: s.boolean("Whether to include warehouse position details in returned stockout records."),
    stockOnly: s.boolean("Whether to return only stock-related data."),
    pageNo: pageNoSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: [
      "stockoutNo",
      "tradeNo",
      "sourceTradeNo",
      "status",
      "startTime",
      "endTime",
      "shopNo",
      "shopNos",
      "warehouseNo",
      "queryByModified",
      "includePositionDetails",
      "stockOnly",
      "pageNo",
      "pageSize",
    ],
  },
);

const refundInputSchema = s.object(
  "The input payload for listing Wangdian ERP refund and exchange records.",
  {
    refundNo: s.nonWhitespaceString("The Wangdian ERP refund number to retrieve."),
    sourceRefundNo: s.nonWhitespaceString("The original platform refund number to retrieve."),
    tradeNo: s.nonWhitespaceString("The Wangdian ERP sales order number to retrieve refunds for."),
    sourceTradeNo: s.nonWhitespaceString("The original platform order number to retrieve refunds for."),
    processStatus: integerEnumSchema(
      "The Wangdian refund processing status code used to filter results.",
      [5, 10, 20, 30, 40, 50, 60, 63, 64, 65, 69, 70, 71, 80, 90],
    ),
    timeType: integerEnumSchema(
      "The time field to query: 0 for modified, 1 for settlement, or 2 for creation time.",
      [0, 1, 2],
    ),
    startTime: dateTimeSchema,
    endTime: dateTimeSchema,
    shopNo: s.nonWhitespaceString("The shop code used to filter refunds."),
    shopNos: shopNosSchema,
    returnLogisticsNo: s.nonWhitespaceString("The return logistics number used to filter refunds."),
    pageNo: pageNoSchema,
    pageSize: refundPageSizeSchema,
  },
  {
    optional: [
      "refundNo",
      "sourceRefundNo",
      "tradeNo",
      "sourceTradeNo",
      "processStatus",
      "timeType",
      "startTime",
      "endTime",
      "shopNo",
      "shopNos",
      "returnLogisticsNo",
      "pageNo",
      "pageSize",
    ],
  },
);

export const wangdianActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_shops",
    operationType: "read",
    description: "List shop records configured in Wangdian ERP Enterprise Edition.",
    inputSchema: s.object(
      "The input payload for listing Wangdian ERP shops.",
      {
        shopNo: s.nonWhitespaceString("The shop code to retrieve."),
        platformId: s.integer("The Wangdian platform ID used to filter shops.", { minimum: 0 }),
        platformIds: s.array(
          "The Wangdian platform IDs used to filter shops.",
          s.integer("One Wangdian platform ID.", { minimum: 0 }),
          { minItems: 1 },
        ),
        disabled: s.boolean("Whether to return disabled shops. Omit this field to return enabled shops."),
        pageNo: pageNoSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["shopNo", "platformId", "platformIds", "disabled", "pageNo", "pageSize"] },
    ),
    outputSchema: pagedOutputSchema(
      "A paginated Wangdian shop result.",
      "shops",
      "One shop record returned by Wangdian.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_warehouses",
    operationType: "read",
    description: "List warehouse records configured in Wangdian ERP Enterprise Edition.",
    inputSchema: s.object(
      "The input payload for listing Wangdian ERP warehouses.",
      {
        warehouseNo: s.nonWhitespaceString("The warehouse code to retrieve."),
        warehouseType: integerEnumSchema(
          "The Wangdian warehouse type code used to filter results.",
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 126, 127],
        ),
        subType: s.integer("The subtype used for warehouses whose type is Other.", {
          minimum: 1,
          maximum: 2,
        }),
        disabled: s.boolean("Whether to return disabled warehouses. Omit this field to return enabled warehouses."),
        pageNo: pageNoSchema,
        pageSize: pageSizeSchema,
      },
      {
        optional: ["warehouseNo", "warehouseType", "subType", "disabled", "pageNo", "pageSize"],
      },
    ),
    outputSchema: pagedOutputSchema(
      "A paginated Wangdian warehouse result.",
      "warehouses",
      "One warehouse record returned by Wangdian.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_goods",
    operationType: "read",
    description: "List goods and SKU records from Wangdian ERP Enterprise Edition.",
    inputSchema: goodsInputSchema,
    outputSchema: pagedOutputSchema(
      "A paginated Wangdian goods result.",
      "goods",
      "One goods record returned by Wangdian, including its nested SKU list when available.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_inventory",
    operationType: "read",
    description: "List physical stock and inventory allocation records from Wangdian ERP.",
    inputSchema: inventoryInputSchema,
    outputSchema: pagedOutputSchema(
      "A paginated Wangdian inventory result.",
      "inventory",
      "One warehouse and SKU inventory record returned by Wangdian.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List sales orders from Wangdian ERP Enterprise Edition.",
    inputSchema: orderInputSchema,
    outputSchema: pagedOutputSchema(
      "A paginated Wangdian sales order result.",
      "orders",
      "One sales order record returned by Wangdian.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_sales_stockouts",
    operationType: "read",
    description: "List sales stockout records from Wangdian ERP Enterprise Edition.",
    inputSchema: salesStockoutInputSchema,
    outputSchema: pagedOutputSchema(
      "A paginated Wangdian sales stockout result.",
      "stockouts",
      "One sales stockout record returned by Wangdian.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_refunds",
    operationType: "read",
    description: "List refund and exchange records from Wangdian ERP Enterprise Edition.",
    inputSchema: refundInputSchema,
    outputSchema: pagedOutputSchema(
      "A paginated Wangdian refund result.",
      "refunds",
      "One refund or exchange record returned by Wangdian.",
    ),
  }),
];
