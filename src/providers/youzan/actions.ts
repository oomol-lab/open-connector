import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "youzan";

const rawItemSchema = s.looseObject(
  "A Youzan item record. Available fields depend on the store type and enabled capabilities.",
);
const rawOrderSchema = s.looseObject(
  "A Youzan order record. Available fields depend on the order type and enabled capabilities.",
);
const rawShopSchema = s.looseObject(
  "A Youzan shop record. Available fields depend on the store type and enabled capabilities.",
);
const rawRefundSchema = s.looseObject(
  "A Youzan refund record. Available fields depend on the after-sale type and current status.",
);
const rawLogisticsPackageSchema = s.looseObject("A Youzan logistics package with express or local-delivery details.");
const pageSchema = s.integer("The one-based page number. Defaults to 1.", { minimum: 1 });
const inventoryPageSizeSchema = s.integer(
  "The number of inventory items per page. Defaults to 40 and cannot exceed 300.",
  { minimum: 1, maximum: 300 },
);
const orderPageSizeSchema = s.integer("The number of orders per page. Defaults to 20 and cannot exceed 100.", {
  minimum: 1,
  maximum: 100,
});
const youzanDateTimeSchema = s.nonWhitespaceString("A Youzan date-time in YYYY-MM-DD HH:mm:ss format.");

const listInventoryInputSchema = s.object(
  "The filters used to list Youzan inventory items.",
  {
    status: s.stringEnum("The inventory section to query. Defaults to for_shelved.", ["for_shelved", "sold_out"]),
    query: s.nonWhitespaceString("A keyword matched against the item title."),
    orderBy: s.stringEnum("The inventory result sort field and direction.", [
      "created_time:asc",
      "created_time:desc",
      "update_time:asc",
      "update_time:desc",
      "price:asc",
      "price:desc",
      "sold_num:asc",
      "sold_num:desc",
    ]),
    updatedAfter: s.nonNegativeInteger(
      "The earliest item update time to include, as a Unix timestamp in milliseconds.",
    ),
    updatedBefore: s.nonNegativeInteger("The latest item update time to include, as a Unix timestamp in milliseconds."),
    nodeKdtId: s.positiveInteger("The child store kdt_id used in a chain-store query."),
    page: pageSchema,
    pageSize: inventoryPageSizeSchema,
  },
  {
    optional: ["status", "query", "orderBy", "updatedAfter", "updatedBefore", "nodeKdtId", "page", "pageSize"],
  },
);

const listOrdersInputSchema = s.object(
  "The filters used to list Youzan orders.",
  {
    status: s.stringEnum("The Youzan order status to include.", [
      "WAIT_BUYER_PAY",
      "WAIT_SELLER_SEND_GOODS",
      "WAIT_BUYER_CONFIRM_GOODS",
      "TRADE_SUCCESS",
      "TRADE_CLOSED",
      "TRADE_REFUND",
    ]),
    orderId: s.nonWhitespaceString("An exact Youzan order ID."),
    keywords: s.nonWhitespaceString("A general order search value such as an order ID or receiver phone suffix."),
    itemId: s.positiveInteger("A Youzan item ID included in the order."),
    expressType: s.stringEnum("The order delivery method.", ["LOCAL_DELIVERY", "SELF_FETCH", "EXPRESS"]),
    createdAfter: youzanDateTimeSchema,
    createdBefore: youzanDateTimeSchema,
    updatedAfter: youzanDateTimeSchema,
    updatedBefore: youzanDateTimeSchema,
    completedAfter: youzanDateTimeSchema,
    completedBefore: youzanDateTimeSchema,
    nodeKdtId: s.positiveInteger("The child store kdt_id used in a chain-store query."),
    page: s.integer("The one-based page number. Defaults to 1 and cannot exceed 100.", {
      minimum: 1,
      maximum: 100,
    }),
    pageSize: orderPageSizeSchema,
  },
  {
    optional: [
      "status",
      "orderId",
      "keywords",
      "itemId",
      "expressType",
      "createdAfter",
      "createdBefore",
      "updatedAfter",
      "updatedBefore",
      "completedAfter",
      "completedBefore",
      "nodeKdtId",
      "page",
      "pageSize",
    ],
  },
);

