import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "appstle_subscriptions";

const customerIdSchema = s.positiveInteger("Numeric Shopify customer ID, without a gid:// prefix.");
const cursorSchema = s.string("Pagination cursor returned by Appstle for subscription contracts.", {
  minLength: 1,
});
const pageSchema = s.nonNegativeInteger("Zero-based page number to request from Appstle.");
const sizeSchema = s.positiveInteger("Page size for the customer list.");
const sortSchema = s.array(
  "Spring pageable sort directives such as id,desc.",
  s.string("One sort directive accepted by Appstle.", { minLength: 1 }),
);

const customerSummarySchema = s.looseObject("Appstle customer subscription summary.", {
  customerId: s.integer("Numeric Shopify customer ID."),
  name: s.string("Customer name returned by Appstle."),
  email: s.string("Customer email address returned by Appstle."),
  activeSubscriptions: s.integer("Number of active subscriptions for the customer."),
  inActiveSubscriptions: s.integer("Number of inactive subscriptions for the customer."),
  lifetimeValue: s.number("Customer lifetime value returned by Appstle."),
  nextOrderDate: s.dateTime("Next subscription order timestamp, when present."),
});
const subscriptionDetailSchema = s.looseObject("Appstle subscription detail object.");
const customerDetailSchema = s.looseObject("Appstle customer detail object.");

export const appstleSubscriptionsActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_customers_with_subscriptions",
    operationType: "read",
    description: "List customers who have Appstle subscription contracts with optional filters and pagination.",
    inputSchema: s.object(
      "Filters and pagination for listing customers with subscriptions.",
      {
        name: s.string("Filter customers by name. Partial matches are supported.", { minLength: 1 }),
        email: s.email("Filter customers by exact email address."),
        activeMoreThanOneSubscription: s.boolean(
          "Whether to return only customers with more than one active subscription.",
        ),
        page: pageSchema,
        size: sizeSchema,
        sort: sortSchema,
      },
      { optional: ["name", "email", "activeMoreThanOneSubscription", "page", "size", "sort"] },
    ),
    outputSchema: s.object("Customers with subscription summaries.", {
      customers: s.array("Customers returned by Appstle.", customerSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_customer_with_subscriptions",
    operationType: "read",
    description: "Retrieve Appstle customer details including subscription contract information.",
    inputSchema: s.object(
      "Customer lookup parameters.",
      {
        customerId: customerIdSchema,
        cursor: cursorSchema,
      },
      { required: ["customerId"] },
    ),
    outputSchema: s.object("Customer details with subscription contracts.", {
      customer: s.nullable(customerDetailSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_valid_subscription_contract_ids",
    operationType: "read",
    description: "Return valid Appstle subscription contract IDs for a Shopify customer.",
    inputSchema: s.object(
      "Customer identifier for valid subscription contract ID lookup.",
      {
        customerId: customerIdSchema,
      },
      { required: ["customerId"] },
    ),
    outputSchema: s.object("Valid subscription contract IDs for the customer.", {
      contractIds: s.array(
        "Numeric Shopify subscription contract IDs returned by Appstle.",
        s.integer("Numeric Shopify subscription contract ID."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_customer_subscription_details",
    operationType: "read",
    description: "List detailed Appstle subscription contract records for a Shopify customer.",
    inputSchema: s.object(
      "Customer identifier for detailed subscription lookup.",
      {
        customerId: customerIdSchema,
      },
      { required: ["customerId"] },
    ),
    outputSchema: s.object("Detailed subscription contracts for the customer.", {
      subscriptions: s.array("Detailed Appstle subscription contract objects.", subscriptionDetailSchema),
    }),
  }),
];
