import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "baselinker";

export type BaseLinkerActionName =
  | "list_order_statuses"
  | "list_orders"
  | "list_order_events"
  | "list_inventories"
  | "list_inventory_warehouses"
  | "list_inventory_products";

const looseObjectSchema = s.looseObject("A raw object returned by BaseLinker.");
const nonNegativeUnixTimestampSchema = s.nonNegativeInteger("Unix timestamp value accepted by BaseLinker.");
const positiveIntegerSchema = (description: string) => s.positiveInteger(description);
const optionalStringSchema = (description: string) => s.string({ description, minLength: 1 });

const emptyInputSchema = (description: string) => s.object({}, { description });

const orderStatusSchema = s.looseObject(
  {
    id: s.integer("Status ID."),
    name: s.string("Status name."),
    color: s.string("Status color as a hex value."),
    group_id: s.integer("Status group ID."),
    is_primary: s.integer("Whether this is the primary status, represented as 0 or 1."),
    name_for_customer: s.string("Full status name displayed to the customer."),
  },
  { description: "A BaseLinker order status." },
);

const orderSchema = s.looseObject(
  {
    order_id: s.integer("Order identifier from BaseLinker order manager."),
    shop_order_id: s.integer("Order ID assigned by the connected store."),
    external_order_id: s.string("Order identifier assigned by an external marketplace or store."),
    order_source: s.string("Order source, such as shop, personal, or a marketplace code."),
    order_source_id: s.integer("Identifier of the source account or store."),
    order_status_id: s.integer("Current BaseLinker order status ID."),
    date_add: s.integer("Order creation time as a Unix timestamp."),
    date_confirmed: s.integer("Order confirmation time as a Unix timestamp."),
    date_in_status: s.integer("Time when the order entered its current status."),
    confirmed: s.boolean("Whether the order is confirmed."),
    currency: s.string("Three-letter order currency code."),
    email: s.string("Buyer email address."),
    phone: s.string("Buyer phone number."),
    payment_method: s.string("Payment method name."),
    payment_done: s.number("Amount already paid for the order."),
    delivery_method: s.string("Delivery method name."),
    delivery_price: s.number("Gross delivery price."),
    products: s.array("Products included in the order.", looseObjectSchema),
  },
  { description: "A BaseLinker order." },
);

const orderEventSchema = s.looseObject(
  {
    log_id: s.integer("Event log ID returned by BaseLinker."),
    id: s.integer("Event ID when BaseLinker returns the documented id field."),
    order_id: s.integer("Order identifier associated with the event."),
    log_type: s.integer("BaseLinker event type identifier."),
    object_id: s.integer("Additional object identifier associated with the event type."),
    date: s.integer("Event time as a Unix timestamp."),
  },
  { description: "A BaseLinker order event." },
);

const inventorySchema = s.looseObject(
  {
    inventory_id: s.integer("Inventory catalog ID."),
    name: s.string("Inventory catalog name."),
    description: s.string("Inventory catalog description."),
    languages: s.array("Languages available in the inventory.", s.string("Language code.")),
    default_language: s.string("Default inventory language code."),
    price_groups: s.array("Price group IDs available in the inventory.", s.integer("Price group ID.")),
    default_price_group: s.integer("Default price group ID."),
    warehouses: s.array(
      "Warehouse IDs available in the inventory.",
      s.string("Warehouse ID such as bl_205, shop_2334, or warehouse_4556."),
    ),
    default_warehouse: s.string("Default warehouse ID."),
    reservations: s.boolean("Whether this inventory supports reservations."),
    is_default: s.boolean("Whether this is the default inventory catalog."),
  },
  { description: "A BaseLinker inventory catalog." },
);

const warehouseSchema = s.looseObject(
  {
    warehouse_type: s.string("Warehouse type, such as bl, shop, warehouse, fulfillment, or blconnect."),
    warehouse_id: s.integer("Warehouse identifier."),
    name: s.string("Warehouse name."),
    description: s.string("Warehouse description."),
    stock_edition: s.boolean("Whether manual stock editing is permitted for this warehouse."),
    is_default: s.boolean("Whether this is the default warehouse."),
    address: s.string("Warehouse street address."),
    postcode: s.string("Warehouse postal code."),
    city: s.string("Warehouse city."),
    country: s.string("Warehouse country as a two-letter ISO 3166-1 code."),
  },
  { description: "A BaseLinker inventory warehouse." },
);

const productSchema = s.looseObject(
  {
    id: s.integer("Product ID."),
    parent_id: s.integer("Parent product ID, or 0 for a main product."),
    ean: s.string("Product EAN."),
    sku: s.string("Product SKU."),
    name: s.string("Product name."),
    prices: s.record("Gross prices keyed by price group ID.", s.number("Gross product price.")),
    stock: s.record("Stock quantity keyed by warehouse ID.", s.integer("Product stock quantity.")),
  },
  { description: "A BaseLinker inventory product summary." },
);

