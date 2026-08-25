import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "walmart_marketplace";

const rawRecordSchema = (description: string) => s.looseObject(description);
const nullableCursorSchema = s.nullable(s.string("The cursor to send for the next page."));

const itemOutputSchema = s.object("One Walmart Marketplace catalog item.", {
  item: rawRecordSchema("The item returned by Walmart Marketplace."),
});

const inventoryOutputSchema = s.object("Inventory state returned by Walmart Marketplace.", {
  inventory: rawRecordSchema("The Walmart Marketplace inventory response."),
});

export const walmartMarketplaceActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_items",
    description: "List items in the connected Walmart Marketplace seller catalog.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for Walmart Marketplace seller items.",
      {
        nextCursor: s.string("The cursor returned by a previous list-items response."),
        offset: s.integer("The zero-based result offset, up to 10000.", {
          minimum: 0,
          maximum: 10000,
        }),
        limit: s.integer("The maximum number of items to return, from 1 through 1000.", {
          minimum: 1,
          maximum: 1000,
        }),
        sku: s.string("A seller-assigned SKU to match.", { minLength: 1 }),
        gtin: s.string("A 14-digit Global Trade Item Number to match.", {
          minLength: 14,
          maxLength: 14,
        }),
        lifecycleStatus: s.stringEnum("The item lifecycle status to match.", ["ACTIVE", "ARCHIVED", "RETIRED"]),
        publishedStatus: s.stringEnum("The item publication status to match.", ["PUBLISHED", "UNPUBLISHED"]),
      },
      {
        optional: ["nextCursor", "offset", "limit", "sku", "gtin", "lifecycleStatus", "publishedStatus"],
      },
    ),
    outputSchema: s.object("A page of Walmart Marketplace seller items.", {
      items: s.array("The seller items on this page.", rawRecordSchema("A seller catalog item.")),
      totalItems: s.nullable(s.integer("The total matching item count when Walmart provides it.")),
      nextCursor: nullableCursorSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get one Walmart Marketplace seller item by product identifier.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Walmart Marketplace item identifier and identifier type.",
      {
        productId: s.string("The SKU, item ID, GTIN, UPC, EAN, or ISBN to retrieve.", {
          minLength: 1,
        }),
        productIdType: s.stringEnum("How Walmart should interpret productId.", [
          "SKU",
          "ITEM_ID",
          "GTIN",
          "UPC",
          "EAN",
          "ISBN",
        ]),
      },
      { optional: ["productIdType"] },
    ),
    outputSchema: itemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description: "List recent Walmart Marketplace purchase orders with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for Walmart Marketplace purchase orders.",
      {
        createdStartDate: s.string("Return orders created on or after this UTC or ISO-8601 date."),
        createdEndDate: s.string("Return orders created on or before this UTC or ISO-8601 date."),
        lastModifiedStartDate: s.string("Return orders modified on or after this UTC or ISO-8601 date."),
        lastModifiedEndDate: s.string("Return orders modified on or before this UTC or ISO-8601 date."),
        status: s.stringEnum("The purchase-order line status to match.", [
          "Created",
          "Acknowledged",
          "Shipped",
          "Delivered",
          "Cancelled",
        ]),
        sku: s.string("A seller SKU to match."),
        customerOrderId: s.string("A Walmart customer order ID to match."),
        purchaseOrderId: s.string("A Walmart purchase order ID to match."),
        limit: s.integer("The maximum number of orders to return, from 1 through 200.", {
          minimum: 1,
          maximum: 200,
        }),
        nextCursor: s.string(
          "The complete query string returned as nextCursor in Walmart order metadata, beginning with ?. Provide it without other inputs.",
        ),
      },
      {
        optional: [
          "createdStartDate",
          "createdEndDate",
          "lastModifiedStartDate",
          "lastModifiedEndDate",
          "status",
          "sku",
          "customerOrderId",
          "purchaseOrderId",
          "limit",
          "nextCursor",
        ],
      },
    ),
    outputSchema: s.object("A page of Walmart Marketplace purchase orders.", {
      orders: s.array("The purchase orders on this page.", rawRecordSchema("A purchase order.")),
      meta: rawRecordSchema("Walmart pagination and response metadata."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Get one Walmart Marketplace purchase order by purchase order ID.",
    requiredScopes: [],
    inputSchema: s.object("The Walmart Marketplace purchase order to retrieve.", {
      purchaseOrderId: s.string("The Walmart purchase order ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("One Walmart Marketplace purchase order.", {
      order: rawRecordSchema("The purchase order returned by Walmart Marketplace."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_inventory",
    description: "Get the current Walmart Marketplace inventory for one seller SKU.",
    requiredScopes: [],
    inputSchema: s.object(
      "The seller SKU and optional fulfillment center to inspect.",
      {
        sku: s.string("The seller-assigned SKU.", { minLength: 1 }),
        shipNode: s.string("The fulfillment-center ID; omit it to use the default ship node."),
      },
      { optional: ["shipNode"] },
    ),
    outputSchema: inventoryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_inventory",
    description: "Replace the Walmart Marketplace inventory amount for one seller SKU.",
    requiredScopes: [],
    inputSchema: s.object(
      "The seller SKU, replacement amount, and optional fulfillment center.",
      {
        sku: s.string("The seller-assigned SKU.", { minLength: 1 }),
        amount: s.integer("The replacement number of units available to sell.", { minimum: 0 }),
        shipNode: s.string("The fulfillment-center ID; omit it to use the default ship node."),
      },
      { optional: ["shipNode"] },
    ),
    outputSchema: inventoryOutputSchema,
  }),
];
