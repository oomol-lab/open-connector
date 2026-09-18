import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "printify" as const;

const shopIdSchema = s.integer("The Printify shop ID.", { minimum: 1 });
const resourceIdSchema = s.nonEmptyString("The Printify resource ID.");
const pageSchema = s.integer("The one-based page number to retrieve.", { minimum: 1 });
const limitSchema = s.integer("The number of records to return per page.", {
  minimum: 1,
  maximum: 50,
});
const rawObjectSchema = s.looseObject("The resource fields returned by Printify.");

const shopSchema = s.looseObject("A Printify shop associated with the merchant account.", {
  id: s.integer("The unique Printify shop ID."),
  title: s.string("The shop title."),
  sales_channel: s.string("The sales channel connected to the shop."),
});

const paginationFields = {
  currentPage: s.integer("The current one-based page number.", { minimum: 1 }),
  lastPage: s.integer("The last available page number.", { minimum: 1 }),
  total: s.integer("The total number of matching resources.", { minimum: 0 }),
};

export const printifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_shops",
    operationType: "read",
    description: "List all Printify shops associated with the authenticated merchant account.",
    requiredScopes: [],
    inputSchema: s.object("Parameters for listing Printify shops.", {}),
    outputSchema: s.object("The Printify shops associated with the merchant account.", {
      shops: s.array("The shops returned by Printify.", shopSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List products created in a Printify shop with page-based pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing products in a Printify shop.",
      {
        shopId: shopIdSchema,
        page: pageSchema,
        limit: limitSchema,
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: s.object("A page of Printify products.", {
      products: s.array("The products on this page.", rawObjectSchema),
      ...paginationFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve one product from a Printify shop by its product ID.",
    requiredScopes: [],
    inputSchema: s.object("Parameters for retrieving a Printify product.", {
      shopId: shopIdSchema,
      productId: resourceIdSchema,
    }),
    outputSchema: s.object("The requested Printify product.", {
      product: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_orders",
    operationType: "read",
    description: "List orders in a Printify shop with optional status and SKU filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for listing orders in a Printify shop.",
      {
        shopId: shopIdSchema,
        page: pageSchema,
        limit: s.integer("The number of orders to return, up to Printify's maximum of 10.", {
          minimum: 1,
          maximum: 10,
        }),
        status: s.nonEmptyString("The Printify order status to filter by."),
        sku: s.nonEmptyString("The product SKU to filter by."),
      },
      { optional: ["page", "limit", "status", "sku"] },
    ),
    outputSchema: s.object("A page of Printify orders.", {
      orders: s.array("The orders on this page.", rawObjectSchema),
      ...paginationFields,
    }),
  }),
  defineProviderAction(service, {
    name: "get_order",
    operationType: "read",
    description: "Retrieve one order from a Printify shop by its order ID.",
    requiredScopes: [],
    inputSchema: s.object("Parameters for retrieving a Printify order.", {
      shopId: shopIdSchema,
      orderId: resourceIdSchema,
    }),
    outputSchema: s.object("The requested Printify order.", {
      order: rawObjectSchema,
    }),
  }),
];
