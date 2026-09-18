import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "softr";

const databaseIdSchema = s.nonEmptyString("The Softr database ID.");
const tableIdSchema = s.nonEmptyString("The Softr table ID.");
const fieldIdSchema = s.nonEmptyString("The Softr table field ID.");
const recordIdSchema = s.nonEmptyString("The Softr record ID.");

const tableFieldSchema = s.looseRequiredObject(
  "A Softr table field definition.",
  {
    id: s.string("The field ID."),
    name: s.string("The field name."),
    type: s.string("The Softr field type."),
    description: s.nullableString("The optional resource description."),
    options: s.looseObject("Provider-defined configuration for this field type."),
    allowMultipleEntries: s.boolean("Whether the field accepts multiple values or linked entries."),
    readonly: s.boolean("Whether the field is read-only."),
    required: s.boolean("Whether the field requires a value."),
    locked: s.boolean("Whether the field configuration is locked."),
    defaultValue: s.nullableString("The field's default value when one is configured."),
    aiOptions: s.nullable(s.looseObject("AI-powered auto-fill configuration for the field.")),
    createdAt: s.dateTime("The field creation timestamp."),
    updatedAt: s.dateTime("The field update timestamp."),
  },
  {
    optional: [
      "description",
      "options",
      "allowMultipleEntries",
      "readonly",
      "required",
      "locked",
      "defaultValue",
      "aiOptions",
      "createdAt",
      "updatedAt",
    ],
  },
);

const databaseSchema = s.looseRequiredObject(
  "A Softr database.",
  {
    id: s.string("The database ID."),
    name: s.string("The database name."),
    workspaceId: s.string("The workspace ID that owns the database."),
    description: s.nullableString("The optional resource description."),
    tablesCount: s.nonNegativeInteger("The number of tables in the database."),
    createdAt: s.dateTime("The database creation timestamp."),
    updatedAt: s.dateTime("The database update timestamp."),
  },
  { optional: ["description", "tablesCount", "createdAt", "updatedAt"] },
);

const tableSchema = s.looseRequiredObject(
  "A Softr database table.",
  {
    id: s.string("The table ID."),
    name: s.string("The table name."),
    description: s.nullableString("The optional resource description."),
    primaryFieldId: s.string("The table's primary field ID."),
    defaultViewId: s.string("The table's default view ID."),
    fields: s.array("Field definitions in the table.", tableFieldSchema),
    createdAt: s.dateTime("The table creation timestamp."),
    updatedAt: s.dateTime("The table update timestamp."),
  },
  { optional: ["description", "primaryFieldId", "defaultViewId", "fields", "createdAt", "updatedAt"] },
);

const tableViewSchema = s.looseRequiredObject(
  "A Softr table view.",
  {
    id: s.string("The table view ID."),
    tableId: s.string("The table ID that owns the view."),
    name: s.string("The table view name."),
    description: s.nullableString("The optional resource description."),
    createdAt: s.dateTime("The table view creation timestamp."),
    updatedAt: s.dateTime("The table view update timestamp."),
  },
  { optional: ["description", "createdAt", "updatedAt"] },
);

const recordFieldsSchema = s.record(
  "Record values keyed by Softr field ID or field name.",
  s.unknown("A value accepted by the configured Softr field type."),
);

const recordSchema = s.looseRequiredObject(
  "A Softr table record.",
  {
    id: s.string("The record ID."),
    tableId: s.string("The table ID that owns the record."),
    fields: recordFieldsSchema,
    createdAt: s.dateTime("The record creation timestamp."),
    updatedAt: s.dateTime("The record update timestamp."),
  },
  { optional: ["tableId", "createdAt", "updatedAt"] },
);

const paginationMetadataSchema = s.object(
  {
    offset: s.nonNegativeInteger("The number of records skipped."),
    limit: s.positiveInteger("The maximum number of records returned in this page."),
    total: s.nonNegativeInteger("The total number of matching records."),
  },
  { required: ["offset", "limit", "total"], description: "Softr pagination metadata." },
);

const databaseInputSchema = s.object(
  { databaseId: databaseIdSchema },
  { required: ["databaseId"], description: "Input identifying one Softr database." },
);
const tableInputSchema = s.object(
  { databaseId: databaseIdSchema, tableId: tableIdSchema },
  { required: ["databaseId", "tableId"], description: "Input identifying one Softr database table." },
);
const fieldInputSchema = s.object(
  { databaseId: databaseIdSchema, tableId: tableIdSchema, fieldId: fieldIdSchema },
  {
    required: ["databaseId", "tableId", "fieldId"],
    description: "Input identifying one Softr table field.",
  },
);
const recordInputSchema = s.object(
  {
    databaseId: databaseIdSchema,
    tableId: tableIdSchema,
    recordId: recordIdSchema,
    fieldNames: s.boolean("Whether response field keys should use field names instead of field IDs."),
  },
  {
    required: ["databaseId", "tableId", "recordId"],
    optional: ["fieldNames"],
    description: "Input identifying one Softr table record.",
  },
);

