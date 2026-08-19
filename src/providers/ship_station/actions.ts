import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ship_station";

const idSchema = s.string({
  description: "A ShipStation V2 resource identifier.",
  minLength: 1,
  pattern: "\\S",
});
const dateTimeSchema = s.dateTime("An ISO 8601/RFC3339 date-time string accepted by ShipStation.");
const pageSizeSchema = s.integer("The number of purchase orders to return per page.", {
  minimum: 1,
  maximum: 500,
});
const inventoryLimitSchema = s.positiveInteger("The maximum number of inventory records to return.");
const rawObjectSchema = s.looseObject("The raw object returned by ShipStation.");
const linksSchema = s.looseObject("The pagination links object returned by ShipStation.");

const purchaseOrderStatusSchema = s.stringEnum("The purchase order status filter.", [
  "draft",
  "open",
  "receiving",
  "received",
  "closed",
  "cancelled",
]);

export const shipStationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_inventory_levels",
    description: "List ShipStation V2 inventory stock levels and inventory-related properties for SKUs.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing ShipStation inventory levels.",
      {
        sku: s.nonEmptyString("Return inventory properties for this specific SKU."),
        inventoryWarehouseId: idSchema,
        inventoryLocationId: idSchema,
        groupBy: s.stringEnum("Group returned SKUs by warehouse or location.", ["warehouse", "location"]),
        limit: inventoryLimitSchema,
      },
      { optional: ["sku", "inventoryWarehouseId", "inventoryLocationId", "groupBy", "limit"] },
    ),
    outputSchema: s.actionOutput(
      {
        inventory: s.array("The inventory records returned by ShipStation.", rawObjectSchema),
        raw: rawObjectSchema,
      },
      "The response returned when listing ShipStation inventory levels.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_inventory_warehouses",
    description: "List inventory warehouses configured in ShipStation V2.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "The input payload for listing ShipStation inventory warehouses."),
    outputSchema: s.actionOutput(
      {
        inventoryWarehouses: s.array("The inventory warehouse records returned by ShipStation.", rawObjectSchema),
        raw: rawObjectSchema,
      },
      "The response returned when listing ShipStation inventory warehouses.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_purchase_orders",
    description: "List ShipStation V2 purchase orders with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing ShipStation purchase orders.",
      {
        orderNumber: s.nonEmptyString("Filter by the ShipStation purchase order number."),
        status: purchaseOrderStatusSchema,
        warehouseId: idSchema,
        referenceNumber: s.nonEmptyString("Filter by the custom purchase order reference."),
        createDateStart: dateTimeSchema,
        cursor: s.nonEmptyString("The cursor value from a previous pagination link."),
        pageSize: pageSizeSchema,
      },
      {
        optional: ["orderNumber", "status", "warehouseId", "referenceNumber", "createDateStart", "cursor", "pageSize"],
      },
    ),
    outputSchema: s.actionOutput(
      {
        purchaseOrders: s.array("The purchase orders returned by ShipStation.", rawObjectSchema),
        total: s.nullable(s.integer("The total number of matching purchase orders when returned.")),
        links: s.nullable(linksSchema),
        nextCursor: s.nullable(s.string("The cursor extracted from links.next.href when another page is available.")),
        raw: rawObjectSchema,
      },
      "The response returned when listing ShipStation purchase orders.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_purchase_order",
    description: "Retrieve a ShipStation V2 purchase order by ID, including detailed product lines when returned.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { purchaseOrderId: idSchema },
      ["purchaseOrderId"],
      "The input payload for retrieving a ShipStation purchase order.",
    ),
    outputSchema: s.actionOutput(
      { purchaseOrder: rawObjectSchema },
      "The response returned when retrieving a ShipStation purchase order.",
    ),
  }),
];
