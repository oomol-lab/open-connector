import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "skio";

const firstSchema = s.integer("The number of Skio records to return per page.", { minimum: 1, maximum: 1000 });
const afterSchema = s.string("The Skio cursor from a previous pageInfo.endCursor.", { minLength: 1 });
const platformIdSchema = (description: string) => s.string(description, { minLength: 1 });
const commaSeparatedSchema = (description: string) => s.string(description, { minLength: 1 });
const pageInfoSchema = s.object("Skio cursor pagination metadata.", {
  hasNextPage: s.boolean("Whether Skio has another page after this response."),
  startCursor: s.nullableString("The cursor at the start of this Skio page."),
  endCursor: s.nullableString("The cursor at the end of this Skio page."),
});
const paginatedOutputSchema = (description: string, itemDescription: string) =>
  s.object(description, {
    data: s.array("The Skio records returned on this page.", s.looseObject(itemDescription)),
    pageInfo: pageInfoSchema,
  });
const orderTimeFilters = {
  createdAfter: s.dateTime("Filter orders created on or after this ISO 8601 timestamp."),
  createdBefore: s.dateTime("Filter orders created on or before this ISO 8601 timestamp."),
  updatedAfter: s.dateTime("Filter orders updated on or after this ISO 8601 timestamp."),
  updatedBefore: s.dateTime("Filter orders updated on or before this ISO 8601 timestamp."),
};

export const skioActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "Export one page of Skio orders with cursor pagination and optional filters.",
    inputSchema: s.object(
      "Filters for exporting Skio orders.",
      {
        first: firstSchema,
        after: afterSchema,
        id: s.uuid("Filter by exact Skio order ID."),
        platformId: platformIdSchema("Filter by Shopify order ID."),
        ...orderTimeFilters,
        storefrontUserId: s.uuid("Filter orders by Skio storefront user ID."),
      },
      {
        optional: [
          "after",
          "id",
          "platformId",
          "createdAfter",
          "createdBefore",
          "updatedAfter",
          "updatedBefore",
          "storefrontUserId",
        ],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of Skio orders.", "One raw Skio order object."),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "Export one page of Skio products with cursor pagination and optional filters.",
    inputSchema: s.object(
      "Filters for exporting Skio products.",
      {
        first: firstSchema,
        after: afterSchema,
        id: s.uuid("Filter by exact Skio product ID."),
        platformId: platformIdSchema("Filter by Shopify product ID."),
        ids: commaSeparatedSchema("Comma-separated Skio product IDs."),
        platformIds: commaSeparatedSchema("Comma-separated Shopify product IDs."),
        status: s.string("Filter by exact product status.", { minLength: 1 }),
        tags: commaSeparatedSchema("Comma-separated product tag names."),
        updatedAfter: s.dateTime("Filter products updated on or after this ISO 8601 timestamp."),
        updatedBefore: s.dateTime("Filter products updated on or before this ISO 8601 timestamp."),
      },
      {
        optional: [
          "after",
          "id",
          "platformId",
          "ids",
          "platformIds",
          "status",
          "tags",
          "updatedAfter",
          "updatedBefore",
        ],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of Skio products.", "One raw Skio product object."),
  }),
  defineProviderAction(service, {
    name: "list_storefront_users",
    operationType: "read",
    description: "Export one page of Skio storefront users with cursor pagination and optional filters.",
    inputSchema: s.object(
      "Filters for exporting Skio storefront users.",
      {
        first: firstSchema,
        after: afterSchema,
        id: s.uuid("Filter by exact Skio storefront user ID."),
        platformId: platformIdSchema("Filter by Shopify customer ID."),
        createdAfter: s.dateTime("Filter storefront users created on or after this ISO 8601 timestamp."),
        createdBefore: s.dateTime("Filter storefront users created on or before this ISO 8601 timestamp."),
        updatedAfter: s.dateTime("Filter storefront users updated on or after this ISO 8601 timestamp."),
        updatedBefore: s.dateTime("Filter storefront users updated on or before this ISO 8601 timestamp."),
        email: s.email("Filter by exact storefront user email address."),
      },
      {
        optional: [
          "after",
          "id",
          "platformId",
          "createdAfter",
          "createdBefore",
          "updatedAfter",
          "updatedBefore",
          "email",
        ],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of Skio storefront users.", "One raw Skio storefront user object."),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    operationType: "read",
    description: "Export one page of Skio subscriptions with cursor pagination and optional filters.",
    inputSchema: s.object(
      "Filters for exporting Skio subscriptions.",
      {
        first: firstSchema,
        after: afterSchema,
        id: s.uuid("Filter by exact Skio subscription ID."),
        platformId: platformIdSchema("Filter by Shopify subscription ID."),
        createdAfter: s.dateTime("Filter subscriptions created on or after this ISO 8601 timestamp."),
        createdBefore: s.dateTime("Filter subscriptions created on or before this ISO 8601 timestamp."),
        updatedAfter: s.dateTime("Filter subscriptions updated on or after this ISO 8601 timestamp."),
        updatedBefore: s.dateTime("Filter subscriptions updated on or before this ISO 8601 timestamp."),
        storefrontUserId: s.uuid("Filter subscriptions by Skio storefront user ID."),
        status: s.string("Filter by exact subscription status.", { minLength: 1 }),
        nextBillingDateAfter: s.dateTime(
          "Filter subscriptions with next billing date on or after this ISO 8601 timestamp.",
        ),
        nextBillingDateBefore: s.dateTime(
          "Filter subscriptions with next billing date on or before this ISO 8601 timestamp.",
        ),
      },
      {
        optional: [
          "after",
          "id",
          "platformId",
          "createdAfter",
          "createdBefore",
          "updatedAfter",
          "updatedBefore",
          "storefrontUserId",
          "status",
          "nextBillingDateAfter",
          "nextBillingDateBefore",
        ],
      },
    ),
    outputSchema: paginatedOutputSchema("A page of Skio subscriptions.", "One raw Skio subscription object."),
  }),
];
