import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "retable";

const identifierField = (description: string) => s.nonWhitespaceString(description);

const retableIdField = identifierField("The Retable table ID from its URL or a discovery action.");
const workspaceIdField = identifierField("The Retable workspace ID.");
const projectIdField = identifierField("The Retable project ID.");
const rowIdField = s.positiveInteger("The numeric Retable row ID.");
const columnIdField = identifierField("The Retable column ID.");
const cellValueSchema = s.anyOf("A Retable cell value accepted by the public API.", [
  s.string("A string cell value."),
  { type: "null", description: "A null cell value." },
]);
const resourceSchema = s.looseRequiredObject("A resource returned by Retable.", {});
const rowSchema = s.looseRequiredObject("A row returned by Retable.", {
  row_id: s.positiveInteger("The numeric Retable row ID."),
});
const insertColumnSchema = s.object("One cell to insert into a new row.", {
  column_id: columnIdField,
  cell_value: cellValueSchema,
});
const insertRowSchema = s.object("One row to insert.", {
  columns: s.array("Cells to insert into the row.", insertColumnSchema, { minItems: 1 }),
});
const updateColumnSchema = s.object("One cell update.", {
  column_id: columnIdField,
  update_cell_value: cellValueSchema,
});
const updateRowSchema = s.object("One row update.", {
  row_id: rowIdField,
  columns: s.array("Cells to update in the row.", updateColumnSchema, { minItems: 1 }),
});

export const retableActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    operationType: "read",
    description: "List the Retable workspaces accessible to the authenticated API key.",
    inputSchema: s.object("Input payload for listing Retable workspaces.", {}),
    outputSchema: s.object("Accessible Retable workspaces.", {
      workspaces: s.array("Workspaces returned by Retable.", resourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List the projects inside one accessible Retable workspace.",
    inputSchema: s.object("Input payload for listing Retable projects.", {
      workspaceId: workspaceIdField,
    }),
    outputSchema: s.object("Retable projects in the selected workspace.", {
      projects: s.array("Projects returned by Retable.", resourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_retables",
    operationType: "read",
    description: "List the tables inside one accessible Retable project.",
    inputSchema: s.object("Input payload for listing tables in a Retable project.", {
      projectId: projectIdField,
    }),
    outputSchema: s.object("Tables in the selected Retable project.", {
      retables: s.array("Tables returned by Retable.", resourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_retable",
    operationType: "read",
    description: "Get one Retable table and its column definitions.",
    inputSchema: s.object("Input payload for reading one Retable table.", {
      retableId: retableIdField,
    }),
    outputSchema: s.object("One Retable table.", {
      retable: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_rows",
    operationType: "read",
    description: "List all rows or up to 50 selected row IDs from one Retable table.",
    inputSchema: s.object("Input payload for listing rows from one Retable table.", {
      retableId: retableIdField,
      rowIds: s.optional(
        s.array("Specific row IDs to return, limited by Retable to 50 rows.", rowIdField, {
          minItems: 1,
          maxItems: 50,
        }),
      ),
    }),
    outputSchema: s.object("Rows returned from one Retable table.", {
      rows: s.array("Rows returned by Retable.", rowSchema),
      count: s.anyOf("The total count returned by Retable, or null when omitted.", [
        s.integer("The returned row count."),
        { type: "null", description: "Retable omitted the row count." },
      ]),
    }),
  }),
  defineProviderAction(service, {
    name: "search_rows",
    operationType: "read",
    description: "Search a Retable table for a term in one column with optional pagination.",
    inputSchema: s.object("Input payload for searching Retable rows.", {
      retableId: retableIdField,
      columnId: columnIdField,
      term: identifierField("The search term."),
      columnIds: s.optional(
        s.array("Additional Retable column IDs included in the search result.", columnIdField, {
          minItems: 1,
        }),
      ),
      limit: s.optional(s.positiveInteger("The maximum number of search results to return.")),
      offset: s.optional(s.integer("The zero-based search result offset.", { minimum: 0 })),
    }),
    outputSchema: s.object("Rows matching a Retable search.", {
      rows: s.array("Matching rows returned by Retable.", rowSchema),
      count: s.anyOf("The total count returned by Retable, or null when omitted.", [
        s.integer("The returned row count."),
        { type: "null", description: "Retable omitted the row count." },
      ]),
    }),
  }),
  defineProviderAction(service, {
    name: "insert_rows",
    operationType: "write",
    description: "Insert one or more rows into a Retable table.",
    inputSchema: s.object("Input payload for inserting Retable rows.", {
      retableId: retableIdField,
      rows: s.array("Rows to insert.", insertRowSchema, { minItems: 1 }),
    }),
    outputSchema: s.object("Result returned after inserting Retable rows.", {
      result: s.unknown("The inserted row data or row IDs returned by Retable."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_rows",
    operationType: "write",
    description: "Update cells in one or more rows of a Retable table.",
    inputSchema: s.object("Input payload for updating Retable rows.", {
      retableId: retableIdField,
      rows: s.array("Rows and cells to update.", updateRowSchema, { minItems: 1 }),
    }),
    outputSchema: s.object("Result returned after updating Retable rows.", {
      result: s.unknown("The updated row data or row IDs returned by Retable."),
    }),
  }),
  defineProviderAction(service, {
    name: "delete_rows",
    operationType: "destructive",
    description: "Delete one or more rows from a Retable table.",
    inputSchema: s.object("Input payload for deleting Retable rows.", {
      retableId: retableIdField,
      rowIds: s.array("Numeric row IDs to delete.", rowIdField, { minItems: 1 }),
    }),
    outputSchema: s.object("Retable row deletion result.", {
      deletedRowCount: s.integer("The number of rows deleted by Retable."),
    }),
  }),
];
