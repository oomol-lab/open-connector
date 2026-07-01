import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "baserow";

const tableIdSchema = s.positiveInteger("The Baserow table ID.");
const rowIdSchema = s.positiveInteger("The Baserow row ID.");
const rowSchema = s.looseObject("A Baserow row payload keyed by field name or field ID.");
const tableSchema = s.looseObject("A Baserow table summary.", {
  id: s.integer("The Baserow table ID."),
  name: s.string("The Baserow table name."),
  order: s.integer("The table order inside the database."),
  database_id: s.integer("The database ID that owns the table."),
});
const fieldSchema = s.looseObject("A Baserow field definition.", {
  id: s.integer("The Baserow field ID."),
  name: s.string("The Baserow field name."),
  type: s.string("The Baserow field type."),
  order: s.integer("The field order inside the table."),
  primary: s.boolean("Whether the field is the table primary field."),
});
const outputRowSchema = s.looseObject("A Baserow row returned by the API.", {
  id: s.integer("The Baserow row ID."),
});
const userFieldNamesSchema = s.boolean("Whether Baserow should use user-facing field names instead of field IDs.");
const pageSchema = s.integer("Page number to fetch from the paginated Baserow rows endpoint.", { minimum: 1 });
const sizeSchema = s.integer("Number of rows to request per page, from 1 to 200.", { minimum: 1, maximum: 200 });

export const baserowActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tables",
    description: "List the Baserow tables accessible to the authenticated database token.",
    requiredScopes: [],
    followUpActions: ["baserow.list_table_fields", "baserow.list_table_rows"],
    inputSchema: s.object("Input payload for listing accessible Baserow tables.", {}),
    outputSchema: s.object("Accessible Baserow tables.", {
      tables: s.array("Baserow tables accessible to the token.", tableSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_table_fields",
    description: "List the field definitions for one Baserow table.",
    requiredScopes: [],
    followUpActions: ["baserow.list_table_rows"],
    inputSchema: s.object("Input payload for listing Baserow fields for one table.", {
      tableId: tableIdSchema,
    }),
    outputSchema: s.object("Baserow field list response.", {
      fields: s.array("Field definitions returned by Baserow.", fieldSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_table_rows",
    description: "List rows from one Baserow table with optional search, ordering, filters, and pagination.",
    requiredScopes: [],
    followUpActions: ["baserow.get_table_row", "baserow.update_table_row"],
    inputSchema: s.object(
      "Input payload for listing paginated Baserow rows from one table.",
      {
        tableId: tableIdSchema,
        userFieldNames: userFieldNamesSchema,
        search: s.nonEmptyString("Free-text search string applied by Baserow when listing rows."),
        orderBy: s.nonEmptyString("Comma-separated Baserow sort expression, using '-' for descending fields."),
        filters: s.looseObject("Baserow field filters keyed by field name or field ID."),
        filterType: s.stringEnum("How multiple Baserow filters should be combined.", ["AND", "OR"]),
        page: pageSchema,
        size: sizeSchema,
      },
      { optional: ["userFieldNames", "search", "orderBy", "filters", "filterType", "page", "size"] },
    ),
    outputSchema: s.object("Paginated Baserow row list.", {
      count: s.integer("Total number of rows that match the current query."),
      next: s.nullable(s.string("URL for the next rows page.")),
      previous: s.nullable(s.string("URL for the previous rows page.")),
      rows: s.array("Rows returned by the current Baserow page.", outputRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_table_row",
    description: "Read one Baserow row by table ID and row ID.",
    requiredScopes: [],
    followUpActions: ["baserow.update_table_row", "baserow.delete_table_row"],
    inputSchema: s.object(
      "Input payload for reading one Baserow row.",
      {
        tableId: tableIdSchema,
        rowId: rowIdSchema,
        userFieldNames: userFieldNamesSchema,
      },
      { optional: ["userFieldNames"] },
    ),
    outputSchema: s.object("Single Baserow row response.", {
      row: outputRowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_table_row",
    description: "Create one row in a Baserow table.",
    requiredScopes: [],
    followUpActions: ["baserow.get_table_row"],
    inputSchema: s.object(
      "Input payload for creating one Baserow row.",
      {
        tableId: tableIdSchema,
        userFieldNames: userFieldNamesSchema,
        row: rowSchema,
      },
      { optional: ["userFieldNames"] },
    ),
    outputSchema: s.object("Baserow row creation response.", {
      row: outputRowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_table_row",
    description: "Update one existing Baserow row.",
    requiredScopes: [],
    followUpActions: ["baserow.get_table_row"],
    inputSchema: s.object(
      "Input payload for updating one Baserow row.",
      {
        tableId: tableIdSchema,
        rowId: rowIdSchema,
        userFieldNames: userFieldNamesSchema,
        row: rowSchema,
      },
      { optional: ["userFieldNames"] },
    ),
    outputSchema: s.object("Baserow row update response.", {
      row: outputRowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_table_row",
    description: "Delete one Baserow row by row ID.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for deleting one Baserow row.", {
      tableId: tableIdSchema,
      rowId: rowIdSchema,
    }),
    outputSchema: s.object("Baserow row deletion acknowledgement.", {
      deleted: s.boolean("Whether the row deletion request succeeded."),
      rowId: s.integer("The Baserow row ID that was deleted."),
    }),
  }),
];

export type BaserowActionName = (typeof baserowActions)[number]["name"];
