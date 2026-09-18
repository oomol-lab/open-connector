import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chargify";
const resourceId = (description: string) => s.positiveInteger(description);
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableInteger = (description: string) => s.nullable(s.integer(description));

const customerSchema = s.object("A normalized Maxio Advanced Billing customer.", {
  id: nullableInteger("The Maxio customer ID when returned."),
  firstName: nullableString("The customer first name when returned."),
  lastName: nullableString("The customer last name when returned."),
  email: nullableString("The customer email address when returned."),
  organization: nullableString("The customer organization when returned."),
  reference: nullableString("The merchant-defined customer reference when returned."),
  raw: s.looseObject("The raw customer object returned by Maxio."),
});

const productSchema = s.object("A normalized Maxio Advanced Billing product.", {
  id: nullableInteger("The Maxio product ID when returned."),
  name: nullableString("The product name when returned."),
  handle: nullableString("The product API handle when returned."),
  priceInCents: nullableInteger("The product price in cents when returned."),
  interval: nullableInteger("The product billing interval when returned."),
  intervalUnit: nullableString("The product billing interval unit when returned."),
  archivedAt: nullableString("The product archive timestamp when returned."),
  raw: s.looseObject("The raw product object returned by Maxio."),
});

const subscriptionSchema = s.object("A normalized Maxio Advanced Billing subscription.", {
  id: nullableInteger("The Maxio subscription ID when returned."),
  state: nullableString("The subscription state when returned."),
  customerId: nullableInteger("The related customer ID when returned."),
  productId: nullableInteger("The related product ID when returned."),
  currentPeriodEndsAt: nullableString("The current billing period end timestamp when returned."),
  nextAssessmentAt: nullableString("The next assessment timestamp when returned."),
  currency: nullableString("The subscription currency when returned."),
  raw: s.looseObject("The raw subscription object returned by Maxio."),
});

const pageField = () => s.positiveInteger("The one-based result page to retrieve.");
const perPageField = (resource: string) =>
  s.integer(`The number of ${resource} to return per page.`, { minimum: 1, maximum: 200 });

export const chargifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers",
    operationType: "read",
    description: "List Maxio Advanced Billing customers with search and pagination filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Maxio customers.",
      {
        page: s.positiveInteger("The one-based result page to retrieve."),
        perPage: s.integer("The number of customers to return per page.", {
          minimum: 1,
          maximum: 200,
        }),
        query: s.nonEmptyString("Search customers by email, ID, reference, or organization."),
        direction: s.stringEnum("The customer sort direction.", ["asc", "desc"]),
      },
      { optional: ["page", "perPage", "query", "direction"] },
    ),
    outputSchema: s.object("A page of normalized Maxio customers.", {
      customers: s.array("The customers returned for this page.", customerSchema),
      page: s.positiveInteger("The requested result page."),
      hasMore: s.boolean("Whether another page may be available."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    operationType: "read",
    description: "Retrieve one Maxio Advanced Billing customer by ID.",
    requiredScopes: [],
    inputSchema: s.object("The customer lookup input.", {
      customerId: resourceId("The Maxio customer ID."),
    }),
    outputSchema: s.object("A normalized Maxio customer response.", { customer: customerSchema }),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List Maxio Advanced Billing products with pagination and archive filtering.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Maxio products.",
      {
        page: pageField(),
        perPage: perPageField("products"),
        includeArchived: s.boolean("Whether archived products should be included."),
      },
      { optional: ["page", "perPage", "includeArchived"] },
    ),
    outputSchema: s.object("A page of normalized Maxio products.", {
      products: s.array("The products returned for this page.", productSchema),
      page: s.positiveInteger("The requested result page."),
      hasMore: s.boolean("Whether another page may be available."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve one Maxio Advanced Billing product by ID.",
    requiredScopes: [],
    inputSchema: s.object("The product lookup input.", {
      productId: resourceId("The Maxio product ID."),
    }),
    outputSchema: s.object("A normalized Maxio product response.", { product: productSchema }),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    operationType: "read",
    description: "List Maxio Advanced Billing subscriptions with common filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for listing Maxio subscriptions.",
      {
        page: pageField(),
        perPage: perPageField("subscriptions"),
        state: s.nonEmptyString("Filter subscriptions by documented Maxio state."),
        productId: resourceId("Filter subscriptions by product ID."),
        direction: s.stringEnum("The subscription sort direction.", ["asc", "desc"]),
      },
      { optional: ["page", "perPage", "state", "productId", "direction"] },
    ),
    outputSchema: s.object("A page of normalized Maxio subscriptions.", {
      subscriptions: s.array("The subscriptions returned for this page.", subscriptionSchema),
      page: s.positiveInteger("The requested result page."),
      hasMore: s.boolean("Whether another page may be available."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    operationType: "read",
    description: "Retrieve one Maxio Advanced Billing subscription by ID.",
    requiredScopes: [],
    inputSchema: s.object("The subscription lookup input.", {
      subscriptionId: resourceId("The Maxio subscription ID."),
    }),
    outputSchema: s.object("A normalized Maxio subscription response.", {
      subscription: subscriptionSchema,
    }),
  }),
];
