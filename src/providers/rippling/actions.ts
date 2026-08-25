import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rippling";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const optionalPaginationFields = {
  expand: nonEmptyString("Comma-separated Rippling expandable fields to include in the response."),
  order_by: nonEmptyString("Rippling sort expression such as id, created_at, or updated_at."),
  cursor: nonEmptyString("Cursor from the previous Rippling next_link value."),
};

const redactedFieldSchema = s.looseObject("Rippling redacted field metadata.", {
  name: s.string("The name of the redacted field."),
  reason: s.string("The reason the field was redacted."),
});

const metaSchema = s.looseObject("Rippling response metadata.", {
  redacted_fields: s.array("Fields redacted by Rippling for the current token.", redactedFieldSchema),
});

const resourceFields = {
  id: s.string("Rippling resource ID."),
  created_at: s.string("Record creation timestamp."),
  updated_at: s.string("Record update timestamp."),
};

const resourceSchema = s.looseRequiredObject("Rippling resource object.", resourceFields);

const listResponseSchema = (description: string, resultDescription: string) =>
  s.object(
    description,
    {
      __meta: metaSchema,
      results: s.array(resultDescription, resourceSchema),
      next_link: s.string("URL for the next Rippling page when more results exist."),
    },
    { required: ["results"], optional: ["__meta", "next_link"] },
  );

const resourceWithMetaSchema = (description: string) =>
  s.looseRequiredObject(
    description,
    {
      ...resourceFields,
      __meta: metaSchema,
    },
    { optional: ["__meta"] },
  );

export const ripplingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_companies",
    description: "List companies available to the Rippling API token.",
    requiredScopes: [],
    inputSchema: s.object("Query parameters for listing Rippling companies.", optionalPaginationFields, {
      required: [],
      optional: ["expand", "order_by", "cursor"],
    }),
    outputSchema: listResponseSchema("Rippling companies list response.", "Company records returned by Rippling."),
  }),
  defineProviderAction(service, {
    name: "list_workers",
    description: "List workers available to the Rippling API token.",
    requiredScopes: [],
    inputSchema: s.object(
      "Query parameters for listing Rippling workers.",
      {
        filter: nonEmptyString("Rippling filter expression for worker fields."),
        ...optionalPaginationFields,
      },
      { required: [], optional: ["filter", "expand", "order_by", "cursor"] },
    ),
    outputSchema: listResponseSchema("Rippling workers list response.", "Worker records returned by Rippling."),
  }),
  defineProviderAction(service, {
    name: "get_worker",
    description: "Retrieve one Rippling worker by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Path and query parameters for retrieving a Rippling worker.",
      {
        id: nonEmptyString("Rippling worker ID."),
        expand: nonEmptyString("Comma-separated Rippling expandable fields to include in the response."),
      },
      { required: ["id"], optional: ["expand"] },
    ),
    outputSchema: resourceWithMetaSchema("Rippling worker response."),
  }),
  defineProviderAction(service, {
    name: "list_departments",
    description: "List departments available to the Rippling API token.",
    requiredScopes: [],
    inputSchema: s.object("Query parameters for listing Rippling departments.", optionalPaginationFields, {
      required: [],
      optional: ["expand", "order_by", "cursor"],
    }),
    outputSchema: listResponseSchema("Rippling departments list response.", "Department records returned by Rippling."),
  }),
];
