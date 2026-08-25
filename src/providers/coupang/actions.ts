import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coupang";

const identifierSchema = (description: string) => s.positiveInteger(description);
const responseCodeSchema = s.anyOf("The result code returned by Coupang.", [
  s.string("A textual Coupang result code."),
  s.integer("A numeric Coupang result code."),
]);
const rawRecordSchema = (description: string) => s.looseObject(description);

const productListInputSchema = s.object(
  "Filters and pagination for Coupang seller products.",
  {
    nextToken: s.string("The next-page token returned by a previous product query."),
    maxPerPage: s.integer("The maximum number of products to return, from 1 through 100.", {
      minimum: 1,
      maximum: 100,
    }),
    sellerProductId: identifierSchema("A Coupang seller product ID to match."),
    sellerProductName: s.string("A seller product name to search for, up to 20 characters.", {
      maxLength: 20,
    }),
    status: s.stringEnum("The seller product approval status to match.", [
      "IN_REVIEW",
      "SAVED",
      "APPROVING",
      "APPROVED",
      "PARTIAL_APPROVED",
      "DENIED",
      "DELETED",
    ]),
    manufacture: s.string("The product manufacturer to match."),
    createdAt: s.string("The product creation date in YYYY-MM-DD format."),
  },
  {
    optional: ["nextToken", "maxPerPage", "sellerProductId", "sellerProductName", "status", "manufacture", "createdAt"],
  },
);

const listOutputSchema = (description: string, itemDescription: string) =>
  s.object(description, {
    code: responseCodeSchema,
    message: s.string("The result message returned by Coupang."),
    nextToken: s.nullable(s.string("The token for the next page when another page exists.")),
    items: s.array(itemDescription, rawRecordSchema(itemDescription)),
  });

const objectOutputSchema = (description: string) =>
  s.object(description, {
    code: responseCodeSchema,
    message: s.string("The result message returned by Coupang."),
    data: rawRecordSchema("The Coupang record returned by the endpoint."),
  });

const mutationOutputSchema = s.object("The result of a Coupang item update.", {
  code: responseCodeSchema,
  message: s.string("The result message returned by Coupang."),
});

export const coupangActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_products",
    description: "List seller products in Coupang with optional filters and cursor pagination.",
    requiredScopes: [],
    inputSchema: productListInputSchema,
    outputSchema: listOutputSchema("A page of Coupang seller products.", "Coupang seller products."),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Get the registered details of one Coupang seller product.",
    requiredScopes: [],
    inputSchema: s.object("The Coupang seller product to retrieve.", {
      sellerProductId: identifierSchema("The registered Coupang seller product ID."),
    }),
    outputSchema: objectOutputSchema("One Coupang seller product response."),
  }),
  defineProviderAction(service, {
    name: "get_item_inventory",
    description: "Get the stock quantity, sale price, and sale status of one Coupang item.",
    requiredScopes: [],
    inputSchema: s.object("The Coupang item to inspect.", {
      vendorItemId: identifierSchema("The Coupang vendor item ID."),
    }),
    outputSchema: objectOutputSchema("The quantity, price, and status of one Coupang item."),
  }),
  defineProviderAction(service, {
    name: "update_item_quantity",
    description: "Replace the available inventory quantity of one Coupang item.",
    requiredScopes: [],
    inputSchema: s.object("The Coupang item and replacement inventory quantity.", {
      vendorItemId: identifierSchema("The Coupang vendor item ID."),
      quantity: s.integer("The replacement inventory quantity.", { minimum: 0 }),
    }),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_item_price",
    description: "Replace the selling price and optional auto-pricing settings of one Coupang item.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Coupang item, replacement price, and optional price controls.",
      {
        vendorItemId: identifierSchema("The Coupang vendor item ID."),
        price: s.positiveInteger("The replacement selling price in whole currency units."),
        forceSalePriceUpdate: s.boolean("Whether to bypass Coupang's normal price-change range."),
        apMinSalePrice: s.positiveInteger("The minimum sale price used by automatic pricing."),
        apActive: s.boolean("Whether automatic pricing is enabled."),
      },
      { optional: ["forceSalePriceUpdate", "apMinSalePrice", "apActive"] },
    ),
    outputSchema: mutationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description: "List Coupang purchase orders for a date range and fulfillment status.",
    requiredScopes: [],
    inputSchema: s.object(
      "The date range, status, and pagination for Coupang purchase orders.",
      {
        createdAtFrom: s.string("The query start in Coupang ISO-8601 form, such as 2026-08-01+09:00."),
        createdAtTo: s.string("The query end in Coupang ISO-8601 form, up to 31 days after the start."),
        status: s.stringEnum("The purchase-order fulfillment status.", [
          "ACCEPT",
          "INSTRUCT",
          "DEPARTURE",
          "DELIVERING",
          "FINAL_DELIVERY",
          "NONE_TRACKING",
        ]),
        nextToken: s.string("The next-page token returned by a previous order query."),
        maxPerPage: s.integer("The maximum number of orders to return, up to 50.", {
          minimum: 1,
          maximum: 50,
        }),
      },
      { optional: ["nextToken", "maxPerPage"] },
    ),
    outputSchema: listOutputSchema("A page of Coupang purchase orders.", "Coupang purchase orders."),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Get current purchase-order and receiver details for one Coupang order.",
    requiredScopes: [],
    inputSchema: s.object("The Coupang order to retrieve.", {
      orderId: identifierSchema("The numeric Coupang order ID."),
    }),
    outputSchema: listOutputSchema("The purchase-order records for one Coupang order.", "Purchase-order records."),
  }),
  defineProviderAction(service, {
    name: "list_return_requests",
    description: "List Coupang return or cancellation requests submitted in a time range.",
    requiredScopes: [],
    inputSchema: s.object(
      "The time range and filters for Coupang return or cancellation requests.",
      {
        createdAtFrom: s.string("The start date or minute in YYYY-MM-DD or YYYY-MM-DDTHH:mm form."),
        createdAtTo: s.string("The end date or minute in YYYY-MM-DD or YYYY-MM-DDTHH:mm form."),
        searchType: s.literal("timeFrame", {
          description: "Set this to timeFrame for a minute-level query; omit it for a daily paginated query.",
        }),
        status: s.stringEnum("The Coupang return request status to match.", ["RU", "UC", "CC", "PR"]),
        cancelType: s.stringEnum("Whether to list returns or payment-stage cancellations.", ["RETURN", "CANCEL"]),
        nextToken: s.string("The next-page token returned by a previous daily query."),
        maxPerPage: s.integer("The maximum number of daily results to return.", { minimum: 1 }),
        orderId: identifierSchema("A specific Coupang order ID to match."),
      },
      { optional: ["searchType", "status", "cancelType", "nextToken", "maxPerPage", "orderId"] },
    ),
    outputSchema: listOutputSchema(
      "Coupang return or cancellation requests.",
      "Coupang return or cancellation requests.",
    ),
  }),
];
