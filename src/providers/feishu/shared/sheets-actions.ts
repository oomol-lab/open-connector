import type { ActionDefinition, JsonSchema } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuSheetsProviderPermissions = {
  read: "sheets:spreadsheet:read",
  write: "sheets:spreadsheet:write_only",
  create: "sheets:spreadsheet:create",
};
const spreadsheetTokenField = s.nonEmptyString("The spreadsheet token from a Feishu Sheets URL.");
const sheetIdField = s.nonEmptyString("The sub-sheet ID returned by get_workbook.");
const sheetNameField = s.nonEmptyString("The sub-sheet display name.");
const rangeField = s.nonEmptyString("An A1 range without a sheet prefix, for example `A1:D20`.");
const rawObjectSchema = s.looseObject("The raw Sheets object returned by Feishu.");
const rawResultSchema = s.object(
  "The decoded Sheet AI tool result.",
  {
    result: rawObjectSchema,
  },
  {
    optional: [],
  },
);
const sheetSelectorProperties = {
  sheetId: sheetIdField,
  sheetName: sheetNameField,
};
function sheetInput(description: string, properties: Record<string, JsonSchema> = {}) {
  const schema = s.object(
    description,
    {
      spreadsheetToken: spreadsheetTokenField,
      ...sheetSelectorProperties,
      ...properties,
    },
    {
      optional: ["sheetId", "sheetName"],
    },
  );
  return {
    ...schema,
    oneOf: [
      { required: ["sheetId"], not: { required: ["sheetName"] } },
      { required: ["sheetName"], not: { required: ["sheetId"] } },
    ],
  };
}
const searchOptionsSchema = s.object(
  "Controls how cell text is matched.",
  {
    matchCase: s.boolean("Whether matching is case-sensitive."),
    matchEntireCell: s.boolean("Whether the entire cell must match."),
    useRegex: s.boolean("Whether the search term is a regular expression."),
    matchFormulas: s.boolean("Whether formula text is included in matching."),
  },
  {
    optional: ["matchCase", "matchEntireCell", "useRegex", "matchFormulas"],
  },
);
const typedTableSchema = s.object(
  "A DataFrame-friendly typed table.",
  {
    name: sheetNameField,
    columns: s.array("Column names in display order.", s.nonEmptyString("A column name."), {
      maxItems: 200,
    }),
    data: s.array(
      "Rows whose values align with columns.",
      s.array("One row of typed JSON values.", s.unknown("A JSON cell value.")),
    ),
    dtypes: s.record(
      "Pandas-style dtypes keyed by column name.",
      s.string("A dtype such as object, float64, bool, or datetime64[ns]."),
    ),
    formats: s.record(
      "Optional Sheets number formats keyed by column name.",
      s.string("A Sheets number format such as `yyyy-mm-dd` or `#,##0.00`."),
    ),
    range: s.string("The A1 range represented by this table."),
  },
  {
    optional: ["formats", "range"],
  },
);
export function createFeishuSheetsActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "create_workbook",
      operationType: "write",
      description: "Create a Feishu spreadsheet workbook.",
      requiredScopes: [feishuSheetsProviderPermissions.create],
      providerPermissions: [feishuSheetsProviderPermissions.create],
      inputSchema: s.object(
        "Configure the workbook to create.",
        {
          title: s.nonEmptyString("The workbook title."),
          folderToken: s.string("The destination Drive folder token."),
        },
        {
          optional: ["folderToken"],
        },
      ),
      outputSchema: s.object(
        "The created workbook.",
        {
          workbook: rawObjectSchema,
          spreadsheetToken: spreadsheetTokenField,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_workbook",
      operationType: "read",
      description: "Get workbook structure and metadata, including all sub-sheets.",
      requiredScopes: [feishuSheetsProviderPermissions.read],
      providerPermissions: [feishuSheetsProviderPermissions.read],
      inputSchema: s.object(
        "Identify the workbook to inspect.",
        {
          spreadsheetToken: spreadsheetTokenField,
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The workbook structure.",
        {
          workbook: rawObjectSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_sheet_changeset",
      operationType: "read",
      description: "Get the raw spreadsheet edit actions between two revisions for reviewing applied changes.",
      requiredScopes: [feishuSheetsProviderPermissions.read],
      providerPermissions: [feishuSheetsProviderPermissions.read],
      inputSchema: s.object(
        "Identify the workbook and revision interval to review.",
        {
          spreadsheetToken: spreadsheetTokenField,
          startRevision: s.positiveInteger("The first spreadsheet revision to include."),
          endRevision: s.positiveInteger(
            "The last spreadsheet revision to include; omit it to use the latest revision.",
          ),
        },
        {
          optional: ["endRevision"],
        },
      ),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "get_sheet",
      operationType: "read",
      description: "Get one sub-sheet from a workbook structure.",
      requiredScopes: [feishuSheetsProviderPermissions.read],
      providerPermissions: [feishuSheetsProviderPermissions.read],
      inputSchema: sheetInput("Identify the workbook and sub-sheet to inspect."),
      outputSchema: s.object(
        "The requested sub-sheet.",
        {
          sheet: rawObjectSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_sheet",
      operationType: "write",
      description: "Create an empty sub-sheet with optional position and dimensions.",
      requiredScopes: [feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.write],
      inputSchema: s.object(
        "Configure the sub-sheet to create.",
        {
          spreadsheetToken: spreadsheetTokenField,
          title: sheetNameField,
          index: s.nonNegativeInteger("The zero-based insertion position."),
          rowCount: s.positiveInteger("The initial row count.", { maximum: 50000 }),
          columnCount: s.positiveInteger("The initial column count.", { maximum: 200 }),
        },
        {
          optional: ["index", "rowCount", "columnCount"],
        },
      ),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "update_sheet",
      operationType: "write",
      description: "Rename, move, hide, show, or recolor one sub-sheet.",
      requiredScopes: [feishuSheetsProviderPermissions.read, feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.read, feishuSheetsProviderPermissions.write],
      inputSchema: {
        ...s.object(
          "Identify the sub-sheet and provide one or more updates.",
          {
            spreadsheetToken: spreadsheetTokenField,
            ...sheetSelectorProperties,
            title: s.string("The new sub-sheet title.", { minLength: 1 }),
            index: s.nonNegativeInteger("The new zero-based position."),
            hidden: s.boolean("Whether the sub-sheet should be hidden."),
            tabColor: s.string("The tab color, or an empty string to clear it."),
          },
          {
            optional: ["sheetId", "sheetName", "title", "index", "hidden", "tabColor"],
          },
        ),
        allOf: [
          {
            oneOf: [
              { required: ["sheetId"], not: { required: ["sheetName"] } },
              { required: ["sheetName"], not: { required: ["sheetId"] } },
            ],
          },
          {
            anyOf: [
              { required: ["title"] },
              { required: ["index"] },
              { required: ["hidden"] },
              { required: ["tabColor"] },
            ],
          },
        ],
      },
      outputSchema: s.object(
        "The applied sub-sheet updates.",
        {
          results: s.array("One result per applied update.", rawObjectSchema),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_sheet",
      operationType: "destructive",
      description: "Delete one sub-sheet from a workbook.",
      requiredScopes: [feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.write],
      inputSchema: sheetInput("Identify the sub-sheet to delete."),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "get_cells",
      operationType: "read",
      description: "Read one or more A1 ranges with values, formulas, and optional styles.",
      requiredScopes: [feishuSheetsProviderPermissions.read],
      providerPermissions: [feishuSheetsProviderPermissions.read],
      inputSchema: sheetInput("Identify the sub-sheet and ranges to read.", {
        ranges: s.array("The A1 ranges to read.", rangeField, { minItems: 1 }),
        includeStyles: s.boolean("Whether to include cell styles."),
        renderFormulas: s.boolean("Whether values should be rendered as formulas."),
        skipHidden: s.boolean("Whether hidden rows and columns should be skipped."),
        maxCharacters: s.positiveInteger("The maximum response character count."),
      }),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "set_cells",
      operationType: "destructive",
      description: "Write values, formulas, styles, comments, or validation to an A1 range.",
      requiredScopes: [feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.write],
      inputSchema: sheetInput("Identify the sub-sheet and provide the exact cell matrix to write.", {
        range: rangeField,
        cells: s.array(
          "A rectangular matrix of Sheet AI cell objects.",
          s.array("One row of cell objects.", s.looseObject("One cell write object."), {
            minItems: 1,
          }),
          { minItems: 1 },
        ),
        allowOverwrite: s.boolean("Whether non-empty target cells may be overwritten."),
        copyToRange: s.string("A larger destination range that repeats the written block."),
      }),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "clear_cells",
      operationType: "destructive",
      description: "Clear cell contents, formats, or both from an A1 range.",
      requiredScopes: [feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.write],
      inputSchema: sheetInput("Identify the sub-sheet and range to clear.", {
        range: rangeField,
        clearType: s.stringEnum("What to clear from the range.", ["contents", "formats", "all"]),
      }),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "search_cells",
      operationType: "read",
      description: "Find cell coordinates matching text or a regular expression.",
      requiredScopes: [feishuSheetsProviderPermissions.read],
      providerPermissions: [feishuSheetsProviderPermissions.read],
      inputSchema: sheetInput("Identify the sub-sheet and configure the cell search.", {
        searchTerm: s.nonEmptyString("The text or regular expression to find."),
        range: s.string("An optional A1 range to restrict the search."),
        options: searchOptionsSchema,
        offset: s.nonNegativeInteger("The zero-based match offset."),
        maxMatches: s.positiveInteger("The maximum number of matches to return."),
      }),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "replace_cells",
      operationType: "destructive",
      description: "Find and replace matching text in a sub-sheet.",
      requiredScopes: [feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.write],
      inputSchema: sheetInput("Identify the sub-sheet and configure the replacement.", {
        searchTerm: s.nonEmptyString("The text or regular expression to find."),
        replacement: s.string("The replacement text; use an empty string to delete matches."),
        range: s.string("An optional A1 range to restrict replacement."),
        options: searchOptionsSchema,
      }),
      outputSchema: rawResultSchema,
    }),
    defineProviderAction(service, {
      name: "get_typed_table",
      operationType: "read",
      description: "Read a sub-sheet range into a DataFrame-friendly typed table with inferred dtypes.",
      requiredScopes: [feishuSheetsProviderPermissions.read],
      providerPermissions: [feishuSheetsProviderPermissions.read],
      inputSchema: sheetInput("Identify the sub-sheet and optional range to read.", {
        range: s.string("The A1 range to read; omit to detect the used range."),
        noHeader: s.boolean("Whether the first row is data instead of column names."),
      }),
      outputSchema: s.object(
        "The typed table.",
        {
          table: typedTableSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "put_typed_table",
      operationType: "write",
      description: "Write a DataFrame-friendly typed table while preserving numbers, booleans, and real dates.",
      requiredScopes: [feishuSheetsProviderPermissions.read, feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.read, feishuSheetsProviderPermissions.write],
      inputSchema: s.object(
        "Identify the workbook and provide the typed table.",
        {
          spreadsheetToken: spreadsheetTokenField,
          table: s.object(
            "The table to write into a sub-sheet with the same name.",
            {
              name: sheetNameField,
              startCell: s.string("The top-left write cell. Defaults to A1."),
              columns: s.array("Column names in display order.", s.nonEmptyString("A column name."), {
                minItems: 1,
                maxItems: 200,
              }),
              data: s.array(
                "Rows whose values align with columns.",
                s.array("One row of typed JSON values.", s.unknown("A JSON cell value.")),
              ),
              dtypes: s.record(
                "Pandas-style dtypes keyed by column name.",
                s.string("A dtype such as object, float64, bool, or datetime64[ns]."),
              ),
              formats: s.record(
                "Optional Sheets number formats keyed by column name.",
                s.string("A Sheets number format."),
              ),
              header: s.boolean("Whether to write the column names as a header row."),
              allowOverwrite: s.boolean("Whether existing cells may be overwritten."),
            },
            {
              optional: ["startCell", "formats", "header", "allowOverwrite"],
            },
          ),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The typed table write result.",
        {
          spreadsheetToken: spreadsheetTokenField,
          sheetName: sheetNameField,
          range: rangeField,
          result: rawObjectSchema,
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "batch_update_sheet",
      operationType: "destructive",
      description: "Execute multiple Sheet AI write tools in one batch request.",
      requiredScopes: [feishuSheetsProviderPermissions.write],
      providerPermissions: [feishuSheetsProviderPermissions.write],
      inputSchema: s.object(
        "Identify the workbook and provide Sheet AI write operations.",
        {
          spreadsheetToken: spreadsheetTokenField,
          operations: s.array(
            "The operations to execute in order.",
            s.object(
              "One Sheet AI write operation.",
              {
                toolName: s.nonEmptyString("The write tool name, such as `set_cell_range` or `clear_cell_range`."),
                input: s.looseObject("The tool-specific input, excluding excel_id."),
              },
              {
                optional: [],
              },
            ),
            { minItems: 1 },
          ),
          continueOnError: s.boolean("Whether successful operations remain committed after another operation fails."),
        },
        {
          optional: ["continueOnError"],
        },
      ),
      outputSchema: rawResultSchema,
    }),
  ];
}
