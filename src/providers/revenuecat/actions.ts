import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "revenuecat" as const;

const identifier = (description: string) => s.string({ minLength: 1, maxLength: 1500, description });

const paginationFields = {
  startingAfter: s.string("Return records after this RevenueCat cursor."),
  limit: s.integer("Maximum number of records to return.", { minimum: 1, maximum: 100 }),
};

const rawObject = (description: string) => s.looseObject(description);

const listOutput = (description: string, itemDescription: string) =>
  s.object(description, {
    object: s.literal("list", { description: "RevenueCat list response marker." }),
    items: s.array(rawObject(itemDescription), { description: "Records returned by RevenueCat." }),
    nextPage: s.nullableString("URL for the next page, or null when there are no more records."),
    url: s.string("URL of the current RevenueCat list response."),
  });

const singleOutput = (description: string, field: string, itemDescription: string) =>
  s.object(description, {
    [field]: rawObject(itemDescription),
  });

const expandCustomerFields = s.array(s.stringEnum(["attributes"], { description: "A customer field to expand." }), {
  maxItems: 1,
  description: "Optional customer fields to expand in the response.",
});

const expandOfferingFields = s.array(
  s.stringEnum(["items.package", "items.package.product"], {
    description: "An Offering field to expand.",
  }),
  {
    maxItems: 2,
    description: "Optional Offering fields to expand in the response.",
  },
);

const currency = s.stringEnum(
  ["USD", "EUR", "GBP", "AUD", "CAD", "JPY", "BRL", "KRW", "CNY", "MXN", "SEK", "PLN", "NZD", "CHF"],
  { description: "Currency used for the returned RevenueCat metrics." },
);

const projectInput = (description: string, properties: Record<string, object>, required: string[] = ["projectId"]) =>
  s.object(description, { projectId: identifier("RevenueCat project ID."), ...properties }, { required });

