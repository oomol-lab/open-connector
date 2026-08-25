import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "smartsuite";

const idSchema = (description: string) => s.nonWhitespaceString(description);
const dynamicObjectSchema = (description: string) => s.looseObject(description);
const dynamicRecordSchema = dynamicObjectSchema(
  "A SmartSuite record whose properties are determined by the Table field slugs.",
);
const solutionSchema = s.looseObject("A SmartSuite Solution returned by the API.", {
  id: idSchema("The Solution ID."),
  name: s.string("The Solution name."),
});
const tableSchema = s.looseObject("A SmartSuite Table returned by the API.", {
  id: idSchema("The Table ID."),
  name: s.string("The Table name."),
  solution: idSchema("The ID of the Solution containing the Table."),
});

const emptyInputSchema = s.object("No input is required.", {});
const recordIdentityInputFields = {
  tableId: idSchema("The SmartSuite Table ID."),
  recordId: idSchema("The SmartSuite record ID."),
};

export const smartsuiteActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_solutions",
    description: "List the Solutions accessible in the connected SmartSuite workspace.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The accessible SmartSuite Solutions.", {
      solutions: s.array("The accessible Solutions.", solutionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    description: "List SmartSuite Tables, optionally limited to one Solution.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters the SmartSuite Tables to list.",
      {
        solutionId: idSchema("The Solution ID used to limit the returned Tables."),
      },
      { optional: ["solutionId"] },
    ),
    outputSchema: s.object("The accessible SmartSuite Tables.", {
      tables: s.array("The accessible Tables.", tableSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_records",
    description: "List records in a SmartSuite Table with optional pagination, sorting, and filtering.",
    requiredScopes: [],
    inputSchema: s.object(
      "Selects and filters records in a SmartSuite Table.",
      {
        tableId: idSchema("The SmartSuite Table ID."),
        offset: s.nonNegativeInteger("The number of matching records to skip."),
        limit: s.integer("The maximum number of records to return.", { minimum: 1, maximum: 1000 }),
        includeDeleted: s.boolean("Whether to include records marked as deleted."),
        hydrated: s.boolean("Whether to include human-readable labels for supported field types."),
        sort: s.array(
          "SmartSuite sort directives in the order they should be applied.",
          dynamicObjectSchema("A SmartSuite sort directive."),
        ),
        filter: dynamicObjectSchema("A SmartSuite group filter using the official filter syntax."),
      },
      { optional: ["offset", "limit", "includeDeleted", "hydrated", "sort", "filter"] },
    ),
    outputSchema: s.object("A page of SmartSuite records.", {
      total: s.nonNegativeInteger("The total number of matching records."),
      offset: s.nonNegativeInteger("The current pagination offset."),
      limit: s.nonNegativeInteger("The response page limit."),
      records: s.array("The records returned for this page.", dynamicRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_record",
    description: "Retrieve one record from a SmartSuite Table.",
    requiredScopes: [],
    inputSchema: s.object(
      "Identifies the SmartSuite record to retrieve.",
      {
        ...recordIdentityInputFields,
        hydrated: s.boolean("Whether to include human-readable labels for supported field types."),
      },
      { optional: ["hydrated"] },
    ),
    outputSchema: s.object("The requested SmartSuite record.", {
      record: dynamicRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_record",
    description: "Create a record in a SmartSuite Table using its field slugs.",
    requiredScopes: [],
    inputSchema: s.object("Defines the SmartSuite record to create.", {
      tableId: recordIdentityInputFields.tableId,
      fields: dynamicObjectSchema("Record values keyed by SmartSuite Table field slug."),
    }),
    outputSchema: s.object("The created SmartSuite record.", {
      record: dynamicRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_record",
    description: "Partially update fields on a SmartSuite record without clearing omitted fields.",
    requiredScopes: [],
    inputSchema: s.object("Defines the SmartSuite record fields to update.", {
      ...recordIdentityInputFields,
      fields: dynamicObjectSchema("Record values keyed by SmartSuite Table field slug."),
    }),
    outputSchema: s.object("The updated SmartSuite record.", {
      record: dynamicRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_record",
    description: "Delete one record from a SmartSuite Table.",
    requiredScopes: [],
    inputSchema: s.object("Identifies the SmartSuite record to delete.", recordIdentityInputFields),
    outputSchema: s.object("Confirms that the SmartSuite record was deleted.", {
      deleted: s.boolean("Whether the record deletion succeeded."),
    }),
  }),
];
