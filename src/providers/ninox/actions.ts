import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ninox";

const trimmedIdentifierSchema = (description: string): JsonSchema =>
  s.string({
    minLength: 1,
    pattern: "\\S",
    description,
  });

const positiveRecordIdSchema = s.positiveInteger("The Ninox record identifier.");
const styleSchema = s.stringEnum(["ids", "names"], {
  description: "How Ninox should render choice or date values in the response.",
});

const looseRecordSchema = s.looseObject("A loose object returned by Ninox.");
const recordFieldsSchema = s.looseObject("Record field values keyed by Ninox field name or field identifier.");
const searchFiltersSchema = s.looseObject(
  "Filters keyed by Ninox field identifier or field name for single-record lookup.",
);

const workspaceSchema = s.object(
  {
    id: trimmedIdentifierSchema("The Ninox workspace identifier."),
    name: s.string("The Ninox workspace name."),
    raw: looseRecordSchema,
  },
  {
    required: ["id", "name", "raw"],
    description: "A Ninox workspace summary.",
  },
);

const databaseSummarySchema = s.object(
  {
    id: trimmedIdentifierSchema("The Ninox database identifier."),
    name: s.string("The Ninox database name."),
    raw: looseRecordSchema,
  },
  {
    required: ["id", "name", "raw"],
    description: "A Ninox database summary.",
  },
);

const tableChoiceSchema = s.object(
  {
    id: s.nullableString("The choice identifier when Ninox returns one."),
    caption: s.nullableString("The display caption of the choice when Ninox returns one."),
    captions: s.nullable(looseRecordSchema),
    raw: looseRecordSchema,
  },
  {
    required: ["id", "caption", "captions", "raw"],
    description: "A Ninox table field choice.",
  },
);

const tableFieldSchema = s.object(
  {
    id: s.nullableString("The field identifier when Ninox returns one."),
    name: s.nullableString("The field name when Ninox returns one."),
    type: s.nullableString("The field type when Ninox returns one."),
    choices: s.nullable(s.array("The field choices returned by Ninox.", tableChoiceSchema)),
    raw: looseRecordSchema,
  },
  {
    required: ["id", "name", "type", "choices", "raw"],
    description: "A Ninox table field summary.",
  },
);

const tableSchema = s.object(
  {
    id: trimmedIdentifierSchema("The Ninox table identifier."),
    name: s.string("The Ninox table name."),
    fields: s.array("The Ninox table fields.", tableFieldSchema),
    raw: looseRecordSchema,
  },
  {
    required: ["id", "name", "fields", "raw"],
    description: "A Ninox table schema summary.",
  },
);

const databaseDetailSchema = s.object(
  {
    settings: s.nullable(looseRecordSchema),
    schema: s.nullable(looseRecordSchema),
    raw: looseRecordSchema,
  },
  {
    required: ["settings", "schema", "raw"],
    description: "A Ninox database schema wrapper.",
  },
);

const recordSchema = s.object(
  {
    id: positiveRecordIdSchema,
    sequence: s.nullableInteger("The Ninox record sequence when Ninox returns one."),
    createdAt: s.nullableString("The record creation timestamp when Ninox returns one."),
    createdBy: s.unknown("The record creator identifier when Ninox returns one."),
    modifiedAt: s.nullableString("The record modification timestamp when Ninox returns one."),
    modifiedBy: s.unknown("The record modifier identifier when Ninox returns one."),
    fields: recordFieldsSchema,
    raw: looseRecordSchema,
  },
  {
    required: ["id", "sequence", "createdAt", "createdBy", "modifiedAt", "modifiedBy", "fields", "raw"],
    description: "A normalized Ninox record.",
  },
);

const teamIdSchema = trimmedIdentifierSchema("The Ninox workspace identifier.");
const databaseIdSchema = trimmedIdentifierSchema("The Ninox database identifier.");
const tableIdSchema = trimmedIdentifierSchema("The Ninox table identifier.");

const teamOnlyInputSchema = s.object(
  {
    teamId: teamIdSchema,
  },
  {
    required: ["teamId"],
    description: "Input parameters that identify one Ninox workspace.",
  },
);

const databaseInputSchema = s.object(
  {
    teamId: teamIdSchema,
    databaseId: databaseIdSchema,
  },
  {
    required: ["teamId", "databaseId"],
    description: "Input parameters that identify one Ninox database.",
  },
);

const tableInputSchema = s.object(
  {
    teamId: teamIdSchema,
    databaseId: databaseIdSchema,
    tableId: tableIdSchema,
  },
  {
    required: ["teamId", "databaseId", "tableId"],
    description: "Input parameters that identify one Ninox table.",
  },
);

const saveRecordInputSchema = s.object(
  {
    id: positiveRecordIdSchema,
    fields: recordFieldsSchema,
  },
  {
    required: ["fields"],
    optional: ["id"],
    description: "One Ninox record write payload.",
  },
);