export const revenueCatActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List RevenueCat projects accessible to the configured secret API key.",
    requiredScopes: ["project_configuration:projects:read"],
    inputSchema: s.object("Pagination for RevenueCat projects.", paginationFields),
    outputSchema: listOutput("A paginated list of RevenueCat projects.", "A RevenueCat project."),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List customers in a RevenueCat project, optionally searching by email or customer identifier.",
    requiredScopes: ["customer_information:customers:read"],
    inputSchema: projectInput("Filters for RevenueCat customers.", {
      ...paginationFields,
      search: s.string("Search by customer email, app user ID, store transaction identifier, or Apple order ID.", {
        minLength: 1,
        maxLength: 255,
      }),
    }),
    outputSchema: listOutput("A paginated list of RevenueCat customers.", "A RevenueCat customer."),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve a RevenueCat customer and optionally expand the customer's attributes.",
    requiredScopes: ["customer_information:customers:read"],
    inputSchema: projectInput(
      "Input for retrieving a RevenueCat customer.",
      {
        customerId: identifier("RevenueCat customer or app user ID."),
        expand: expandCustomerFields,
      },
      ["projectId", "customerId"],
    ),
    outputSchema: singleOutput("A RevenueCat customer response.", "customer", "A RevenueCat customer."),
  }),
  defineProviderAction(service, {
    name: "list_customer_subscriptions",
    description: "List subscriptions belonging to a RevenueCat customer.",
    requiredScopes: ["customer_information:subscriptions:read"],
    inputSchema: projectInput(
      "Pagination for a customer's RevenueCat subscriptions.",
      {
        customerId: identifier("RevenueCat customer or app user ID."),
        ...paginationFields,
      },
      ["projectId", "customerId"],
    ),
    outputSchema: listOutput("A paginated list of customer subscriptions.", "A RevenueCat subscription."),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    description: "Retrieve a RevenueCat subscription by its subscription ID.",
    requiredScopes: ["customer_information:subscriptions:read"],
    inputSchema: projectInput(
      "Input for retrieving a RevenueCat subscription.",
      {
        subscriptionId: identifier("RevenueCat subscription ID."),
      },
      ["projectId", "subscriptionId"],
    ),
    outputSchema: singleOutput("A RevenueCat subscription response.", "subscription", "A RevenueCat subscription."),
  }),
  defineProviderAction(service, {
    name: "search_subscriptions",
    description:
      "Find subscriptions by a store subscription identifier such as an Apple transaction ID or Google order ID.",
    requiredScopes: ["customer_information:subscriptions:read"],
    inputSchema: projectInput(
      "Input for searching RevenueCat subscriptions.",
      {
        storeSubscriptionIdentifier: identifier("Store subscription identifier to search for."),
        includeScheduled: s.boolean("Whether to include subscriptions scheduled to start in the future."),
      },
      ["projectId", "storeSubscriptionIdentifier"],
    ),
    outputSchema: listOutput("A list of subscriptions matching the store identifier.", "A RevenueCat subscription."),
  }),
  defineProviderAction(service, {
    name: "list_customer_active_entitlements",
    description: "List the entitlements currently active for a RevenueCat customer.",
    requiredScopes: ["customer_information:customers:read"],
    inputSchema: projectInput(
      "Pagination for a customer's active RevenueCat entitlements.",
      {
        customerId: identifier("RevenueCat customer or app user ID."),
        ...paginationFields,
      },
      ["projectId", "customerId"],
    ),
    outputSchema: listOutput(
      "A paginated list of active customer entitlements.",
      "An active RevenueCat customer entitlement.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_entitlements",
    description: "List entitlement definitions configured in a RevenueCat project.",
    requiredScopes: ["project_configuration:entitlements:read"],
    inputSchema: projectInput("Pagination for RevenueCat entitlements.", paginationFields),
    outputSchema: listOutput("A paginated list of RevenueCat entitlements.", "A RevenueCat entitlement definition."),
  }),
  defineProviderAction(service, {
    name: "list_offerings",
    description: "List offerings configured in a RevenueCat project, optionally expanding packages and products.",
    requiredScopes: ["project_configuration:offerings:read"],
    inputSchema: projectInput("Pagination and expansion options for RevenueCat offerings.", {
      ...paginationFields,
      expand: expandOfferingFields,
    }),
    outputSchema: listOutput("A paginated list of RevenueCat offerings.", "A RevenueCat offering."),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List products configured in a RevenueCat project.",
    requiredScopes: ["project_configuration:products:read"],
    inputSchema: projectInput("Pagination for RevenueCat products.", paginationFields),
    outputSchema: listOutput("A paginated list of RevenueCat products.", "A RevenueCat product."),
  }),
  defineProviderAction(service, {
    name: "get_overview_metrics",
    description: "Retrieve overview metrics for a RevenueCat project.",
    requiredScopes: ["charts_metrics:overview:read"],
    inputSchema: projectInput("Input for retrieving RevenueCat overview metrics.", { currency }),
    outputSchema: singleOutput(
      "RevenueCat overview metrics response.",
      "metrics",
      "RevenueCat project overview metrics.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_revenue_metric",
    description: "Retrieve total RevenueCat project revenue for an inclusive date range.",
    requiredScopes: ["charts_metrics:overview:read"],
    inputSchema: projectInput(
      "Input for retrieving RevenueCat revenue metrics.",
      {
        startDate: s.date("Inclusive start date in ISO 8601 format."),
        endDate: s.date("Inclusive end date in ISO 8601 format."),
        currency,
        revenueType: s.stringEnum(["revenue", "revenue_net_of_taxes", "proceeds"], {
          description: "Revenue definition returned as the metric value.",
        }),
      },
      ["projectId", "startDate", "endDate"],
    ),
    outputSchema: singleOutput("RevenueCat revenue metric response.", "metric", "RevenueCat revenue metric data."),
  }),
];