const listOnsaleItemsInputSchema = s.object(
  "The filters used to list items currently visible for sale in a Youzan store.",
  {
    kdtId: s.positiveInteger("The Youzan store kdt_id. Defaults to the store ID in the connection credential."),
    channel: s.integer("The sales channel: 0 for an online store or 1 for a physical store. Defaults to 0.", {
      minimum: 0,
      maximum: 1,
    }),
    title: s.nonWhitespaceString("A keyword matched against the item title."),
    itemIds: s.array("The Youzan item IDs to include.", s.positiveInteger("A Youzan item ID.")),
    itemCodes: s.stringArray("The merchant item codes to include.", {
      itemDescription: "A merchant item code.",
    }),
    updatedAfter: s.nonNegativeInteger(
      "The earliest item update time to include, as a Unix timestamp in milliseconds.",
    ),
    updatedBefore: s.nonNegativeInteger("The latest item update time to include, as a Unix timestamp in milliseconds."),
    page: pageSchema,
    pageSize: s.integer("The number of on-sale items per page. Defaults to 20 and cannot exceed 50.", {
      minimum: 1,
      maximum: 50,
    }),
  },
  {
    optional: [
      "kdtId",
      "channel",
      "title",
      "itemIds",
      "itemCodes",
      "updatedAfter",
      "updatedBefore",
      "page",
      "pageSize",
    ],
  },
);

const listRefundsInputSchema = s.object(
  "The filters used to list Youzan after-sale refund records.",
  {
    orderId: s.nonWhitespaceString("An exact Youzan order ID."),
    refundId: s.nonWhitespaceString("An exact Youzan refund ID."),
    status: s.stringEnum("The current Youzan refund status.", [
      "WAIT_SELLER_AGREE",
      "WAIT_BUYER_RETURN_GOODS",
      "WAIT_SELLER_CONFIRM_GOODS",
      "SELLER_REFUSE_BUYER",
      "CLOSED",
      "SUCCESS",
      "CUSTOMER_SERVICE_IN",
      "SELLER_REFUSE_BUYER_RETURN_GOODS",
      "SELLER_RETURN_GOODS",
    ]),
    demand: s.integer("The buyer demand: 1 for refund only, 2 for return and refund, or 3 for exchange.", {
      minimum: 1,
      maximum: 3,
    }),
    createdAfter: s.nonNegativeInteger("The earliest refund creation time to include, as a Unix timestamp in seconds."),
    createdBefore: s.nonNegativeInteger("The latest refund creation time to include, as a Unix timestamp in seconds."),
    updatedAfter: s.nonNegativeInteger("The earliest refund update time to include, as a Unix timestamp in seconds."),
    updatedBefore: s.nonNegativeInteger("The latest refund update time to include, as a Unix timestamp in seconds."),
    nodeKdtId: s.positiveInteger("The child store kdt_id used in a chain-store query."),
    page: s.integer("The one-based page number. Defaults to 1 and cannot exceed 100.", {
      minimum: 1,
      maximum: 100,
    }),
    pageSize: s.integer("The number of refund records per page. Defaults to 20.", { minimum: 1 }),
  },
  {
    optional: [
      "orderId",
      "refundId",
      "status",
      "demand",
      "createdAfter",
      "createdBefore",
      "updatedAfter",
      "updatedBefore",
      "nodeKdtId",
      "page",
      "pageSize",
    ],
  },
);

