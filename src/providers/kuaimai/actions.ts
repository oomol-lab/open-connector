import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kuaimai";

const pageNoSchema = s.integer("The one-based page number. Defaults to 1.", { minimum: 1 });
const pageSizeSchema = s.integer("The number of records to return, from 1 to 200.", {
  minimum: 1,
  maximum: 200,
});
const unboundedPageSizeSchema = s.integer("The number of records to return.", { minimum: 1 });
const tradePageSizeSchema = s.integer("The number of records to return, from 20 to 200.", {
  minimum: 20,
  maximum: 200,
});
const chinaDateTimeSchema = s.nonEmptyString("A China Standard Time timestamp in YYYY-MM-DD HH:mm:ss format.");
const looseRecordSchema = (description: string) => s.looseObject(description);

const pagedOutputSchema = (description: string, field: string, itemDescription: string) =>
  s.object(description, {
    [field]: s.array(itemDescription, looseRecordSchema(itemDescription)),
    total: s.nullableInteger("The total number of matching records, or null when omitted.", {
      minimum: 0,
    }),
    hasNext: s.nullableBoolean("Whether another result page is available, or null when omitted."),
    cursor: s.nullableString("The cursor for the next request, or null when cursor mode is unused."),
  });

const tradeInputSchema = {
  ...s.object(
    "Filters for querying Kuaimai ERP trade records.",
    {
      systemOrderIds: s.stringArray("Kuaimai ERP system order numbers to retrieve.", {
        minItems: 1,
        itemDescription: "One Kuaimai ERP system order number.",
      }),
      platformOrderIds: s.stringArray("Platform order numbers to retrieve.", {
        minItems: 1,
        itemDescription: "One platform order number.",
      }),
      timeType: s.describe(
        {
          type: "string",
          enum: ["created", "pay_time", "consign_time", "audit_time", "upd_time"],
        },
        "The order time field used with startTime and endTime.",
      ),
      startTime: chinaDateTimeSchema,
      endTime: chinaDateTimeSchema,
      shopIds: s.stringArray("Shop IDs used to filter records.", {
        minItems: 1,
        itemDescription: "One Kuaimai shop ID.",
      }),
      statuses: s.stringArray("Kuaimai ERP system statuses used to filter records.", {
        minItems: 1,
        itemDescription: "One documented Kuaimai ERP order status.",
      }),
      tagIds: s.stringArray("Order tag IDs used to filter records, with at most ten IDs.", {
        minItems: 1,
        maxItems: 10,
        itemDescription: "One Kuaimai order tag ID.",
      }),
      exceptionIds: s.stringArray("Custom exception tag IDs used to filter records, with at most ten IDs.", {
        minItems: 1,
        maxItems: 10,
        itemDescription: "One Kuaimai custom exception tag ID.",
      }),
      exceptionStatuses: s.stringArray("System exception statuses used to filter records, with at most ten values.", {
        minItems: 1,
        maxItems: 10,
        itemDescription: "One Kuaimai system exception status.",
      }),
      exceptionMatch: s.describe(
        { type: "integer", enum: [1, 2, 3] },
        "How exception filters are applied: 1 only matching, 2 exclude matching, or 3 include both.",
      ),
      orderTypes: s.stringArray("Kuaimai order type codes used to filter records.", {
        minItems: 1,
        itemDescription: "One documented Kuaimai order type code.",
      }),
      buyerNick: s.nonEmptyString("The platform buyer ID or nickname to retrieve."),
      archived: s.boolean("Whether to query orders older than three months instead of the recent-order store."),
      trackingNumbers: s.stringArray("Logistics tracking numbers to retrieve.", {
        minItems: 1,
        itemDescription: "One logistics tracking number.",
      }),
      useCursor: s.boolean("Whether to use cursor pagination for recent orders."),
      cursor: s.nonEmptyString("The cursor returned by the preceding cursor-mode request."),
      pageNo: pageNoSchema,
      pageSize: tradePageSizeSchema,
    },
    {
      optional: [
        "systemOrderIds",
        "platformOrderIds",
        "timeType",
        "startTime",
        "endTime",
        "shopIds",
        "statuses",
        "tagIds",
        "exceptionIds",
        "exceptionStatuses",
        "exceptionMatch",
        "orderTypes",
        "buyerNick",
        "archived",
        "trackingNumbers",
        "useCursor",
        "cursor",
        "pageNo",
        "pageSize",
      ],
    },
  ),
  oneOf: [
    { required: ["timeType", "startTime", "endTime"] },
    {
      not: {
        anyOf: [{ required: ["timeType"] }, { required: ["startTime"] }, { required: ["endTime"] }],
      },
    },
  ],
};

