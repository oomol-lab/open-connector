import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "quipteams";

const cursorSchema = s.string("Pagination cursor returned by Quipteams.", { minLength: 1 });
const limitSchema = s.integer("Items per page. Quipteams allows 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const idSchema = (description: string): JsonSchema => s.string(description, { minLength: 1 });
const timestampSchema = s.dateTime("Timestamp returned by Quipteams.");

const quoteSortSchema = s.stringEnum("Sort order accepted by Quipteams quote list.", [
  "created_at",
  "-created_at",
  "updated_at",
  "-updated_at",
]);
const createdRangeFields = {
  created_after: timestampSchema,
  created_before: timestampSchema,
};
const deviceTypeSchema = s.stringEnum("Quipteams device type.", [
  "Laptop",
  "Monitor",
  "Mouse",
  "Keyboard",
  "Headphones",
  "Webcam",
  "Accessory",
]);
const listSortSchema = s.stringEnum("Sort order accepted by this Quipteams list endpoint.", [
  "created_at",
  "-created_at",
  "updated_at",
  "-updated_at",
]);
const kitSortSchema = s.stringEnum("Sort order accepted by the Quipteams kit list endpoint.", [
  "created_at",
  "-created_at",
  "updated_at",
  "-updated_at",
  "name",
  "-name",
]);
const commaFilterValueSchema = s.anyOf("A Quipteams catalog filter value.", [
  s.string("A single filter value or comma-separated values.", { minLength: 1 }),
  s.array("Filter values to send as a comma-separated OR query.", s.string("A filter value."), {
    minItems: 1,
  }),
]);

const rawPayloadSchema = s.unknown("The raw Quipteams response payload.");
const quoteSchema = s.looseObject("A Quipteams quote object.", {
  id: s.string("Quote identifier returned by Quipteams."),
  order_id: s.string("Quote order identifier returned by Quipteams."),
  status: s.string("Quote status returned by Quipteams."),
  country: s.string("Quote country returned by Quipteams."),
});
const assetSchema = s.looseObject("A Quipteams holding asset object.", {
  id: s.nullableString("Asset UUID returned by Quipteams, or null for in-use rows."),
  serial_number: s.string("Asset serial number returned by Quipteams."),
  device_type: s.nullableString("Device type returned by Quipteams, or null when unknown."),
  country: s.string("Asset country returned by Quipteams."),
  status: s.string("Asset status returned by Quipteams."),
});
const deviceActionSchema = s.looseObject("A Quipteams device action object.", {
  id: s.string("Device action UUID returned by Quipteams."),
  status: s.string("Device action status returned by Quipteams."),
  action_type: s.string("Device action type returned by Quipteams."),
  serial_number: s.string("Device serial number returned by Quipteams."),
});
const productSchema = s.looseObject("A Quipteams catalog product object.", {
  id: s.string("Product UUID returned by Quipteams."),
  brand: s.string("Product brand returned by Quipteams."),
  model: s.string("Product model returned by Quipteams."),
  product_type: s.string("Product type returned by Quipteams."),
});
const kitSchema = s.looseObject("A Quipteams kit object.", {
  id: s.string("Kit UUID returned by Quipteams."),
  name: s.string("Kit name returned by Quipteams."),
  region: s.string("Kit region returned by Quipteams."),
});
const employeeSchema = s.looseObject("A Quipteams employee object.", {
  id: s.string("Employee UUID returned by Quipteams."),
  name: s.string("Employee name returned by Quipteams."),
  email: s.string("Employee email returned by Quipteams."),
  status: s.string("Employee status returned by Quipteams."),
});

function listOutputSchema(description: string, property: string, items: JsonSchema): JsonSchema {
  return s.object(
    description,
    {
      [property]: s.array(`Quipteams ${property} returned for this page.`, items),
      nextCursor: cursorSchema,
      raw: rawPayloadSchema,
    },
    { required: [property, "raw"], optional: ["nextCursor"] },
  );
}

function detailOutputSchema(description: string, property: string, item: JsonSchema): JsonSchema {
  return s.object(
    description,
    {
      [property]: item,
      raw: rawPayloadSchema,
    },
    { required: [property, "raw"] },
  );
}

const quoteListInputSchema = s.actionInput(
  {
    status: s.string("Filter by quote status, such as pending, delivered, or completed.", {
      minLength: 1,
    }),
    country: s.string("Filter by country using the partial-match behavior documented by Quipteams.", {
      minLength: 1,
    }),
    ...createdRangeFields,
    sort: quoteSortSchema,
    limit: limitSchema,
    cursor: cursorSchema,
  },
  [],
  "Filters and pagination for listing Quipteams quotes.",
);

const assetListInputSchema = s.actionInput(
  {
    status: s.stringEnum("Which Quipteams assets to return.", ["in_storage", "in_use", "all"]),
    serial_number: s.string("Filter by exact asset serial number.", { minLength: 1 }),
    item_id: s.uuid("Filter by exact asset UUID."),
    country: s.string("Filter by asset country.", { minLength: 1 }),
    device_type: deviceTypeSchema,
    search: s.string("Search across serial number, description, and employee.", { minLength: 1 }),
    sort: listSortSchema,
    limit: limitSchema,
    cursor: cursorSchema,
  },
  [],
  "Filters and pagination for listing Quipteams holding assets.",
);

const deviceActionListInputSchema = s.actionInput(
  {
    status: s.string("Filter by device action status.", { minLength: 1 }),
    action_type: s.string("Filter by device action type.", { minLength: 1 }),
    serial_number: s.string("Filter by device serial number.", { minLength: 1 }),
    include_asset: s.boolean("Whether to include the full holding asset data for each device."),
    ...createdRangeFields,
    sort: listSortSchema,
    limit: limitSchema,
    cursor: cursorSchema,
  },
  [],
  "Filters and pagination for listing Quipteams device actions.",
);

const productListInputSchema = s.actionInput(
  {
    product_type: deviceTypeSchema,
    brand: s.string("Filter by brand, case-insensitive.", { minLength: 1 }),
    search: s.string("Search by brand or model name.", { minLength: 1 }),
    cpu: commaFilterValueSchema,
    ram: commaFilterValueSchema,
    storage: commaFilterValueSchema,
    screen_size: commaFilterValueSchema,
    resolution: commaFilterValueSchema,
    connection_type: commaFilterValueSchema,
    include_inactive: s.boolean("Whether to include inactive products."),
  },
  [],
  "Filters for listing Quipteams products.",
);

const kitListInputSchema = s.actionInput(
  {
    search: s.string("Search kits by name.", { minLength: 1 }),
    tag: s.string("Filter kits by tag.", { minLength: 1 }),
    region: s.string("Filter kits by exact region.", { minLength: 1 }),
    sort: kitSortSchema,
    limit: limitSchema,
    cursor: cursorSchema,
  },
  [],
  "Filters and pagination for listing Quipteams kits.",
);

const employeeListInputSchema = s.actionInput(
  {
    status: s.string("Filter by employee status.", { minLength: 1 }),
    search: s.string("Search across employee name and email.", { minLength: 1 }),
    limit: limitSchema,
    cursor: cursorSchema,
  },
  [],
  "Filters and pagination for listing Quipteams employees.",
);

export const quipteamsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_quotes",
    operationType: "read",
    description: "List Quipteams hardware procurement quotes with optional filters and cursor pagination.",
    requiredScopes: ["quotes:read"],
    inputSchema: quoteListInputSchema,
    outputSchema: listOutputSchema("A page of Quipteams quotes.", "quotes", quoteSchema),
  }),
  defineProviderAction(service, {
    name: "get_quote",
    operationType: "read",
    description: "Retrieve one Quipteams quote including its items, recipients, and alternatives.",
    requiredScopes: ["quotes:read"],
    inputSchema: s.actionInput(
      {
        id: idSchema("The Quipteams quote order_id."),
      },
      ["id"],
      "Input for retrieving a Quipteams quote.",
    ),
    outputSchema: detailOutputSchema("A Quipteams quote detail response.", "quote", quoteSchema),
  }),
  defineProviderAction(service, {
    name: "list_assets",
    operationType: "read",
    description: "List Quipteams holding assets with optional inventory filters and cursor pagination.",
    requiredScopes: ["assets:read"],
    inputSchema: assetListInputSchema,
    outputSchema: listOutputSchema("A page of Quipteams holding assets.", "assets", assetSchema),
  }),
  defineProviderAction(service, {
    name: "list_device_actions",
    operationType: "read",
    description: "List Quipteams device actions with optional status, type, serial number, and date filters.",
    requiredScopes: ["device_actions:read"],
    inputSchema: deviceActionListInputSchema,
    outputSchema: listOutputSchema("A page of Quipteams device actions.", "deviceActions", deviceActionSchema),
  }),
  defineProviderAction(service, {
    name: "get_device_action",
    operationType: "read",
    description: "Retrieve one Quipteams device action including comments, notes, and status history.",
    requiredScopes: ["device_actions:read"],
    inputSchema: s.actionInput(
      {
        id: idSchema("The Quipteams device action UUID."),
        include_asset: s.boolean("Whether to include the full holding asset data for the device."),
      },
      ["id"],
      "Input for retrieving a Quipteams device action.",
    ),
    outputSchema: detailOutputSchema("A Quipteams device action detail response.", "deviceAction", deviceActionSchema),
  }),
  defineProviderAction(service, {
    name: "list_products",
    operationType: "read",
    description: "List the Quipteams product catalog with optional product and specification filters.",
    requiredScopes: ["products:read"],
    inputSchema: productListInputSchema,
    outputSchema: listOutputSchema("A Quipteams product catalog response.", "products", productSchema),
  }),
  defineProviderAction(service, {
    name: "get_product",
    operationType: "read",
    description: "Retrieve one Quipteams product with its active configurations.",
    requiredScopes: ["products:read"],
    inputSchema: s.actionInput(
      {
        id: idSchema("The Quipteams product UUID."),
      },
      ["id"],
      "Input for retrieving a Quipteams product.",
    ),
    outputSchema: detailOutputSchema("A Quipteams product detail response.", "product", productSchema),
  }),
  defineProviderAction(service, {
    name: "list_kits",
    operationType: "read",
    description: "List Quipteams reusable kit templates with optional filters and cursor pagination.",
    requiredScopes: ["kits:read"],
    inputSchema: kitListInputSchema,
    outputSchema: listOutputSchema("A page of Quipteams kits.", "kits", kitSchema),
  }),
  defineProviderAction(service, {
    name: "get_kit",
    operationType: "read",
    description: "Retrieve one Quipteams kit including all device specifications.",
    requiredScopes: ["kits:read"],
    inputSchema: s.actionInput(
      {
        id: idSchema("The Quipteams kit UUID."),
      },
      ["id"],
      "Input for retrieving a Quipteams kit.",
    ),
    outputSchema: detailOutputSchema("A Quipteams kit detail response.", "kit", kitSchema),
  }),
  defineProviderAction(service, {
    name: "list_employees",
    operationType: "read",
    description: "List Quipteams employees synced from HRIS with optional status and search filters.",
    requiredScopes: ["employees:read"],
    inputSchema: employeeListInputSchema,
    outputSchema: listOutputSchema("A page of Quipteams employees.", "employees", employeeSchema),
  }),
  defineProviderAction(service, {
    name: "get_employee",
    operationType: "read",
    description: "Retrieve one Quipteams employee including HRIS metadata.",
    requiredScopes: ["employees:read"],
    inputSchema: s.actionInput(
      {
        id: idSchema("The Quipteams employee UUID."),
      },
      ["id"],
      "Input for retrieving a Quipteams employee.",
    ),
    outputSchema: detailOutputSchema("A Quipteams employee detail response.", "employee", employeeSchema),
  }),
];
