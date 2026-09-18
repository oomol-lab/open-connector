import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sheetdb";

const cellValueSchema = s.anyOf("A scalar spreadsheet cell value.", [
  s.string("A string cell value."),
  s.number("A numeric cell value."),
  s.boolean("A boolean cell value."),
  { const: null, type: "null", description: "An empty cell value." },
]);
const rowSchema = s.record("A spreadsheet row keyed by column name.", cellValueSchema);
const rowsSchema = s.array("Spreadsheet rows returned by SheetDB.", rowSchema);
const sheetSchema = s.nonEmptyString("The optional spreadsheet tab name.");
const valueOptionSchema = s.stringEnum("The Google Sheets value rendering or input mode.", ["RAW", "USER_ENTERED"]);
const valueRenderOptionSchema = s.stringEnum("How Google Sheets values should be rendered.", [
  "FORMATTED_VALUE",
  "UNFORMATTED_VALUE",
  "FORMULA",
]);

const readOptions: Record<string, JsonSchema> = {
  sheet: sheetSchema,
  limit: s.nonNegativeInteger("The maximum number of rows to return."),
  offset: s.nonNegativeInteger("The number of rows to skip before returning results."),
  sortBy: s.nonEmptyString("The column name used to sort rows."),
  sortOrder: s.stringEnum("The row sort order.", ["asc", "desc", "random"]),
  sortMethod: s.literal("date", { description: "Use date-aware sorting." }),
  sortDateFormat: s.nonEmptyString("The date format used for date-aware sorting, such as Y-m-d."),
  castNumbers: s.stringArray("Column names whose values should be converted to numbers.", {
    minItems: 1,
    itemDescription: "A column name to convert to numbers.",
  }),
  valueRenderOption: valueRenderOptionSchema,
};

const readOptional = [
  "sheet",
  "limit",
  "offset",
  "sortBy",
  "sortOrder",
  "sortMethod",
  "sortDateFormat",
  "castNumbers",
  "valueRenderOption",
];

const searchOptional = ["match", "caseSensitive", ...readOptional];

export const sheetDbActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_rows",
    operationType: "read",
    description: "List rows from the connected SheetDB spreadsheet with optional paging and sorting.",
    inputSchema: s.actionInput(readOptions, [], "Input parameters for listing SheetDB rows."),
    outputSchema: s.actionOutput({ rows: rowsSchema }, "Rows returned by SheetDB."),
  }),
  defineProviderAction(service, {
    name: "get_keys",
    operationType: "read",
    description: "Get the column names from the first row of the connected spreadsheet.",
    inputSchema: s.actionInput({ sheet: sheetSchema }, [], "Input parameters for getting spreadsheet column names."),
    outputSchema: s.actionOutput(
      {
        keys: s.array("The spreadsheet column names.", s.string("A spreadsheet column name.")),
      },
      "Column names returned by SheetDB.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_document_name",
    operationType: "read",
    description: "Get the Google Sheets document name for the connected SheetDB API.",
    inputSchema: s.actionInput({}, [], "Input parameters for getting the document name."),
    outputSchema: s.actionOutput(
      {
        documentName: s.string("The Google Sheets document name."),
      },
      "The document name returned by SheetDB.",
    ),
  }),
  defineProviderAction(service, {
    name: "count_rows",
    operationType: "read",
    description: "Count data rows in the connected spreadsheet, excluding the header row.",
    inputSchema: s.actionInput({ sheet: sheetSchema }, [], "Input parameters for counting spreadsheet rows."),
    outputSchema: s.actionOutput(
      {
        count: s.nonNegativeInteger("The number of data rows in the spreadsheet."),
      },
      "The spreadsheet row count returned by SheetDB.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_rows",
    operationType: "read",
    description: "Search spreadsheet rows using dynamic column conditions and AND or OR matching.",
    inputSchema: s.object(
      "Input parameters for searching SheetDB rows.",
      {
        query: s.record(
          "Search conditions keyed by spreadsheet column name.",
          s.anyOf("A search value or multiple conditions for the same column.", [
            s.string("A string search condition."),
            s.number("A numeric search condition."),
            s.boolean("A boolean search condition."),
            s.stringArray("Multiple search conditions for the same column.", {
              minItems: 1,
              itemDescription: "One search condition.",
            }),
          ]),
        ),
        match: s.stringEnum("Whether all or any search conditions must match.", ["all", "any"]),
        caseSensitive: s.boolean("Whether string matching is case-sensitive."),
        ...readOptions,
      },
      { optional: searchOptional },
    ),
    outputSchema: s.actionOutput({ rows: rowsSchema }, "Rows matching the SheetDB search conditions."),
  }),
  defineProviderAction(service, {
    name: "create_rows",
    operationType: "write",
    description: "Append one or more JSON rows to the connected spreadsheet.",
    inputSchema: s.actionInput(
      {
        rows: s.array("Rows to append to the spreadsheet.", rowSchema, { minItems: 1 }),
        sheet: sheetSchema,
        returnValues: s.boolean("Whether SheetDB should return the freshly created rows."),
        valueInputOption: valueOptionSchema,
      },
      ["rows"],
      "Input parameters for creating SheetDB rows.",
    ),
    outputSchema: s.actionOutput(
      {
        created: s.nonNegativeInteger("The number of rows created."),
        rows: rowsSchema,
      },
      "The SheetDB row creation result.",
      ["created"],
    ),
  }),
  defineProviderAction(service, {
    name: "update_rows",
    operationType: "write",
    description: "Update all rows matching one spreadsheet column and value.",
    inputSchema: s.actionInput(
      {
        searchColumn: s.nonEmptyString("The column name used to select rows for updating."),
        searchValue: s.nonEmptyString("The value used to select rows for updating."),
        data: rowSchema,
        sheet: sheetSchema,
        valueInputOption: valueOptionSchema,
      },
      ["searchColumn", "searchValue", "data"],
      "Input parameters for updating SheetDB rows.",
    ),
    outputSchema: s.actionOutput(
      {
        updated: s.nonNegativeInteger("The number of rows updated."),
      },
      "The SheetDB row update result.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_rows",
    operationType: "destructive",
    description: "Delete all rows matching one spreadsheet column and value.",
    inputSchema: s.actionInput(
      {
        searchColumn: s.nonEmptyString("The column name used to select rows for deletion."),
        searchValue: s.nonEmptyString("The value used to select rows for deletion."),
        sheet: sheetSchema,
      },
      ["searchColumn", "searchValue"],
      "Input parameters for deleting SheetDB rows.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.nonNegativeInteger("The number of rows deleted."),
      },
      "The SheetDB row deletion result.",
    ),
  }),
];
