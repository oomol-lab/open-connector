import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "smartsheet";

const positiveIdSchema = (description: string) => s.positiveInteger(description);
const csvStringSchema = (description: string) => s.nonEmptyString(description);
const paginationInputFields = {
  page: s.integer("The page number to return.", { minimum: 1 }),
  pageSize: s.integer("The maximum number of items to return per page.", { minimum: 1, maximum: 10000 }),
};

const pageSchema = s.object("Pagination metadata returned by Smartsheet.", {
  pageNumber: s.nullableInteger("The returned page number."),
  pageSize: s.nullableInteger("The returned page size."),
  totalPages: s.nullableInteger("The total number of pages."),
  totalCount: s.nullableInteger("The total number of available records."),
});

const cellInputSchema = s.object(
  "A Smartsheet cell payload.",
  {
    columnId: positiveIdSchema("The column ID for the cell."),
    value: s.unknown("The typed value to write to the cell."),
    displayValue: s.nonEmptyString("The display value for the cell."),
    strict: s.boolean("Whether Smartsheet should enforce strict cell value validation."),
    hyperlink: s.looseObject("The hyperlink object for the cell."),
    linkInFromCell: s.looseObject("The inbound cell link object."),
    objectValue: s.unknown("The object value for contact, picklist, or other rich cell types."),
  },
  { optional: ["value", "displayValue", "strict", "hyperlink", "linkInFromCell", "objectValue"] },
);

const rowInputSchema = s.object(
  "A Smartsheet row payload.",
  {
    id: positiveIdSchema("The row ID. Required when updating rows."),
    cells: s.array("The cells to write for this row.", cellInputSchema, { minItems: 1 }),
    toTop: s.boolean("Whether to place the row at the top of the sheet."),
    toBottom: s.boolean("Whether to place the row at the bottom of the sheet."),
    parentId: positiveIdSchema("The parent row ID for an indented row."),
    siblingId: positiveIdSchema("The sibling row ID used for relative placement."),
    above: s.boolean("Whether to place the row above the sibling row."),
    indent: s.integer("The indent operation amount. Smartsheet expects 1.", { minimum: 1, maximum: 1 }),
    outdent: s.integer("The outdent operation amount. Smartsheet expects 1.", { minimum: 1, maximum: 1 }),
    expanded: s.boolean("Whether the row is expanded."),
    locked: s.boolean("Whether the row is locked."),
  },
  {
    optional: ["id", "toTop", "toBottom", "parentId", "siblingId", "above", "indent", "outdent", "expanded", "locked"],
  },
);

const rowUpdateInputSchema = s.object(
  "A Smartsheet row payload for updating an existing row.",
  {
    id: positiveIdSchema("The row ID. Required when updating rows."),
    cells: s.array("The cells to write for this row.", cellInputSchema, { minItems: 1 }),
    toTop: s.boolean("Whether to place the row at the top of the sheet."),
    toBottom: s.boolean("Whether to place the row at the bottom of the sheet."),
    parentId: positiveIdSchema("The parent row ID for an indented row."),
    siblingId: positiveIdSchema("The sibling row ID used for relative placement."),
    above: s.boolean("Whether to place the row above the sibling row."),
    indent: s.integer("The indent operation amount. Smartsheet expects 1.", { minimum: 1, maximum: 1 }),
    outdent: s.integer("The outdent operation amount. Smartsheet expects 1.", { minimum: 1, maximum: 1 }),
    expanded: s.boolean("Whether the row is expanded."),
    locked: s.boolean("Whether the row is locked."),
  },
  { optional: ["toTop", "toBottom", "parentId", "siblingId", "above", "indent", "outdent", "expanded", "locked"] },
);

const cellSchema = s.object("A normalized Smartsheet cell.", {
  columnId: s.nullableInteger("The column ID for the cell."),
  value: s.unknown("The typed value returned for the cell."),
  displayValue: s.nullableString("The display value returned for the cell."),
  columnType: s.nullableString("The column type returned for the cell."),
  raw: s.looseObject("The raw cell object returned by Smartsheet."),
});

