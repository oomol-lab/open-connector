import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cin7_core";

const cin7CoreRecordSchema = s.looseObject("A Cin7 Core API record.");
const cin7CoreRawResponseSchema = s.looseObject("The raw Cin7 Core API response wrapper.");

const pageSchema = s.integer("The one-indexed Cin7 Core page number to return.", { minimum: 1 });
const limitSchema = s.integer("The number of records to return. Cin7 Core allows 1 to 1000.", {
  minimum: 1,
  maximum: 1000,
});

export const cin7CoreActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_account",
    description: "Retrieve the Cin7 Core company and account settings for the connected account.",
    inputSchema: s.actionInput({}, [], "No input is required to retrieve the connected Cin7 Core account."),
    outputSchema: s.actionOutput(
      {
        account: cin7CoreRecordSchema,
      },
      "The connected Cin7 Core account response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_customers",
    description: "List Cin7 Core customers with optional official filters and page pagination.",
    inputSchema: s.object(
      "The filters used to list Cin7 Core customers.",
      {
        page: pageSchema,
        limit: limitSchema,
        id: s.nonEmptyString("Only return the customer with this Cin7 Core customer ID."),
        name: s.nonEmptyString("Only return customers whose name starts with this value."),
        contactFilter: s.nonEmptyString("Only return customers with contacts matching this Cin7 Core contact filter."),
        modifiedSince: s.dateTime("Only return customers modified after this ISO 8601 timestamp."),
        includeDeprecated: s.boolean("Whether deprecated Cin7 Core customers should be included."),
        includeProductPrices: s.boolean(
          "Whether customer product prices should be included in each returned customer.",
        ),
      },
      {
        optional: [
          "page",
          "limit",
          "id",
          "name",
          "contactFilter",
          "modifiedSince",
          "includeDeprecated",
          "includeProductPrices",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        customers: s.array("The customers returned by Cin7 Core.", cin7CoreRecordSchema),
        total: s.nullable(s.integer("The total number of matching Cin7 Core customers.")),
        page: s.nullable(s.integer("The Cin7 Core page number returned.")),
        raw: cin7CoreRawResponseSchema,
      },
      "The paginated Cin7 Core customers response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer",
    description: "Retrieve one Cin7 Core customer by customer ID.",
    inputSchema: s.object(
      "The Cin7 Core customer to retrieve.",
      {
        id: s.nonEmptyString("The Cin7 Core customer ID to retrieve."),
      },
      { required: ["id"] },
    ),
    outputSchema: s.actionOutput(
      {
        customer: cin7CoreRecordSchema,
        raw: cin7CoreRawResponseSchema,
      },
      "The Cin7 Core customer response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description: "List Cin7 Core products with optional official filters and page pagination.",
    inputSchema: s.object(
      "The filters used to list Cin7 Core products.",
      {
        page: pageSchema,
        limit: limitSchema,
        id: s.nonEmptyString("Only return the product with this Cin7 Core product ID."),
        name: s.nonEmptyString("Only return products whose name contains this value."),
        sku: s.nonEmptyString("Only return products whose SKU contains this value."),
        modifiedSince: s.dateTime("Only return products modified after this ISO 8601 timestamp."),
        includeDeprecated: s.boolean("Whether deprecated Cin7 Core products should be included."),
        includeBOM: s.boolean("Whether bill of materials details should be included."),
        includeSuppliers: s.boolean("Whether supplier details should be included."),
        includeMovements: s.boolean("Whether product movement details should be included."),
        includeAttachments: s.boolean("Whether product attachment metadata should be included."),
        includeReorderLevels: s.boolean("Whether reorder level details should be included."),
        includeCustomPrices: s.boolean("Whether custom product prices should be included."),
      },
      {
        optional: [
          "page",
          "limit",
          "id",
          "name",
          "sku",
          "modifiedSince",
          "includeDeprecated",
          "includeBOM",
          "includeSuppliers",
          "includeMovements",
          "includeAttachments",
          "includeReorderLevels",
          "includeCustomPrices",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        products: s.array("The products returned by Cin7 Core.", cin7CoreRecordSchema),
        total: s.nullable(s.integer("The total number of matching Cin7 Core products.")),
        page: s.nullable(s.integer("The Cin7 Core page number returned.")),
        raw: cin7CoreRawResponseSchema,
      },
      "The paginated Cin7 Core products response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve one Cin7 Core product by product ID.",
    inputSchema: s.object(
      "The Cin7 Core product to retrieve.",
      {
        id: s.nonEmptyString("The Cin7 Core product ID to retrieve."),
      },
      { required: ["id"] },
    ),
    outputSchema: s.actionOutput(
      {
        product: cin7CoreRecordSchema,
        raw: cin7CoreRawResponseSchema,
      },
      "The Cin7 Core product response.",
    ),
  }),
];