const listOrdersInputSchema = s.object(
  {
    order_id: positiveIntegerSchema("Order identifier. When provided, only this order is returned."),
    date_confirmed_from: nonNegativeUnixTimestampSchema,
    date_from: nonNegativeUnixTimestampSchema,
    id_from: positiveIntegerSchema("Order ID from which subsequent orders are collected."),
    get_unconfirmed_orders: s.boolean("Whether to include unconfirmed orders."),
    status_id: s.integer("Order status identifier used to filter orders."),
    filter_email: s.email("Email address used to filter orders."),
    filter_order_source: optionalStringSchema("Order source filter, such as ebay or amazon."),
    filter_order_source_id: s.integer("Order source identifier filter."),
    filter_shop_order_id: s.integer("Shop order identifier filter."),
    filter_external_order_id: optionalStringSchema("External marketplace or store order ID filter."),
    include_custom_extra_fields: s.boolean("Whether to include custom order extra fields."),
    include_commissions: s.boolean("Whether to include marketplace commission data."),
    include_connect_data: s.boolean("Whether to include Base Connect contractor data."),
    include_discounts_data: s.boolean("Whether to include applied discount data."),
  },
  {
    optional: [
      "order_id",
      "date_confirmed_from",
      "date_from",
      "id_from",
      "get_unconfirmed_orders",
      "status_id",
      "filter_email",
      "filter_order_source",
      "filter_order_source_id",
      "filter_shop_order_id",
      "filter_external_order_id",
      "include_custom_extra_fields",
      "include_commissions",
      "include_connect_data",
      "include_discounts_data",
    ],
    description: "Input parameters for listing BaseLinker orders.",
  },
);

const listOrderEventsInputSchema = s.object(
  {
    last_log_id: s.nonNegativeInteger("Log ID from which events should be retrieved."),
    logs_types: s.array("Event type IDs to include.", s.integer("BaseLinker event type ID.")),
    order_id: positiveIntegerSchema("Order identifier used to filter events."),
  },
  {
    optional: ["last_log_id", "logs_types", "order_id"],
    description: "Input parameters for listing BaseLinker order events.",
  },
);

const listInventoryProductsInputSchema = s.object(
  {
    inventory_id: positiveIntegerSchema("Inventory catalog ID returned by list_inventories."),
    filter_id: positiveIntegerSchema("Product ID filter."),
    filter_category_id: positiveIntegerSchema("Category ID filter."),
    filter_ean: optionalStringSchema("Product EAN filter."),
    filter_sku: optionalStringSchema("Product SKU filter."),
    filter_name: optionalStringSchema("Product name search filter."),
    filter_price_from: s.number("Minimum product price filter."),
    filter_price_to: s.number("Maximum product price filter."),
    filter_stock_from: s.integer("Minimum stock quantity filter."),
    filter_stock_to: s.integer("Maximum stock quantity filter."),
    page: positiveIntegerSchema("One-based result page. BaseLinker returns up to 1000 products per page."),
    filter_sort: optionalStringSchema('Sort expression accepted by BaseLinker, such as "id ASC".'),
    filter_locations: optionalStringSchema("Location name filter."),
    include_variants: s.boolean("Whether to include product variants in addition to main products."),
  },
  {
    required: ["inventory_id"],
    optional: [
      "filter_id",
      "filter_category_id",
      "filter_ean",
      "filter_sku",
      "filter_name",
      "filter_price_from",
      "filter_price_to",
      "filter_stock_from",
      "filter_stock_to",
      "page",
      "filter_sort",
      "filter_locations",
      "include_variants",
    ],
    description: "Input parameters for listing BaseLinker inventory products.",
  },
);

export const baseLinkerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_order_statuses",
    operationType: "read",
    description: "List order statuses configured in the BaseLinker order manager.",
    inputSchema: emptyInputSchema("Input parameters for listing BaseLinker order statuses."),
    outputSchema: s.object(
      { statuses: s.array("Order statuses returned by BaseLinker.", orderStatusSchema) },
      { description: "BaseLinker order statuses response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List BaseLinker orders using official order manager filters, returning up to 100 orders.",
    inputSchema: listOrdersInputSchema,
    outputSchema: s.object(
      { orders: s.array("Orders returned by BaseLinker.", orderSchema) },
      { description: "BaseLinker order list response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_order_events",
    operationType: "read",
    description: "List recent BaseLinker order events from the order journal.",
    inputSchema: listOrderEventsInputSchema,
    outputSchema: s.object(
      { logs: s.array("Order events returned by BaseLinker.", orderEventSchema) },
      { description: "BaseLinker order events response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_inventories",
    operationType: "read",
    description: "List inventory catalogs available in BaseLinker storage.",
    inputSchema: emptyInputSchema("Input parameters for listing BaseLinker inventory catalogs."),
    outputSchema: s.object(
      { inventories: s.array("Inventory catalogs returned by BaseLinker.", inventorySchema) },
      { description: "BaseLinker inventories response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_inventory_warehouses",
    operationType: "read",
    description: "List warehouses available in BaseLinker inventories.",
    inputSchema: emptyInputSchema("Input parameters for listing BaseLinker inventory warehouses."),
    outputSchema: s.object(
      { warehouses: s.array("Inventory warehouses returned by BaseLinker.", warehouseSchema) },
      { description: "BaseLinker inventory warehouses response." },
    ),
  }),
  defineProviderAction(service, {
    name: "list_inventory_products",
    operationType: "read",
    description: "List basic product data from a BaseLinker inventory catalog.",
    inputSchema: listInventoryProductsInputSchema,
    outputSchema: s.object(
      { products: s.record("Products keyed by product ID.", productSchema) },
      { description: "BaseLinker inventory product summaries response." },
    ),
  }),
];