const listRecordsInputSchema = s.object(
  {
    databaseId: databaseIdSchema,
    tableId: tableIdSchema,
    offset: s.nonNegativeInteger("The number of records to skip."),
    limit: s.integer("The number of records to return, from 1 to 200.", { minimum: 1, maximum: 200 }),
    fieldNames: s.boolean("Whether response field keys should use field names instead of field IDs."),
    viewId: s.nonEmptyString("The Softr table view ID used to filter the records."),
  },
  {
    required: ["databaseId", "tableId"],
    optional: ["offset", "limit", "fieldNames", "viewId"],
    description: "Input for listing Softr records.",
  },
);

const filterOperators = [
  "AND",
  "OR",
  "IS_EMPTY",
  "IS_NOT_EMPTY",
  "IS_BETWEEN",
  "IS_NOT_BETWEEN",
  "IS_WITHIN",
  "IS_NOT_WITHIN",
  "IS",
  "IS_NOT",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUALS",
  "LESS_THAN",
  "LESS_THAN_OR_EQUALS",
  "CONTAINS",
  "DOES_NOT_CONTAIN",
  "STARTS_WITH",
  "DOES_NOT_START_WITH",
  "ENDS_WITH",
  "DOES_NOT_END_WITH",
  "IS_ONE_OF",
  "IS_NOT_ONE_OF",
  "HAS_ANY_OF",
  "HAS_ALL_OF",
  "HAS_NONE_OF",
];

const filterConditionSchema = s.looseObject("A Softr record filter condition.", {
  operator: s.stringEnum("The filter condition operator.", filterOperators),
  leftSide: s.string("The field ID to which the condition applies."),
  rightSide: s.anyOf("The scalar or string-array value to compare with the selected field.", [
    s.string("A string comparison value."),
    s.number("A numeric comparison value."),
    s.boolean("A boolean comparison value."),
    s.array("A list of string comparison values.", s.string("A string comparison value.")),
  ]),
  lowerBound: s.anyOf("The lower bound for a between condition.", [
    s.string("A string or date lower bound."),
    s.number("A numeric lower bound."),
  ]),
  upperBound: s.anyOf("The upper bound for a between condition.", [
    s.string("A string or date upper bound."),
    s.number("A numeric upper bound."),
  ]),
  conditions: s.array(
    "Nested conditions used by AND or OR operators.",
    s.looseObject("A nested Softr record filter condition."),
  ),
});

const searchRecordsInputSchema = s.object(
  {
    databaseId: databaseIdSchema,
    tableId: tableIdSchema,
    fieldNames: s.boolean("Whether response field keys should use field names instead of field IDs."),
    filter: s.object(
      { condition: filterConditionSchema },
      { required: ["condition"], description: "The filter applied to the search." },
    ),
    sort: s.array(
      "Sort rules applied in order.",
      s.object(
        {
          sortingField: s.nonEmptyString("The field ID used for sorting."),
          sortType: s.stringEnum("The sort direction.", ["ASC", "DESC"]),
        },
        { required: ["sortingField", "sortType"], description: "A Softr record sort rule." },
      ),
    ),
    paging: s.object(
      {
        offset: s.nonNegativeInteger("The number of matching records to skip."),
        limit: s.integer("The number of matching records to return, from 1 to 200.", {
          minimum: 1,
          maximum: 200,
        }),
      },
      { optional: ["offset", "limit"], description: "Pagination controls for the search." },
    ),
  },
  {
    required: ["databaseId", "tableId"],
    optional: ["fieldNames", "filter", "sort", "paging"],
    description: "Input for searching Softr records.",
  },
);

const createRecordInputSchema = recordMutationInputSchema(false);
const updateRecordInputSchema = recordMutationInputSchema(true);

const recordListOutputSchema = s.object(
  {
    records: s.array("The records returned in this page.", recordSchema),
    metadata: paginationMetadataSchema,
  },
  { required: ["records", "metadata"], description: "A paginated Softr record result." },
);

