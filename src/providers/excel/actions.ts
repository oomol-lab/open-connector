import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "excel";

export const excelProviderScopes = {
  userRead: "User.Read",
  filesRead: "Files.Read",
  filesReadWrite: "Files.ReadWrite",
  offlineAccess: "offline_access",
} as const;

const readScope = [excelProviderScopes.filesReadWrite];
const writeScope = [excelProviderScopes.filesReadWrite];
const workbookPermission = [excelProviderScopes.filesReadWrite];

const optionalWorkbook = ["driveId", "sessionId"];
const workbookReference = {
  itemId: s.nonEmptyString("Workbook drive item ID."),
  driveId: s.nonEmptyString("Optional drive ID. Leave empty to use the current user's default OneDrive."),
  sessionId: s.nonEmptyString("Optional workbook session ID created by create_session."),
};
const graphObject = s.looseObject("A generic JSON object returned by Microsoft Graph.");
const graphObjects = s.array("A list of generic JSON objects returned by Microsoft Graph.", graphObject);
const cellValue = s.union([{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }], {
  description: "A scalar worksheet cell value.",
});
const matrix = s.array("A two-dimensional matrix of cell values or cell metadata.", s.array(cellValue));
const success = s.actionOutput(
  { success: s.literal(true, { description: "Whether the Excel operation completed successfully." }) },
  "Successful Excel mutation acknowledgement.",
);
const driveItem = s.looseObject(
  {
    id: s.string("Drive item ID."),
    name: s.string("Drive item name."),
    webUrl: s.string("Web URL for the drive item."),
    createdDateTime: s.string("Creation timestamp for the drive item."),
    lastModifiedDateTime: s.string("Last modification timestamp for the drive item."),
    size: s.integer("Drive item size in bytes."),
    file: graphObject,
    folder: graphObject,
    workbook: graphObject,
    parentReference: graphObject,
  },
  { description: "Drive item summary returned by Microsoft Graph." },
);
const worksheet = s.looseObject(
  {
    id: s.string("Worksheet ID."),
    name: s.string("Worksheet name."),
    position: s.integer("Zero-based worksheet position."),
    visibility: s.string("Worksheet visibility."),
  },
  { description: "Worksheet resource returned by Microsoft Graph." },
);
const range = s.looseObject(
  {
    address: s.string("A1-style address of the range."),
    values: matrix,
    text: matrix,
    formulas: matrix,
    numberFormat: matrix,
  },
  { description: "Workbook range returned by Microsoft Graph." },
);
const table = s.looseObject(
  {
    id: s.string("Table ID."),
    name: s.string("Table name."),
    showHeaders: s.boolean("Whether the table shows headers."),
    showTotals: s.boolean("Whether the table shows totals."),
    style: s.string("Excel table style name."),
  },
  { description: "Workbook table returned by Microsoft Graph." },
);
const tableRow = s.looseObject(
  {
    index: s.integer("Zero-based row index inside the table."),
    values: matrix,
  },
  { description: "Workbook table row returned by Microsoft Graph." },
);
const tableColumn = s.looseObject(
  {
    id: s.string("Table column ID."),
    name: s.string("Table column name."),
    index: s.integer("Zero-based column index."),
    values: matrix,
  },
  { description: "Workbook table column returned by Microsoft Graph." },
);
const nextLink = s.nullableString("Opaque Microsoft Graph nextLink for fetching the next page.");
const top = s.integer("Maximum number of items to return.", { minimum: 1, maximum: 200 });
const select = s.stringArray("Optional Microsoft Graph fields to include in the response.", { minItems: 1 });
const worksheetId = s.nonEmptyString("Worksheet name or worksheet ID.");
const tableId = s.nonEmptyString("Table name or table ID.");
const columnId = s.nonEmptyString("Table column name or table column ID.");
const address = s.nonEmptyString("Excel A1-style range address.");

function action(input: {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    ...input,
    providerPermissions: workbookPermission,
  });
}