const rowSchema = s.object("A normalized Smartsheet row.", {
  id: s.nullableInteger("The row ID."),
  sheetId: s.nullableInteger("The parent sheet ID."),
  rowNumber: s.nullableInteger("The row number within the sheet."),
  permalink: s.nullableString("The Smartsheet permalink for the row."),
  expanded: s.nullableBoolean("Whether the row is expanded."),
  createdAt: s.nullableString("The row creation timestamp."),
  modifiedAt: s.nullableString("The row modification timestamp."),
  cells: s.array("The cells returned for the row.", cellSchema),
  raw: s.looseObject("The raw row object returned by Smartsheet."),
});

const columnSchema = s.object("A normalized Smartsheet column.", {
  id: s.nullableInteger("The column ID."),
  title: s.nullableString("The column title."),
  type: s.nullableString("The column type."),
  primary: s.nullableBoolean("Whether this is the primary column."),
  index: s.nullableInteger("The zero-based column index."),
  symbol: s.nullableString("The column symbol type."),
  options: s.stringArray("The column options when present."),
  raw: s.looseObject("The raw column object returned by Smartsheet."),
});

const sheetSummarySchema = s.object("A normalized Smartsheet sheet summary.", {
  id: s.nullableInteger("The sheet ID."),
  name: s.nullableString("The sheet name."),
  accessLevel: s.nullableString("The caller access level for the sheet."),
  permalink: s.nullableString("The Smartsheet permalink for the sheet."),
  createdAt: s.nullableString("The sheet creation timestamp."),
  modifiedAt: s.nullableString("The sheet modification timestamp."),
  workspaceId: s.nullableInteger("The workspace ID when the sheet is in a workspace."),
  raw: s.looseObject("The raw sheet object returned by Smartsheet."),
});

const sheetSchema = s.object("A normalized Smartsheet sheet.", {
  id: s.nullableInteger("The sheet ID."),
  name: s.nullableString("The sheet name."),
  accessLevel: s.nullableString("The caller access level for the sheet."),
  permalink: s.nullableString("The Smartsheet permalink for the sheet."),
  createdAt: s.nullableString("The sheet creation timestamp."),
  modifiedAt: s.nullableString("The sheet modification timestamp."),
  version: s.nullableInteger("The sheet version number."),
  totalRowCount: s.nullableInteger("The total row count reported by Smartsheet."),
  columns: s.array("The sheet columns.", columnSchema),
  rows: s.array("The sheet rows.", rowSchema),
  raw: s.looseObject("The raw sheet object returned by Smartsheet."),
});

const writeResultSchema = s.object("A normalized Smartsheet write result.", {
  message: s.nullableString("The Smartsheet result message."),
  resultCode: s.nullableInteger("The Smartsheet result code."),
  version: s.nullableInteger("The sheet version after the operation."),
  rows: s.array("The rows returned by Smartsheet.", rowSchema),
  raw: s.looseObject("The raw write response returned by Smartsheet."),
});