export const softrActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_databases",
    operationType: "read",
    description: "List the Softr databases accessible to the connected Personal Access Token.",
    followUpActions: ["softr.list_tables"],
    inputSchema: s.object({}, { description: "Input for listing accessible Softr databases." }),
    outputSchema: singlePropertyOutput(
      "databases",
      s.array("Databases accessible to the connected token.", databaseSchema),
      "Accessible Softr databases.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_database",
    operationType: "read",
    description: "Get one Softr database by ID.",
    followUpActions: ["softr.list_tables"],
    inputSchema: databaseInputSchema,
    outputSchema: singlePropertyOutput("database", databaseSchema, "A single Softr database result."),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    operationType: "read",
    description: "List all tables in a Softr database, including their field definitions.",
    followUpActions: ["softr.list_records", "softr.list_table_views"],
    inputSchema: databaseInputSchema,
    outputSchema: singlePropertyOutput(
      "tables",
      s.array("Tables returned by Softr.", tableSchema),
      "Tables in a Softr database.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_table",
    operationType: "read",
    description: "Get one Softr table and its field definitions by database ID and table ID.",
    followUpActions: ["softr.list_records", "softr.get_table_field"],
    inputSchema: tableInputSchema,
    outputSchema: singlePropertyOutput("table", tableSchema, "A single Softr table result."),
  }),
  defineProviderAction(service, {
    name: "list_table_views",
    operationType: "read",
    description: "List the configured views for one Softr table.",
    followUpActions: ["softr.list_records"],
    inputSchema: tableInputSchema,
    outputSchema: singlePropertyOutput(
      "views",
      s.array("Table views returned by Softr.", tableViewSchema),
      "Views configured for a Softr table.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_table_field",
    operationType: "read",
    description: "Get one Softr table field definition by ID.",
    inputSchema: fieldInputSchema,
    outputSchema: singlePropertyOutput("field", tableFieldSchema, "A single Softr table field result."),
  }),
  defineProviderAction(service, {
    name: "list_records",
    operationType: "read",
    description: "List a paginated page of records from one Softr table, optionally filtered by a table view.",
    followUpActions: ["softr.get_record", "softr.search_records"],
    inputSchema: listRecordsInputSchema,
    outputSchema: recordListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_records",
    operationType: "read",
    description: "Search records in one Softr table using optional filters, sorting, and pagination.",
    followUpActions: ["softr.get_record"],
    inputSchema: searchRecordsInputSchema,
    outputSchema: recordListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_record",
    operationType: "read",
    description: "Get one Softr table record by ID.",
    followUpActions: ["softr.update_record", "softr.delete_record"],
    inputSchema: recordInputSchema,
    outputSchema: singlePropertyOutput("record", recordSchema, "A single Softr record result."),
  }),
  defineProviderAction(service, {
    name: "create_record",
    operationType: "write",
    description: "Create one record in a Softr table.",
    followUpActions: ["softr.get_record"],
    inputSchema: createRecordInputSchema,
    outputSchema: singlePropertyOutput("record", recordSchema, "The created Softr record."),
  }),
  defineProviderAction(service, {
    name: "update_record",
    operationType: "write",
    description: "Partially update the supplied fields of one Softr table record.",
    followUpActions: ["softr.get_record"],
    inputSchema: updateRecordInputSchema,
    outputSchema: singlePropertyOutput("record", recordSchema, "The updated Softr record."),
  }),
  defineProviderAction(service, {
    name: "delete_record",
    operationType: "destructive",
    description: "Permanently delete one Softr table record by ID.",
    inputSchema: s.object(
      { databaseId: databaseIdSchema, tableId: tableIdSchema, recordId: recordIdSchema },
      {
        required: ["databaseId", "tableId", "recordId"],
        description: "Input for deleting one Softr record.",
      },
    ),
    outputSchema: s.object(
      {
        deleted: s.boolean("Whether the record deletion request completed successfully."),
        recordId: s.string("The deleted record ID."),
      },
      { required: ["deleted", "recordId"], description: "Softr record deletion acknowledgement." },
    ),
  }),
];

function recordMutationInputSchema(includeRecordId: boolean): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    databaseId: databaseIdSchema,
    tableId: tableIdSchema,
    fields: recordFieldsSchema,
    fieldNames: s.boolean("Whether response field keys should use field names instead of field IDs."),
  };
  const required = ["databaseId", "tableId", "fields"];
  if (includeRecordId) {
    properties.recordId = recordIdSchema;
    required.splice(2, 0, "recordId");
  }
  return s.object(properties, {
    required,
    optional: ["fieldNames"],
    description: includeRecordId ? "Input for updating a Softr record." : "Input for creating a Softr record.",
  });
}

function singlePropertyOutput(property: string, schema: JsonSchema, description: string): JsonSchema {
  return s.object({ [property]: schema }, { required: [property], description });
}
