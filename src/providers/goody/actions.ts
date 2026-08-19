import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "goody";

const listMetaSchema = s.object("Pagination metadata returned by Goody.", {
  total_count: s.integer("The total number of items in this Goody list."),
});
const goodyObjectSchema = s.looseObject("A Goody API object with official response fields.");
const paginationInputFields = {
  page: s.integer("Page for pagination, starting at 1.", { minimum: 1 }),
  per_page: s.integer("Items per page for pagination.", { minimum: 1, maximum: 100 }),
};

function listResponseSchema(description: string, itemDescription: string): JsonSchema {
  return s.object(description, {
    data: s.array("The Goody objects returned for this page.", s.looseObject(itemDescription)),
    list_meta: listMetaSchema,
  });
}

function idInputSchema(description: string, fieldDescription: string): JsonSchema {
  return s.object(description, {
    id: s.nonEmptyString(fieldDescription),
  });
}

const productListInputSchema = s.object(
  "Input parameters for listing active Goody products.",
  {
    ...paginationInputFields,
    use_custom_catalog: s.boolean("Whether to limit results to the custom catalog for approved API partners."),
    country_code: s.string({
      minLength: 2,
      maxLength: 2,
      description: "A shipping country code to filter products by, such as US.",
    }),
    custom_catalog_show_inactive: s.boolean(
      "Whether to show inactive products in the custom catalog for approved Commerce API customers.",
    ),
  },
  { optional: ["page", "per_page", "use_custom_catalog", "country_code", "custom_catalog_show_inactive"] },
);
const productIdInputSchema = s.object(
  "Input parameters for retrieving a Goody product.",
  {
    id: s.nonEmptyString("The Goody product ID."),
    use_custom_catalog: s.boolean("Whether to limit lookup to the custom catalog for approved API partners."),
  },
  { optional: ["use_custom_catalog"] },
);
const orderListInputSchema = s.object(
  "Input parameters for listing Goody orders.",
  {
    ...paginationInputFields,
    created_at_after: s.dateTime("Only return orders created at or after this timestamp."),
    created_at_before: s.dateTime("Only return orders created at or before this timestamp."),
  },
  { optional: ["page", "per_page", "created_at_after", "created_at_before"] },
);

export const goodyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the current Goody API user.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to retrieve the current Goody API user.", {}),
    outputSchema: s.object(
      "The current Goody API user.",
      {
        email: s.nullable(s.email("The current user's email address.")),
        public_app_id: s.nullable(s.string("The public app ID for the current API key.")),
        raw: goodyObjectSchema,
      },
      { optional: ["email", "public_app_id"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List active products in the Goody catalog.",
    requiredScopes: [],
    inputSchema: productListInputSchema,
    outputSchema: listResponseSchema("Active Goody products for this page.", "A Goody product."),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve a Goody product by ID.",
    requiredScopes: [],
    inputSchema: productIdInputSchema,
    outputSchema: goodyObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_orders",
    description: "List Goody orders, optionally filtered by creation timestamp.",
    requiredScopes: [],
    inputSchema: orderListInputSchema,
    outputSchema: listResponseSchema("Goody orders for this page.", "A Goody order."),
  }),
  defineProviderAction(service, {
    name: "get_order",
    description: "Retrieve a Goody order by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("Input parameters for retrieving a Goody order.", "The Goody order ID."),
    outputSchema: goodyObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_payment_methods",
    description: "List Goody payment methods available to the current account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Goody payment methods.", {}),
    outputSchema: listResponseSchema("Goody payment methods for the current account.", "A Goody payment method."),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Goody workspaces available to the current account.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to list Goody workspaces.", {}),
    outputSchema: listResponseSchema("Goody workspaces for the current account.", "A Goody workspace."),
  }),
];