export const excelActions: ActionDefinition[] = [
  action({
    name: "create_workbook",
    operationType: "write",
    description: "Create a new .xlsx workbook file and optionally populate worksheets and data.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        path: s.nonEmptyString(
          "Workbook path including the file name, relative to the drive root and ending with .xlsx.",
        ),
        driveId: workbookReference.driveId,
        drive_id: workbookReference.driveId,
        worksheetData: s.record(matrix, { description: "Optional mapping of worksheet names to row data." }),
        worksheet_data: s.record(matrix, { description: "Alias of worksheetData." }),
        worksheetNames: s.stringArray("Optional worksheet names to create in order."),
        worksheet_names: s.stringArray("Alias of worksheetNames."),
      },
      ["path"],
    ),
    outputSchema: driveItem,
  }),
  action({
    name: "search_files",
    operationType: "read",
    description: "Search workbook files in the current OneDrive drive and return matching drive items.",
    requiredScopes: readScope,
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString("Search query used to find workbook files."),
        driveId: workbookReference.driveId,
        top,
        fileExtensions: s.stringArray("Optional file extensions used to filter search results."),
      },
      ["query"],
    ),
    outputSchema: s.actionOutput(
      { items: s.array("Matching drive items returned by the search.", driveItem), nextLink },
      "Workbook file search result.",
    ),
  }),
  action({
    name: "list_drive_item_children",
    operationType: "read",
    description: "List direct child drive items for a folder or the drive root.",
    requiredScopes: readScope,
    inputSchema: s.actionInput({ driveId: workbookReference.driveId, itemId: workbookReference.itemId, top, select }),
    outputSchema: s.actionOutput(
      { items: s.array("Child drive items returned by Microsoft Graph.", driveItem), nextLink },
      "Drive item children response.",
    ),
  }),
  action({
    name: "create_session",
    operationType: "write",
    description: "Create an Excel workbook session for subsequent workbook operations.",
    requiredScopes: readScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        persistChanges: s.boolean("Whether workbook changes should persist after the session closes."),
      },
      ["itemId"],
    ),
    outputSchema: s.actionOutput(
      {
        sessionId: s.string("Workbook session ID."),
        persistChanges: s.boolean("Whether the workbook session persists changes when closed."),
      },
      "Workbook session summary.",
    ),
  }),
  action({
    name: "get_workbook",
    operationType: "read",
    description: "Read workbook metadata and optionally expand related workbook resources.",
    requiredScopes: readScope,
    inputSchema: s.actionInput(
      { ...workbookReference, expand: s.stringArray("Optional relationships to expand on the workbook resource.") },
      ["itemId"],
    ),
    outputSchema: s.actionOutput(
      {
        workbook: s.looseObject("Workbook metadata returned by Microsoft Graph.", {
          worksheets: s.array(worksheet),
          tables: graphObjects,
        }),
      },
      "Workbook metadata response.",
    ),
  }),
  action({
    name: "list_worksheets",
    operationType: "read",
    description: "List worksheets in a workbook.",
    requiredScopes: readScope,
    inputSchema: s.object(workbookReference, {
      required: ["itemId"],
      optional: optionalWorkbook,
      description: "Input payload for listing workbook worksheets.",
    }),
    outputSchema: s.actionOutput(
      { worksheets: s.array("Worksheets returned by Microsoft Graph.", worksheet), nextLink },
      "Worksheet list response.",
    ),
  }),
  action({
    name: "get_worksheet",
    operationType: "read",
    description: "Read a single worksheet by worksheet name or worksheet ID.",
    requiredScopes: readScope,
    inputSchema: s.actionInput({ ...workbookReference, worksheetId }, ["itemId", "worksheetId"]),
    outputSchema: s.actionOutput({ worksheet }, "Single worksheet response."),
  }),
  action({
    name: "add_worksheet",
    operationType: "write",
    description: "Add a new worksheet to a workbook.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput({ ...workbookReference, name: s.nonEmptyString("Worksheet name to create.") }, [
      "itemId",
    ]),
    outputSchema: s.actionOutput({ worksheet }, "Worksheet creation response."),
  }),
  action({
    name: "update_worksheet",
    operationType: "write",
    description: "Update worksheet metadata such as the name, position, or visibility.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        name: s.nonEmptyString("Updated worksheet name."),
        position: s.nonNegativeInteger("Updated zero-based worksheet position."),
        visibility: s.stringEnum("Updated worksheet visibility.", ["Visible", "Hidden", "VeryHidden"]),
      },
      ["itemId", "worksheetId"],
    ),
    outputSchema: s.actionOutput({ worksheet }, "Worksheet update response."),
  }),
  action({
    name: "delete_worksheet",
    operationType: "destructive",
    description: "Delete one worksheet from a workbook.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput({ ...workbookReference, worksheetId }, ["itemId", "worksheetId"]),
    outputSchema: success,
  }),
  action({
    name: "get_range",
    operationType: "read",
    description: "Read one worksheet range by A1-style address.",
    requiredScopes: readScope,
    inputSchema: s.actionInput({ ...workbookReference, worksheetId, address }, ["itemId", "worksheetId", "address"]),
    outputSchema: s.actionOutput({ range }, "Single range response."),
  }),
  action({
    name: "get_worksheet_used_range",
    operationType: "read",
    description: "Read the used range for one worksheet.",
    requiredScopes: readScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        valuesOnly: s.boolean("Whether to ignore formatting-only cells in the used range."),
      },
      ["itemId", "worksheetId"],
    ),
    outputSchema: s.actionOutput({ range }, "Worksheet used range response."),
  }),
  action({
    name: "update_range",
    operationType: "destructive",
    description: "Update one worksheet range with values, formulas, formats, or visibility flags.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        address,
        values: matrix,
        formulas: matrix,
        formulasLocal: matrix,
        formulasR1C1: matrix,
        numberFormat: matrix,
        rowHidden: s.boolean("Whether rows in the range should be hidden."),
        columnHidden: s.boolean("Whether columns in the range should be hidden."),
      },
      ["itemId", "worksheetId", "address"],
    ),
    outputSchema: s.actionOutput({ range }, "Range update response."),
  }),
  action({
    name: "clear_range",
    operationType: "destructive",
    description: "Clear one worksheet range.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        address,
        applyTo: s.stringEnum("Optional clear mode accepted by Microsoft Graph.", ["All", "Formats", "Contents"]),
      },
      ["itemId", "worksheetId", "address"],
    ),
    outputSchema: success,
  }),
  action({
    name: "insert_range",
    operationType: "write",
    description: "Insert one worksheet range and shift existing cells to make space.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        address,
        shift: s.stringEnum("Direction used when inserting the range.", ["Down", "Right"]),
      },
      ["itemId", "worksheetId", "address", "shift"],
    ),
    outputSchema: s.actionOutput({ range }, "Range insertion response."),
  }),
  action({
    name: "merge_cells",
    operationType: "write",
    description: "Merge cells inside one worksheet range.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        address,
        across: s.boolean("Whether each row in the range should merge separately."),
      },
      ["itemId", "worksheetId", "address"],
    ),
    outputSchema: success,
  }),
  action({
    name: "sort_range",
    operationType: "destructive",
    description: "Apply a Microsoft Graph sort definition to one worksheet range.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        address,
        fields: s.array(
          "Sort field definitions accepted by Microsoft Graph.",
          s.looseObject("Sort field used by Microsoft Graph workbook sorts."),
          { minItems: 1 },
        ),
        matchCase: s.boolean("Whether sorting should be case-sensitive."),
        hasHeaders: s.boolean("Whether the range contains a header row."),
        orientation: s.string("Optional Graph sort orientation."),
        method: s.string("Optional Graph sort method."),
      },
      ["itemId", "worksheetId", "address", "fields"],
    ),
    outputSchema: success,
  }),
  action({
    name: "list_tables",
    operationType: "read",
    description: "List workbook tables, optionally restricted to one worksheet.",
    requiredScopes: readScope,
    inputSchema: s.actionInput({ ...workbookReference, worksheetId }, ["itemId"]),
    outputSchema: s.actionOutput(
      { tables: s.array("Tables returned by Microsoft Graph.", table), nextLink },
      "Table list response.",
    ),
  }),
  action({
    name: "add_table",
    operationType: "write",
    description: "Create a new workbook table from an address range.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        worksheetId,
        address,
        hasHeaders: s.boolean("Whether the first row of the range already contains table headers."),
      },
      ["itemId", "address", "hasHeaders"],
    ),
    outputSchema: s.actionOutput({ table }, "Table creation response."),
  }),
  action({
    name: "update_table",
    operationType: "write",
    description: "Update table metadata such as the name, style, or header flags.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        tableId,
        name: s.nonEmptyString("Updated table name."),
        style: s.nonEmptyString("Updated Excel table style."),
        showTotals: s.boolean("Whether the table shows totals."),
        showHeaders: s.boolean("Whether the table shows headers."),
      },
      ["itemId", "tableId"],
    ),
    outputSchema: s.actionOutput({ table }, "Table update response."),
  }),
  action({
    name: "convert_table_to_range",
    operationType: "destructive",
    description: "Convert a workbook table back into a plain worksheet range.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput({ ...workbookReference, tableId }, ["itemId", "tableId"]),
    outputSchema: s.actionOutput({ range }, "Table conversion response."),
  }),
  action({
    name: "list_table_rows",
    operationType: "read",
    description: "List rows for one workbook table.",
    requiredScopes: readScope,
    inputSchema: s.actionInput({ ...workbookReference, tableId }, ["itemId", "tableId"]),
    outputSchema: s.actionOutput(
      { rows: s.array("Table rows returned by Microsoft Graph.", tableRow), nextLink },
      "Table row list response.",
    ),
  }),
  action({
    name: "add_table_row",
    operationType: "write",
    description: "Add one or more rows to a workbook table.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        tableId,
        index: s.nonNegativeInteger("Optional zero-based insertion index."),
        values: matrix,
      },
      ["itemId", "tableId", "values"],
    ),
    outputSchema: s.actionOutput({ row: tableRow }, "Table row creation response."),
  }),
  action({
    name: "delete_table_row",
    operationType: "destructive",
    description: "Delete one row from a workbook table by row index.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      { ...workbookReference, tableId, rowIndex: s.nonNegativeInteger("Zero-based row index to delete.") },
      ["itemId", "tableId", "rowIndex"],
    ),
    outputSchema: success,
  }),
  action({
    name: "list_table_columns",
    operationType: "read",
    description: "List columns for one workbook table.",
    requiredScopes: readScope,
    inputSchema: s.actionInput({ ...workbookReference, tableId }, ["itemId", "tableId"]),
    outputSchema: s.actionOutput(
      { columns: s.array("Table columns returned by Microsoft Graph.", tableColumn), nextLink },
      "Table column list response.",
    ),
  }),
  action({
    name: "get_table_column",
    operationType: "read",
    description: "Read one workbook table column by column name or column ID.",
    requiredScopes: readScope,
    inputSchema: s.actionInput({ ...workbookReference, tableId, columnId }, ["itemId", "tableId", "columnId"]),
    outputSchema: s.actionOutput({ column: tableColumn }, "Single table column response."),
  }),
  action({
    name: "add_table_column",
    operationType: "write",
    description: "Add one column to a workbook table.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        tableId,
        index: s.nonNegativeInteger("Optional zero-based insertion index."),
        values: matrix,
      },
      ["itemId", "tableId"],
    ),
    outputSchema: s.actionOutput({ column: tableColumn }, "Table column creation response."),
  }),
  action({
    name: "delete_table_column",
    operationType: "destructive",
    description: "Delete one column from a workbook table.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput({ ...workbookReference, tableId, columnId }, ["itemId", "tableId", "columnId"]),
    outputSchema: success,
  }),
  action({
    name: "apply_table_filter",
    operationType: "write",
    description: "Apply a Microsoft Graph filter criteria object to one table column.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        tableId,
        columnId,
        criteria: s.looseObject("Filter criteria object accepted by Microsoft Graph table filters."),
      },
      ["itemId", "tableId", "columnId", "criteria"],
    ),
    outputSchema: success,
  }),
  action({
    name: "clear_table_filter",
    operationType: "destructive",
    description: "Clear the current Microsoft Graph filter on one table column.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput({ ...workbookReference, tableId, columnId }, ["itemId", "tableId", "columnId"]),
    outputSchema: success,
  }),
  action({
    name: "apply_table_sort",
    operationType: "destructive",
    description: "Apply a Microsoft Graph sort definition to one workbook table.",
    requiredScopes: writeScope,
    inputSchema: s.actionInput(
      {
        ...workbookReference,
        tableId,
        fields: s.array(
          "Sort field definitions accepted by Microsoft Graph.",
          s.looseObject("Sort field used by Microsoft Graph workbook sorts."),
          { minItems: 1 },
        ),
        matchCase: s.boolean("Whether sorting should be case-sensitive."),
        method: s.string("Optional Graph sort method."),
      },
      ["itemId", "tableId", "fields"],
    ),
    outputSchema: success,
  }),
];