export const youzanActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_shop",
    operationType: "read",
    description: "Get the identity and basic profile of the connected Youzan shop.",
    inputSchema: s.object("No input is required to retrieve the connected Youzan shop.", {}),
    outputSchema: s.object("The connected Youzan shop result.", { shop: rawShopSchema }),
  }),
  defineProviderAction(service, {
    name: "list_inventory_items",
    operationType: "read",
    description: "List shelved or sold-out items from a Youzan store inventory.",
    inputSchema: listInventoryInputSchema,
    outputSchema: s.object("A paginated Youzan inventory result.", {
      items: s.array("The Youzan inventory item records.", rawItemSchema),
      total: s.nonNegativeInteger("The total number of matching items reported by Youzan."),
      page: s.positiveInteger("The requested one-based page number."),
      pageSize: s.positiveInteger("The requested number of items per page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_item",
    operationType: "read",
    description: "Get a Youzan item by its item ID.",
    inputSchema: s.object("The item identifier used to retrieve a Youzan item.", {
      itemId: s.positiveInteger("The Youzan item ID."),
    }),
    outputSchema: s.object("The Youzan item detail result.", { item: rawItemSchema }),
  }),
  defineProviderAction(service, {
    name: "list_onsale_items",
    operationType: "read",
    description: "List items currently visible for sale in a Youzan online or physical store.",
    inputSchema: listOnsaleItemsInputSchema,
    outputSchema: s.object("A paginated Youzan on-sale item result.", {
      items: s.array("The Youzan on-sale item records.", rawItemSchema),
      total: s.nonNegativeInteger("The total number of matching items reported by Youzan."),
      page: s.positiveInteger("The requested one-based page number."),
      pageSize: s.positiveInteger("The requested number of items per page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List Youzan orders using status, time, item, delivery, and text filters.",
    inputSchema: listOrdersInputSchema,
    outputSchema: s.object("A paginated Youzan order result.", {
      orders: s.array("The Youzan order records.", rawOrderSchema),
      total: s.nonNegativeInteger("The total number of matching orders reported by Youzan."),
      page: s.positiveInteger("The requested one-based page number."),
      pageSize: s.positiveInteger("The requested number of orders per page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Get a Youzan order by its order ID.",
    inputSchema: s.object("The order identifier used to retrieve a Youzan order.", {
      orderId: s.nonWhitespaceString("The Youzan order ID."),
    }),
    outputSchema: s.object("The Youzan order detail result.", { order: rawOrderSchema }),
  }),
  defineProviderAction(service, {
    name: "list_refunds",
    operationType: "read",
    description: "List Youzan refund and after-sale records using order, status, and time filters.",
    inputSchema: listRefundsInputSchema,
    outputSchema: s.object("A paginated Youzan refund result.", {
      refunds: s.array("The Youzan refund records.", rawRefundSchema),
      total: s.nonNegativeInteger("The total number of matching refunds reported by Youzan."),
      page: s.positiveInteger("The requested one-based page number."),
      pageSize: s.positiveInteger("The requested number of refunds per page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_refund",
    operationType: "read",
    description: "Get a Youzan refund or after-sale record by its refund ID.",
    inputSchema: s.object(
      "The refund identifier used to retrieve a Youzan refund.",
      {
        refundId: s.nonWhitespaceString("The Youzan refund ID."),
        includeAllConsultMessages: s.boolean("Whether to include all buyer and seller consultation messages."),
      },
      { optional: ["includeAllConsultMessages"] },
    ),
    outputSchema: s.object("The Youzan refund detail result.", { refund: rawRefundSchema }),
  }),
  defineProviderAction(service, {
    name: "get_order_logistics",
    operationType: "read",
    description: "Get all express or local-delivery packages and tracking details for a Youzan order.",
    inputSchema: s.object(
      "The order identifier used to retrieve Youzan logistics packages.",
      {
        orderId: s.nonWhitespaceString("The Youzan order ID."),
        sourceId: s.integer("The Youzan order source: 1001 for catering or 1002 for other stores. Defaults to 1002.", {
          minimum: 1001,
          maximum: 1002,
        }),
      },
      { optional: ["sourceId"] },
    ),
    outputSchema: s.object("The Youzan order logistics result.", {
      packages: s.array("The logistics packages associated with the order.", rawLogisticsPackageSchema),
    }),
  }),
];