export const smartsheetActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sheets",
    description: "List sheets available to the authenticated Smartsheet access token.",
    inputSchema: s.object(
      "The input payload for listing Smartsheet sheets.",
      {
        includeAll: s.boolean("Whether Smartsheet should include all matching sheets."),
        modifiedSince: s.dateTime("Only return sheets modified on or after this timestamp."),
        ...paginationInputFields,
      },
      { optional: ["includeAll", "modifiedSince", "page", "pageSize"] },
    ),
    outputSchema: s.object("The response returned when listing Smartsheet sheets.", {
      page: pageSchema,
      sheets: s.array("The sheets returned by Smartsheet.", sheetSummarySchema),
      raw: s.looseObject("The raw list response returned by Smartsheet."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sheet",
    description: "Get a Smartsheet sheet with columns and rows.",
    inputSchema: s.object(
      "The input payload for getting a Smartsheet sheet.",
      {
        sheetId: positiveIdSchema("The ID of the sheet to retrieve."),
        include: csvStringSchema("Comma-separated Smartsheet include flags."),
        exclude: csvStringSchema("Comma-separated Smartsheet exclude flags."),
        columnIds: csvStringSchema("Comma-separated column IDs to include."),
        rowIds: csvStringSchema("Comma-separated row IDs to include."),
        rowNumbers: csvStringSchema("Comma-separated row numbers to include."),
        filterId: csvStringSchema("The Smartsheet filter ID to apply."),
        ifVersionAfter: s.integer("Only return the full sheet if it changed after this version.", { minimum: 0 }),
        level: s.integer("The Smartsheet object-value compatibility level.", { minimum: 0, maximum: 2 }),
        rowsModifiedSince: s.dateTime("Only return rows modified on or after this timestamp."),
        ...paginationInputFields,
      },
      {
        optional: [
          "include",
          "exclude",
          "columnIds",
          "rowIds",
          "rowNumbers",
          "filterId",
          "ifVersionAfter",
          "level",
          "rowsModifiedSince",
          "page",
          "pageSize",
        ],
      },
    ),
    outputSchema: s.object("The response returned when getting a Smartsheet sheet.", { sheet: sheetSchema }),
  }),
  defineProviderAction(service, {
    name: "add_rows",
    description: "Add one or more rows to a Smartsheet sheet.",
    inputSchema: s.object(
      "The input payload for adding Smartsheet rows.",
      {
        sheetId: positiveIdSchema("The ID of the sheet that receives the rows."),
        rows: s.array("The rows to add.", rowInputSchema, { minItems: 1 }),
        allowPartialSuccess: s.boolean("Whether Smartsheet should allow partial success."),
        overrideValidation: s.boolean("Whether Smartsheet should bypass cell validation limits."),
      },
      { optional: ["allowPartialSuccess", "overrideValidation"] },
    ),
    outputSchema: writeResultSchema,
  }),
  defineProviderAction(service, {
    name: "update_rows",
    description: "Update one or more rows in a Smartsheet sheet.",
    inputSchema: s.object(
      "The input payload for updating Smartsheet rows.",
      {
        sheetId: positiveIdSchema("The ID of the sheet containing the rows."),
        rows: s.array("The rows to update. Each row must include an id.", rowUpdateInputSchema, { minItems: 1 }),
        allowPartialSuccess: s.boolean("Whether Smartsheet should allow partial success."),
        overrideValidation: s.boolean("Whether Smartsheet should bypass cell validation limits."),
      },
      { optional: ["allowPartialSuccess", "overrideValidation"] },
    ),
    outputSchema: writeResultSchema,
  }),
  defineProviderAction(service, {
    name: "delete_rows",
    description: "Delete one or more rows from a Smartsheet sheet.",
    inputSchema: s.object(
      "The input payload for deleting Smartsheet rows.",
      {
        sheetId: positiveIdSchema("The ID of the sheet containing the rows."),
        rowIds: s.array("The row IDs to delete.", positiveIdSchema("One row ID to delete."), { minItems: 1 }),
        ignoreRowsNotFound: s.boolean("Whether Smartsheet should ignore missing row IDs."),
      },
      { optional: ["ignoreRowsNotFound"] },
    ),
    outputSchema: s.object("A normalized Smartsheet delete result.", {
      message: s.nullableString("The Smartsheet result message."),
      resultCode: s.nullableInteger("The Smartsheet result code."),
      deletedRowIds: s.array("The row IDs requested for deletion.", s.integer("One deleted row ID.")),
      raw: s.looseObject("The raw delete response returned by Smartsheet."),
    }),
  }),
];
