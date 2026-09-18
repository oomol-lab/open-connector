import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "samcart";

const idInputSchema = (resource: string) =>
  s.object(`The input payload for retrieving a SamCart ${resource}.`, {
    id: s.integer(`The SamCart ID of the ${resource}.`, { minimum: 1 }),
  });

const dateFilterProperties = {
  created_at_min: s.string("Return records created at or after this ISO 8601 date or timestamp."),
  created_at_max: s.string("Return records created at or before this ISO 8601 date or timestamp."),
};

const paginationProperties = {
  offset: s.integer("The record ID used as the pagination cursor.", { minimum: 1 }),
  limit: s.integer("The maximum number of records to return, up to 100.", {
    minimum: 1,
    maximum: 100,
  }),
  dir: s.stringEnum("The direction in which to move from the pagination cursor.", ["next", "prev"]),
};

const listInputSchema = (resource: string, properties: Record<string, Record<string, unknown>> = {}) =>
  s.object(
    `Filters and pagination for listing SamCart ${resource}.`,
    { ...dateFilterProperties, ...paginationProperties, ...properties },
    {
      optional: [
        ...Object.keys(dateFilterProperties),
        ...Object.keys(paginationProperties),
        ...Object.keys(properties),
      ],
    },
  );

const resourceSchema = (resource: string) =>
  s.looseObject(`The ${resource} object returned by SamCart.`, {
    id: s.integer(`The SamCart ID of the ${resource}.`),
  });

const listOutputSchema = (resource: string) =>
  s.object(`A page of SamCart ${resource}.`, {
    data: s.array(`The ${resource} returned on this page.`, resourceSchema(resource)),
    pagination: s.nullable(
      s.looseObject("Pagination links returned by SamCart for this page.", {
        next: s.nullable(s.string("The URL for the next page, when one is available.")),
        prev: s.nullable(s.string("The URL for the previous page, when one is available.")),
      }),
    ),
  });

const customerListInputSchema = listInputSchema("customers", {
  email: s.string("One email address or up to 25 comma-separated email addresses to match exactly."),
});

const productListInputSchema = listInputSchema("products", {
  status: s.stringEnum("The product status to return.", ["live", "test", "archived"]),
  product_category: s.stringEnum("The product category to return.", ["physical", "digital"]),
  pricing_type: s.stringEnum("The product pricing type to return.", [
    "one_time",
    "limited_subscription",
    "recurring_subscription",
    "pwyw_one_time",
    "pwyw_recurring_subscription",
    "pwyw_limited_subscription",
  ]),
});

const testModeProperty = {
  test_mode: s.boolean("Whether to return only test-mode records."),
};

const subscriptionListInputSchema = listInputSchema("subscriptions", {
  rebilling_at_min: s.string("Return subscriptions rebilling at or after this ISO 8601 date or timestamp."),
  rebilling_at_max: s.string("Return subscriptions rebilling at or before this ISO 8601 date or timestamp."),
  canceled_at_min: s.string("Return subscriptions canceled at or after this ISO 8601 date or timestamp."),
  canceled_at_max: s.string("Return subscriptions canceled at or before this ISO 8601 date or timestamp."),
  status: s.stringEnum("The subscription status to return.", [
    "active",
    "canceled",
    "delinquent",
    "completed",
    "paused",
    "invalid_processor",
    "sca_required",
    "deleted",
  ]),
  type: s.stringEnum("The subscription type to return.", ["limited_subscription", "recurring_subscription"]),
  ...testModeProperty,
});

export const samcartActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List customers in the connected SamCart marketplace.",
    requiredScopes: [],
    inputSchema: customerListInputSchema,
    outputSchema: listOutputSchema("customers"),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve a customer by its SamCart ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("customer"),
    outputSchema: resourceSchema("customer"),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List products in the connected SamCart marketplace.",
    requiredScopes: [],
    inputSchema: productListInputSchema,
    outputSchema: listOutputSchema("products"),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve a product by its SamCart ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("product"),
    outputSchema: resourceSchema("product"),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List orders in the connected SamCart marketplace.",
    requiredScopes: [],
    inputSchema: listInputSchema("orders", testModeProperty),
    outputSchema: listOutputSchema("orders"),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Retrieve an order by its SamCart ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("order"),
    outputSchema: resourceSchema("order"),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    operationType: "read",
    description: "List subscriptions in the connected SamCart marketplace.",
    requiredScopes: [],
    inputSchema: subscriptionListInputSchema,
    outputSchema: listOutputSchema("subscriptions"),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    operationType: "read",
    description: "Retrieve a subscription by its SamCart ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("subscription"),
    outputSchema: resourceSchema("subscription"),
  }),
];
