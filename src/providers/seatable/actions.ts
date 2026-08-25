import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "seatable";

const tableNameField = s.nonEmptyString("The SeaTable table name.");
const rowIdField = s.string("The 22-character SeaTable row ID.", {
  minLength: 22,
  maxLength: 22,
});
const rowInputSchema = s.looseRequiredObject("A row keyed by SeaTable column names.", {});
const rowOutputSchema = s.looseRequiredObject("A row returned by SeaTable.", {
  _id: s.optional(s.string("The SeaTable row ID.")),
  _mtime: s.optional(s.string("The row modification timestamp.")),
});
const rawResponseSchema = s.looseRequiredObject("The raw SeaTable API response.", {});

export const seatableActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_metadata",
    description: "Get metadata for the SeaTable base associated with the API token.",
    inputSchema: s.object("Input payload for reading SeaTable base metadata.", {}),
    outputSchema: s.object("SeaTable base metadata response.", {
      metadata: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_rows",
    description: "List rows from a SeaTable table or view with offset pagination.",
    inputSchema: s.object(
      "Input payload for listing SeaTable rows.",
      {
        tableName: tableNameField,
        viewName: s.optional(s.nonEmptyString("Optional SeaTable view name.")),
        start: s.optional(s.integer("Zero-based row offset.", { minimum: 0 })),
        limit: s.optional(s.integer("Maximum rows to return, from 1 to 1000.", { minimum: 1, maximum: 1000 })),
        convertKeys: s.optional(
          s.boolean("Whether returned row keys should use column names instead of internal keys."),
        ),
      },
      { optional: ["viewName", "start", "limit", "convertKeys"] },
    ),
    outputSchema: s.object("SeaTable row list response.", {
      rows: s.array("Rows returned by SeaTable.", rowOutputSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_row",
    description: "Get one row from a SeaTable table by row ID.",
    inputSchema: s.object(
      "Input payload for reading one SeaTable row.",
      {
        tableName: tableNameField,
        rowId: rowIdField,
        convertKeys: s.optional(
          s.boolean("Whether returned row keys should use column names instead of internal keys."),
        ),
      },
      { optional: ["convertKeys"] },
    ),
    outputSchema: s.object("Single SeaTable row response.", {
      row: rowOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "append_rows",
    description: "Append one or more rows to a SeaTable table using column names as keys.",
    inputSchema: s.object(
      "Input payload for appending SeaTable rows.",
      {
        tableName: tableNameField,
        rows: s.array("Rows to append, keyed by column names.", rowInputSchema, {
          minItems: 1,
          maxItems: 1000,
        }),
        applyDefault: s.optional(s.boolean("Whether SeaTable should apply column default values to missing fields.")),
      },
      { optional: ["applyDefault"] },
    ),
    outputSchema: s.object("SeaTable append rows response.", {
      insertedRowCount: s.integer("Number of rows inserted by SeaTable."),
      rowIds: s.array("Identifiers of the inserted rows.", s.unknown("A returned row identifier.")),
      firstRow: s.optional(rowOutputSchema),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_rows",
    description: "Update one or more SeaTable rows using column names as keys.",
    inputSchema: s.object("Input payload for updating SeaTable rows.", {
      tableName: tableNameField,
      updates: s.array(
        "Rows to update.",
        s.object("One SeaTable row update.", {
          rowId: rowIdField,
          row: rowInputSchema,
        }),
        { minItems: 1, maxItems: 1000 },
      ),
    }),
    outputSchema: s.object("SeaTable update rows response.", {
      success: s.boolean("Whether SeaTable accepted the updates."),
      raw: rawResponseSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_rows",
    description: "Delete one or more SeaTable rows by row ID.",
    inputSchema: s.object("Input payload for deleting SeaTable rows.", {
      tableName: tableNameField,
      rowIds: s.array("SeaTable row IDs to delete.", rowIdField, {
        minItems: 1,
        maxItems: 10_000,
      }),
    }),
    outputSchema: s.object("SeaTable delete rows response.", {
      success: s.boolean("Whether SeaTable accepted the deletion."),
      raw: rawResponseSchema,
    }),
  }),
];