export const kuaimaiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "refresh_session",
    operationType: "write",
    description: "Extend the Kuaimai Open Platform session validity by another 30 days.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to refresh the configured Kuaimai session.", {}),
    outputSchema: s.object("The refreshed Kuaimai session metadata.", {
      session: looseRecordSchema("The session metadata returned by Kuaimai."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_warehouses",
    operationType: "read",
    description: "List warehouses configured for the connected Kuaimai ERP company.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Kuaimai ERP warehouses.",
      {
        code: s.nonEmptyString("The exact warehouse code to retrieve."),
        name: s.nonEmptyString("The warehouse name to filter by."),
        id: s.integer("The warehouse ID to retrieve.", { minimum: 1 }),
      },
      { optional: ["code", "name", "id"] },
    ),
    outputSchema: s.object("The matching Kuaimai warehouse records.", {
      warehouses: s.array(
        "The matching warehouse records.",
        looseRecordSchema("One warehouse record returned by Kuaimai."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_shops",
    operationType: "read",
    description: "List shops configured for the connected Kuaimai ERP company.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Kuaimai ERP shops.",
      {
        name: s.nonEmptyString("The shop name to filter by."),
        id: s.integer("The shop ID to retrieve.", { minimum: 1 }),
        shortName: s.nonEmptyString("The shop short name to filter by."),
        pageNo: pageNoSchema,
        pageSize: unboundedPageSizeSchema,
      },
      { optional: ["name", "id", "shortName", "pageNo", "pageSize"] },
    ),
    outputSchema: s.object("The matching Kuaimai shop records.", {
      shops: s.array("The matching shop records.", looseRecordSchema("One shop record returned by Kuaimai.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List products and their SKU records from Kuaimai ERP.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Kuaimai ERP products.",
      {
        activeStatus: s.describe(
          { type: "integer", enum: [0, 1] },
          "The availability status: 0 disabled or 1 enabled.",
        ),
        modifiedAfter: chinaDateTimeSchema,
        modifiedBefore: chinaDateTimeSchema,
        productType: s.describe(
          { type: "integer", enum: [0, 1, 3, 6, 7, 8, 9, 10] },
          "The documented Kuaimai product type filter.",
        ),
        orderBy: s.describe({ type: "string", enum: ["modified:desc", "created:desc"] }, "The product sort order."),
        includePurchaseLinks: s.boolean("Whether Kuaimai should include product purchase-link information."),
        pageNo: pageNoSchema,
        pageSize: pageSizeSchema,
      },
      {
        optional: [
          "activeStatus",
          "modifiedAfter",
          "modifiedBefore",
          "productType",
          "orderBy",
          "includePurchaseLinks",
          "pageNo",
          "pageSize",
        ],
      },
    ),
    outputSchema: pagedOutputSchema(
      "A paginated Kuaimai product result.",
      "products",
      "One product record returned by Kuaimai, including nested SKUs when available.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Get one Kuaimai ERP product by system ID or merchant product code.",
    requiredScopes: [],
    inputSchema: {
      ...s.object(
        "The identifier of the Kuaimai ERP product to retrieve.",
        {
          systemProductId: s.integer("The Kuaimai ERP system product ID.", { minimum: 1 }),
          merchantProductCode: s.nonEmptyString("The merchant product code."),
          includePurchaseLinks: s.boolean("Whether Kuaimai should include product purchase-link information."),
        },
        { optional: ["systemProductId", "merchantProductCode", "includePurchaseLinks"] },
      ),
      anyOf: [{ required: ["systemProductId"] }, { required: ["merchantProductCode"] }],
    },
    outputSchema: s.object("The requested Kuaimai product.", {
      product: looseRecordSchema("The product record returned by Kuaimai."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_inventory",
    operationType: "read",
    description: "List warehouse inventory for a Kuaimai merchant product or SKU code.",
    requiredScopes: [],
    inputSchema: {
      ...s.object(
        "Filters for listing Kuaimai ERP warehouse inventory.",
        {
          merchantProductCode: s.nonEmptyString("The merchant product code to retrieve."),
          merchantSkuCode: s.nonEmptyString("The merchant SKU code to retrieve."),
          pageNo: pageNoSchema,
          pageSize: pageSizeSchema,
        },
        { optional: ["merchantProductCode", "merchantSkuCode", "pageNo", "pageSize"] },
      ),
      anyOf: [{ required: ["merchantProductCode"] }, { required: ["merchantSkuCode"] }],
    },
    outputSchema: pagedOutputSchema(
      "A paginated Kuaimai inventory result.",
      "inventory",
      "One product and warehouse inventory record returned by Kuaimai.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description:
      "List Kuaimai ERP orders, excluding Taobao/Tmall and Pinduoduo orders that require separate platform credentials.",
    requiredScopes: [],
    inputSchema: tradeInputSchema,
    outputSchema: pagedOutputSchema(
      "A paginated Kuaimai order result.",
      "orders",
      "One order record returned by Kuaimai.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_sales_stockouts",
    operationType: "read",
    description: "List Kuaimai ERP sales stockout records and their order details.",
    requiredScopes: [],
    inputSchema: tradeInputSchema,
    outputSchema: pagedOutputSchema(
      "A paginated Kuaimai sales stockout result.",
      "stockouts",
      "One sales stockout record returned by Kuaimai.",
    ),
  }),
];
