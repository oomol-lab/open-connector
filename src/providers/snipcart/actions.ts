import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "snipcart";

const offsetSchema = s.integer("The number of matching records to skip before returning results.", {
  minimum: 0,
});
const limitSchema = s.integer("The maximum number of records Snipcart should return.", {
  minimum: 1,
});
const dateTimeSchema = s.string("An ISO 8601 date and time used to filter records.", {
  format: "date-time",
});
const orderTokenSchema = s.nonEmptyString("The Snipcart order token.");
const customerIdSchema = s.nonEmptyString("The Snipcart customer identifier.");

const paginatedOutputSchema = (description: string, itemDescription: string) =>
  s.object(description, {
    totalItems: s.integer("The total number of matching records."),
    offset: s.integer("The number of records skipped for this page."),
    limit: s.integer("The maximum number of records requested for this page."),
    items: s.array("The records returned for this page.", s.looseObject(itemDescription)),
  });

export const snipcartActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_orders",
    description: "List completed Snipcart orders with pagination and optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing completed Snipcart orders.",
      {
        offset: offsetSchema,
        limit: limitSchema,
        status: s.stringEnum("The order status to match.", [
          "InProgress",
          "Processed",
          "Disputed",
          "Shipped",
          "Delivered",
          "Pending",
          "Cancelled",
        ]),
        invoiceNumber: s.nonEmptyString("The exact invoice number to match."),
        productId: s.nonEmptyString("The user-defined product identifier to match."),
        placedBy: s.nonEmptyString("The purchaser name or email address to match."),
        from: dateTimeSchema,
        to: dateTimeSchema,
        includeTestOrders: s.boolean("Whether a Live-mode key should also return Test-mode orders."),
      },
      {
        optional: [
          "offset",
          "limit",
          "status",
          "invoiceNumber",
          "productId",
          "placedBy",
          "from",
          "to",
          "includeTestOrders",
        ],
      },
    ),
    outputSchema: paginatedOutputSchema(
      "The paginated Snipcart order response.",
      "An order object returned by Snipcart.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Retrieve one Snipcart order by token.",
    requiredScopes: [],
    inputSchema: s.object(
      "The order token and optional environment behavior for retrieving one order.",
      {
        token: orderTokenSchema,
        includeTestOrders: s.boolean("Whether a Live-mode key should also search for a Test-mode order."),
      },
      { optional: ["includeTestOrders"] },
    ),
    outputSchema: s.object("The Snipcart order response.", {
      order: s.looseObject("The complete order object returned by Snipcart."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Snipcart customers with pagination and optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing Snipcart customers.",
      {
        offset: offsetSchema,
        limit: limitSchema,
        status: s.stringEnum("The customer account status to match.", ["confirmed", "unconfirmed"]),
        email: s.email("The customer email address to match."),
        name: s.nonEmptyString("The customer name to match."),
        from: dateTimeSchema,
        to: dateTimeSchema,
      },
      { optional: ["offset", "limit", "status", "email", "name", "from", "to"] },
    ),
    outputSchema: paginatedOutputSchema(
      "The paginated Snipcart customer response.",
      "A customer object returned by Snipcart.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve one Snipcart customer by ID.",
    requiredScopes: [],
    inputSchema: s.object("The identifier for retrieving one Snipcart customer.", {
      customerId: customerIdSchema,
    }),
    outputSchema: s.object("The Snipcart customer response.", {
      customer: s.looseObject("The complete customer object returned by Snipcart."),
    }),
  }),
];