export const ninoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Ninox workspaces available to the authenticated Personal Access Token.",
    inputSchema: s.object({}, { description: "The input payload for listing Ninox workspaces." }),
    outputSchema: s.actionOutput(
      {
        workspaces: s.array("The workspaces returned by Ninox.", workspaceSchema),
      },
      "The response returned when listing Ninox workspaces.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get one Ninox workspace by workspace ID.",
    inputSchema: teamOnlyInputSchema,
    outputSchema: s.actionOutput(
      {
        workspace: workspaceSchema,
      },
      "The response returned when reading one Ninox workspace.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_databases",
    description: "List Ninox databases inside one workspace.",
    inputSchema: teamOnlyInputSchema,
    outputSchema: s.actionOutput(
      {
        databases: s.array("The databases returned by Ninox.", databaseSummarySchema),
      },
      "The response returned when listing Ninox databases.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_database",
    description: "Get Ninox schema metadata for one database.",
    inputSchema: databaseInputSchema,
    outputSchema: s.actionOutput(
      {
        database: databaseDetailSchema,
      },
      "The response returned when reading one Ninox database schema.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tables",
    description: "List Ninox tables for one database.",
    inputSchema: databaseInputSchema,
    outputSchema: s.actionOutput(
      {
        tables: s.array("The tables returned by Ninox.", tableSchema),
      },
      "The response returned when listing Ninox tables.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_table",
    description: "Get Ninox schema metadata for one table.",
    inputSchema: tableInputSchema,
    outputSchema: s.actionOutput(
      {
        table: tableSchema,
      },
      "The response returned when reading one Ninox table schema.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_records",
    description: "List records from one Ninox table.",
    inputSchema: s.object(
      {
        teamId: teamIdSchema,
        databaseId: databaseIdSchema,
        tableId: tableIdSchema,
        choiceStyle: styleSchema,
      },
      {
        required: ["teamId", "databaseId", "tableId"],
        optional: ["choiceStyle"],
        description: "The input payload for listing Ninox records.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        records: s.array("The records returned by Ninox.", recordSchema),
      },
      "The response returned when listing Ninox records.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_record",
    description: "Get one Ninox record by record ID.",
    inputSchema: s.object(
      {
        teamId: teamIdSchema,
        databaseId: databaseIdSchema,
        tableId: tableIdSchema,
        recordId: positiveRecordIdSchema,
        choiceStyle: styleSchema,
        style: styleSchema,
      },
      {
        required: ["teamId", "databaseId", "tableId", "recordId"],
        optional: ["choiceStyle", "style"],
        description: "The input payload for reading one Ninox record.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        record: recordSchema,
      },
      "The response returned when reading one Ninox record.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_record",
    description: "Find a single Ninox record by filters in one table.",
    inputSchema: s.object(
      {
        teamId: teamIdSchema,
        databaseId: databaseIdSchema,
        tableId: tableIdSchema,
        filters: searchFiltersSchema,
        style: styleSchema,
        dateStyle: styleSchema,
        choiceStyle: styleSchema,
      },
      {
        required: ["teamId", "databaseId", "tableId", "filters"],
        optional: ["style", "dateStyle", "choiceStyle"],
        description: "The input payload for searching one Ninox record.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        record: s.nullable(recordSchema),
      },
      "The response returned when searching one Ninox record.",
    ),
  }),
  defineProviderAction(service, {
    name: "save_records",
    description:
      "Create new Ninox records or update existing ones in the same table using the native POST /records endpoint.",
    inputSchema: s.object(
      {
        teamId: teamIdSchema,
        databaseId: databaseIdSchema,
        tableId: tableIdSchema,
        records: s.array("The records to create or update in Ninox.", saveRecordInputSchema, {
          minItems: 1,
        }),
      },
      {
        required: ["teamId", "databaseId", "tableId", "records"],
        description: "The input payload for creating or updating Ninox records.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        records: s.array("The records returned by Ninox after saving.", recordSchema),
      },
      "The response returned when saving Ninox records.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_record",
    description: "Delete one Ninox record by record ID.",
    inputSchema: s.object(
      {
        teamId: teamIdSchema,
        databaseId: databaseIdSchema,
        tableId: tableIdSchema,
        recordId: positiveRecordIdSchema,
      },
      {
        required: ["teamId", "databaseId", "tableId", "recordId"],
        description: "The input payload for deleting one Ninox record.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the target Ninox record was deleted."),
      },
      "The response returned when deleting one Ninox record.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_records",
    description: "Delete multiple Ninox records from the same table.",
    inputSchema: s.object(
      {
        teamId: teamIdSchema,
        databaseId: databaseIdSchema,
        tableId: tableIdSchema,
        recordIds: s.array("The Ninox record IDs to delete.", positiveRecordIdSchema, {
          minItems: 1,
        }),
      },
      {
        required: ["teamId", "databaseId", "tableId", "recordIds"],
        description: "The input payload for deleting multiple Ninox records.",
      },
    ),
    outputSchema: s.actionOutput(
      {
        deletedCount: s.nonNegativeInteger("The number of Ninox record IDs submitted for deletion."),
      },
      "The response returned when deleting multiple Ninox records.",
    ),
  }),
];
