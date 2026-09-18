import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
const service = "megaventory";
const filter = s.object(
  "A documented Megaventory search filter.",
  {
    fieldName: s.nonEmptyString("The upstream field name to filter."),
    searchOperator: s.stringEnum("The comparison operator for this filter.", [
      "Undefined",
      "Equals",
      "NotEquals",
      "BeginsWith",
      "EndsWith",
      "Contains",
      "GreaterThan",
      "LessThan",
    ]),
    searchValue: s.unknown("The value compared with the selected field."),
    andOr: s.stringEnum("How this filter is combined with the preceding filter.", ["And", "Or"]),
    group: s.stringEnum("How this filter opens or closes a filter group.", [
      "Undefined",
      "NoGroup",
      "StartGroup",
      "EndGroup",
    ]),
  },
  { optional: ["andOr", "group"] },
);
const listInput = s.object(
  "Filters for a Megaventory list operation.",
  {
    filters: s.array("The filters applied by Megaventory.", filter),
    returnTopNRecords: s.integer("The maximum records returned, or -1 for every match.", { minimum: -1 }),
  },
  { optional: ["filters", "returnTopNRecords"] },
);
const responseStatus = s.looseObject("The status returned by Megaventory.", {
  ErrorCode: s.string("The error code; zero indicates success."),
  Message: s.optional(s.string("The human-readable status message.")),
});
const listOutput = (description: string, key: string, item: string) =>
  s.object(description, {
    [key]: s.array(`The ${item} returned by Megaventory.`, s.looseObject(`One ${item}.`)),
    responseStatus,
  });
const product = s.object(
  "The product fields to insert or update.",
  {
    productSku: s.nonEmptyString("The unique product SKU."),
    productDescription: s.nonEmptyString("The product description."),
    productType: s.stringEnum("The documented product type.", [
      "BuyFromSupplier",
      "Service",
      "ManufactureFromWorkOrder",
      "BuyFromSupplierOrManufactureFromWorkOrder",
      "TimeRestrictedService",
      "ProductBundle",
      "Undefined",
    ]),
    productVersion: s.string("The product version."),
    productEan: s.string("The product EAN or barcode."),
    unitOfMeasurement: s.string("The unit of measurement."),
    sellingPrice: s.number("The default selling price."),
    purchasePrice: s.number("The default purchase price."),
    comments: s.string("Comments stored with the product."),
    imageUrl: s.url("The public product image URL."),
  },
  {
    optional: [
      "productType",
      "productVersion",
      "productEan",
      "unitOfMeasurement",
      "sellingPrice",
      "purchasePrice",
      "comments",
      "imageUrl",
    ],
  },
);
const row = (kind: string) =>
  s.object(
    `One ${kind} order line.`,
    {
      productSku: s.nonEmptyString("The product SKU."),
      quantity: s.number("The ordered quantity.", { exclusiveMinimum: 0 }),
      unitPrice: s.number("The unit price before tax and discount."),
      taxId: s.integer("The tax identifier."),
      discountId: s.integer("The discount identifier."),
      remarks: s.string("Line remarks."),
    },
    { optional: ["unitPrice", "taxId", "discountId", "remarks"] },
  );
const order = (kind: "sales" | "purchase") =>
  s.object(
    `The ${kind} order fields to insert or update.`,
    {
      orderId: s.nonNegativeInteger("The existing order ID; omit for a new order."),
      orderTypeId: s.positiveInteger("The order document type ID."),
      ...(kind === "sales"
        ? { clientId: s.positiveInteger("The client ID.") }
        : { supplierId: s.positiveInteger("The supplier ID.") }),
      inventoryLocationId: s.positiveInteger("The inventory location ID."),
      status: s.stringEnum(
        "The documented order status.",
        kind === "sales"
          ? [
              "ValidStatus",
              "Pending",
              "Verified",
              "PartiallyShipped",
              "PartiallyShippedAndPartiallyInvoiced",
              "FullyShipped",
              "PartiallyInvoiced",
              "FullyInvoiced",
              "Closed",
              "Cancelled",
            ]
          : [
              "ValidStatus",
              "Pending",
              "Verified",
              "PartiallyReceived",
              "PartiallyReceivedAndPartiallyInvoiced",
              "FullyReceived",
              "PartiallyInvoiced",
              "FullyInvoiced",
              "Closed",
              "Cancelled",
            ],
      ),
      orderNumber: s.string("The order number."),
      referenceNumber: s.string("The caller's reference number."),
      comments: s.string("Order comments."),
      details: s.array("The order lines.", row(kind), { minItems: 1 }),
    },
    { optional: ["orderId", "orderNumber", "referenceNumber", "comments"] },
  );
const orderOutput = (kind: string) =>
  s.object(
    `The ${kind} order returned after the update.`,
    {
      order: s.looseObject(`The inserted or updated ${kind} order.`),
      responseStatus,
      entityId: s.integer("The entity identifier."),
      relatedDocumentId: s.integer("The related document identifier."),
    },
    { optional: ["entityId", "relatedDocumentId"] },
  );
const list = (name: string, description: string, key: string, item: string) =>
  defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    requiredScopes: [],
    inputSchema: listInput,
    outputSchema: listOutput(description, key, item),
  });
export const megaventoryActions: ActionDefinition[] = [
  list(
    "list_products",
    "List Megaventory products using documented structured filters.",
    "products",
    "product records",
  ),
  defineProviderAction(service, {
    name: "upsert_product",
    operationType: "write",
    description: "Insert a new Megaventory product or update its non-empty fields by SKU.",
    requiredScopes: [],
    inputSchema: product,
    outputSchema: s.object("The updated product.", {
      product: s.looseObject("The inserted or updated product."),
      responseStatus,
    }),
  }),
  list(
    "list_supplier_clients",
    "List Megaventory suppliers and clients for order lookups.",
    "supplierClients",
    "supplier-client records",
  ),
  list(
    "list_inventory_locations",
    "List Megaventory inventory locations for order lookups.",
    "inventoryLocations",
    "inventory location records",
  ),
  list(
    "list_document_types",
    "List Megaventory document types for sales and purchase orders.",
    "documentTypes",
    "document type records",
  ),
  list(
    "list_sales_orders",
    "List Megaventory sales orders using documented structured filters.",
    "salesOrders",
    "sales order records",
  ),
  defineProviderAction(service, {
    name: "upsert_sales_order",
    operationType: "write",
    description: "Insert or update a Megaventory sales order with one or more order lines.",
    requiredScopes: [],
    inputSchema: order("sales"),
    outputSchema: orderOutput("sales"),
  }),
  list(
    "list_purchase_orders",
    "List Megaventory purchase orders using documented structured filters.",
    "purchaseOrders",
    "purchase order records",
  ),
  defineProviderAction(service, {
    name: "upsert_purchase_order",
    operationType: "write",
    description: "Insert or update a Megaventory purchase order with one or more order lines.",
    requiredScopes: [],
    inputSchema: order("purchase"),
    outputSchema: orderOutput("purchase"),
  }),
];
