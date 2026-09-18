import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googlesheetsReadScopes, googlesheetsWriteScopes } from "./scopes.ts";

const service = "googlesheets";

interface GooglesheetsActionSource {
  name: GooglesheetsActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const objectSchema = s.record(true, { description: "Google Sheets API object." });
const objectArray = s.array(objectSchema, { description: "Google Sheets API objects." });
const nullableString = s.nullable(s.string({ description: "String value, or null when Google did not return it." }));
const spreadsheetId = s.string({ minLength: 1, description: "Google Sheets spreadsheet ID or spreadsheet URL." });
const sheetId = s.integer({ description: "Numeric sheet ID." });
const sheetName = s.string({ minLength: 1, description: "Sheet title." });
const a1Range = s.string({ minLength: 1, description: "A1 notation range." });
const stringList = s.array(s.string({ minLength: 1 }), { description: "String values." });
const cellValue = s.union([s.string(), s.number(), s.boolean(), { type: "null" }], {
  description: "Google Sheets cell value.",
});
const cellMatrix = s.array(s.array(cellValue), { minItems: 1, description: "Two-dimensional cell value matrix." });
const dimension = s.stringEnum(["ROWS", "COLUMNS"], { description: "Spreadsheet dimension." });
const majorDimension = s.stringEnum(["DIMENSION_UNSPECIFIED", "ROWS", "COLUMNS"], {
  description: "Major dimension for value ranges.",
});
const valueRenderOption = s.stringEnum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"], {
  description: "How values should be rendered.",
});
const dateTimeRenderOption = s.stringEnum(["SERIAL_NUMBER", "FORMATTED_STRING"], {
  description: "How dates and times should be rendered.",
});
const valueInputOption = s.stringEnum(["INPUT_VALUE_OPTION_UNSPECIFIED", "RAW", "USER_ENTERED"], {
  description: "How input data should be interpreted.",
});

const spreadsheetReference = {
  spreadsheetId,
};

const responseOptions = {
  includeSpreadsheetInResponse: s.boolean({
    description: "Whether to include the updated spreadsheet in the response.",
  }),
  responseRanges: s.array(s.string(), { description: "Ranges to include in the response spreadsheet." }),
  responseIncludeGridData: s.boolean({ description: "Whether response spreadsheet data should include grid data." }),
};

const renderOptions = {
  majorDimension,
  valueRenderOption,
  dateTimeRenderOption,
};

const responseRenderOptions = {
  includeValuesInResponse: s.boolean({ description: "Whether to include written values in the response." }),
  responseValueRenderOption: valueRenderOption,
  responseDateTimeRenderOption: dateTimeRenderOption,
};

const normalizedSheetProperties = s.object(
  {
    sheetId,
    title: s.string({ description: "Sheet title." }),
    index: s.integer({ description: "Zero-based sheet index." }),
    sheetType: s.string({ description: "Sheet type." }),
    hidden: s.boolean({ description: "Whether the sheet is hidden." }),
    gridProperties: objectSchema,
  },
  { additionalProperties: true, description: "Normalized sheet properties." },
);

const normalizedSpreadsheet = s.object(
  {
    spreadsheetId: s.string({ description: "Spreadsheet ID." }),
    spreadsheetUrl: nullableString,
    properties: objectSchema,
    sheets: s.array(
      s.object(
        {
          properties: normalizedSheetProperties,
          data: objectArray,
          conditionalFormats: objectArray,
        },
        { additionalProperties: true, description: "Normalized sheet." },
      ),
      { description: "Sheets in the spreadsheet." },
    ),
    namedRanges: objectArray,
    developerMetadata: objectArray,
  },
  {
    required: ["spreadsheetId", "spreadsheetUrl", "properties", "sheets", "namedRanges", "developerMetadata"],
    additionalProperties: true,
    description: "Normalized spreadsheet metadata.",
  },
);

const spreadsheetSummary = s.object(
  {
    id: s.string({ description: "Drive file ID." }),
    name: s.string({ description: "Spreadsheet file name." }),
    mimeType: s.string({ description: "Drive MIME type." }),
    webViewLink: nullableString,
    createdTime: nullableString,
    modifiedTime: nullableString,
    owners: objectArray,
    shared: s.boolean({ description: "Whether the file is shared." }),
    starred: s.boolean({ description: "Whether the file is starred." }),
    trashed: s.boolean({ description: "Whether the file is trashed." }),
  },
  {
    required: ["id", "name", "mimeType", "owners", "shared", "starred", "trashed"],
    description: "Spreadsheet file summary.",
  },
);

const valueRange = s.object(
  {
    range: s.string({ description: "A1 notation range returned by Google." }),
    majorDimension: s.string({ description: "Major dimension returned by Google." }),
    values: s.array(s.array(cellValue), { description: "Cell values." }),
  },
  { required: ["range", "majorDimension", "values"], description: "Google Sheets ValueRange." },
);

const updateResponse = s.object(
  {
    spreadsheetId: s.string({ description: "Spreadsheet ID." }),
    updatedRange: s.string({ description: "Updated A1 range." }),
    updatedRows: s.integer({ description: "Number of updated rows." }),
    updatedColumns: s.integer({ description: "Number of updated columns." }),
    updatedCells: s.integer({ description: "Number of updated cells." }),
    updatedData: valueRange,
  },
  {
    required: ["spreadsheetId", "updatedRange", "updatedRows", "updatedColumns", "updatedCells"],
    description: "Values update result.",
  },
);

const batchUpdateResponse = s.object(
  {
    spreadsheetId: s.string({ description: "Spreadsheet ID." }),
    totalUpdatedRows: s.integer({ description: "Total updated rows." }),
    totalUpdatedColumns: s.integer({ description: "Total updated columns." }),
    totalUpdatedCells: s.integer({ description: "Total updated cells." }),
    responses: s.array(objectSchema, { description: "Per-range update responses." }),
  },
  {
    required: ["spreadsheetId", "totalUpdatedRows", "totalUpdatedColumns", "totalUpdatedCells", "responses"],
    description: "Batch values update result.",
  },
);

const batchMutationResponse = s.object(
  {
    spreadsheetId: s.string({ description: "Spreadsheet ID." }),
    replies: objectArray,
    updatedSpreadsheet: normalizedSpreadsheet,
    sheetId,
    chartId: s.integer({ description: "Affected chart ID." }),
    updatedRange: s.string({ description: "Affected A1 range." }),
  },
  { required: ["spreadsheetId"], additionalProperties: true, description: "spreadsheets.batchUpdate result." },
);

const gridIndexes = {
  startRowIndex: s.integer({ minimum: 0, description: "Zero-based start row index." }),
  endRowIndex: s.integer({ minimum: 1, description: "Exclusive end row index." }),
  startColumnIndex: s.integer({ minimum: 0, description: "Zero-based start column index." }),
  endColumnIndex: s.integer({ minimum: 1, description: "Exclusive end column index." }),
};

const dimensionRange = s.object(
  {
    sheetId,
    dimension,
    startIndex: s.integer({ minimum: 0, description: "Zero-based start index." }),
    endIndex: s.integer({ minimum: 1, description: "Exclusive end index." }),
  },
  { required: ["sheetId", "dimension", "startIndex", "endIndex"], description: "Dimension range." },
);

const actions: GooglesheetsActionSource[] = [
  {
    name: "search_spreadsheets",
    operationType: "read",
    description: "Search Google Sheets files in Drive with spreadsheet-only filters and normalized summary output.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input({
      query: s.string({ description: "Search text or a Drive query expression." }),
      orderBy: s.string({ description: "Drive orderBy expression." }),
      pageToken: s.string({ minLength: 1, description: "Pagination token." }),
      maxResults: s.integer({ minimum: 1, maximum: 1000, description: "Maximum files to return." }),
      searchType: s.stringEnum(["name", "content", "both"], { description: "Where to search for the query text." }),
      starredOnly: s.boolean({ description: "Only return starred spreadsheets." }),
      createdAfter: s.string({ description: "Only return files created after this time." }),
      modifiedAfter: s.string({ description: "Only return files modified after this time." }),
      sharedWithMe: s.boolean({ description: "Only return files shared with the user." }),
      includeTrashed: s.boolean({ description: "Include trashed files." }),
      includeSharedDrives: s.boolean({ description: "Include shared drives." }),
    }),
    outputSchema: s.object(
      {
        spreadsheets: s.array(spreadsheetSummary, { description: "Matching spreadsheet files." }),
        totalFound: s.integer({ description: "Number of files in this page." }),
        nextPageToken: nullableString,
      },
      { required: ["spreadsheets", "totalFound", "nextPageToken"], description: "Spreadsheet search result." },
    ),
  },
  {
    name: "create_google_sheet1",
    operationType: "write",
    description: "Create a Google Sheets spreadsheet and return stable spreadsheet metadata for the new file.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input({ title: s.string({ description: "New spreadsheet title." }) }),
    outputSchema: normalizedSpreadsheet,
  },
  {
    name: "get_spreadsheet_info",
    operationType: "read",
    description: "Read spreadsheet metadata through spreadsheets.get with optional ranges and grid data flags.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        ranges: stringList,
        includeGridData: s.boolean({ description: "Include grid data." }),
        excludeTablesInBandedRanges: s.boolean({ description: "Exclude tables in banded ranges." }),
      },
      ["spreadsheetId"],
    ),
    outputSchema: normalizedSpreadsheet,
  },
  {
    name: "get_spreadsheet_by_data_filter",
    operationType: "read",
    description:
      "Read spreadsheet metadata through spreadsheets.getByDataFilter and return the normalized spreadsheet payload.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        dataFilters: objectArray,
        includeGridData: s.boolean({ description: "Include grid data." }),
        excludeTablesInBandedRanges: s.boolean({ description: "Exclude tables in banded ranges." }),
      },
      ["spreadsheetId"],
    ),
    outputSchema: normalizedSpreadsheet,
  },
  {
    name: "get_sheet_names",
    operationType: "read",
    description: "List visible or all sheet names from a spreadsheet and include a stable name-to-sheetId map.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input(
      { ...spreadsheetReference, excludeHidden: s.boolean({ description: "Exclude hidden sheets." }) },
      ["spreadsheetId"],
    ),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        sheetNames: stringList,
        sheetIdByName: s.record(s.integer({ description: "Sheet ID." }), { description: "Sheet title to ID map." }),
      },
      { required: ["spreadsheetId", "sheetNames", "sheetIdByName"], description: "Sheet names result." },
    ),
  },
  {
    name: "search_developer_metadata",
    operationType: "read",
    description: "Search spreadsheet developer metadata via developerMetadata:search and return matched entries only.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input({ ...spreadsheetReference, dataFilters: objectArray }, ["spreadsheetId", "dataFilters"]),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        matchedDeveloperMetadata: objectArray,
      },
      { required: ["spreadsheetId", "matchedDeveloperMetadata"], description: "Developer metadata search result." },
    ),
  },
  {
    name: "get_conditional_format_rules",
    operationType: "read",
    description: "Read spreadsheet conditional formatting rules and project them into a stable per-sheet structure.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetId,
        sheetTitle: sheetName,
        excludeTablesInBandedRanges: s.boolean({ description: "Exclude tables in banded ranges." }),
      },
      ["spreadsheetId"],
    ),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        sheets: s.array(objectSchema, { description: "Sheets with conditional formatting rules." }),
      },
      { required: ["spreadsheetId", "sheets"], description: "Conditional format rules result." },
    ),
  },
  {
    name: "get_data_validation_rules",
    operationType: "read",
    description:
      "Read spreadsheet data validation rules from the minimum necessary sheet ranges and return flattened rule entries.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        ranges: stringList,
        sheetId,
        sheetTitle: sheetName,
        includeEmpty: s.boolean({ description: "Include cells without validation rules." }),
      },
      ["spreadsheetId"],
    ),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        rules: objectArray,
      },
      { required: ["spreadsheetId", "rules"], description: "Data validation rules result." },
    ),
  },
  {
    name: "values_get",
    operationType: "read",
    description: "Read a single spreadsheet value range and return a stable ValueRange without a wrapper envelope.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input({ ...spreadsheetReference, range: a1Range, ...renderOptions }, ["spreadsheetId", "range"]),
    outputSchema: valueRange,
  },
  {
    name: "batch_get",
    operationType: "read",
    description: "Read multiple spreadsheet ranges through values:batchGet and return stable valueRanges output.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input({ ...spreadsheetReference, ranges: stringList, ...renderOptions }, ["spreadsheetId", "ranges"]),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        valueRanges: s.array(valueRange, { description: "Value ranges." }),
      },
      { required: ["spreadsheetId", "valueRanges"], description: "Batch get result." },
    ),
  },
  {
    name: "spreadsheets_values_batch_get_by_data_filter",
    operationType: "read",
    description:
      "Read spreadsheet values through values:batchGetByDataFilter and return matched value ranges with their filters.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input({ ...spreadsheetReference, dataFilters: objectArray, ...renderOptions }, [
      "spreadsheetId",
      "dataFilters",
    ]),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        valueRanges: objectArray,
      },
      { required: ["spreadsheetId", "valueRanges"], description: "Batch get by data filter result." },
    ),
  },
  {
    name: "values_update",
    operationType: "destructive",
    description: "Write a single spreadsheet value range through values.update and return stable update counters.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        range: a1Range,
        values: cellMatrix,
        majorDimension,
        valueInputOption,
        ...responseRenderOptions,
        autoExpandSheet: s.boolean({ description: "Whether to auto-expand the sheet to fit the data." }),
      },
      ["spreadsheetId", "range", "values", "valueInputOption"],
    ),
    outputSchema: updateResponse,
  },
  {
    name: "update_values_batch",
    operationType: "destructive",
    description:
      "Write multiple spreadsheet value ranges through values.batchUpdate and return stable aggregate counters.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        data: s.array(
          s.object(
            { range: a1Range, values: cellMatrix, majorDimension },
            { required: ["range", "values"], description: "Batch values update item." },
          ),
          { minItems: 1, description: "Ranges to update." },
        ),
        valueInputOption,
        ...responseRenderOptions,
      },
      ["spreadsheetId", "data", "valueInputOption"],
    ),
    outputSchema: batchUpdateResponse,
  },
  {
    name: "spreadsheets_values_append",
    operationType: "write",
    description:
      "Append values through values.append and flatten the nested updates payload into stable top-level fields.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        range: a1Range,
        values: cellMatrix,
        majorDimension,
        insertDataOption: s.stringEnum(["OVERWRITE", "INSERT_ROWS"], {
          description: "How appended data should be inserted.",
        }),
        valueInputOption,
        ...responseRenderOptions,
      },
      ["spreadsheetId", "range", "values", "valueInputOption"],
    ),
    outputSchema: s.object(
      { ...schemaProperties(updateResponse), tableRange: s.string({ description: "Table range before append." }) },
      {
        required: ["spreadsheetId", "tableRange", "updatedRange", "updatedRows", "updatedColumns", "updatedCells"],
        description: "Append values result.",
      },
    ),
  },
  {
    name: "clear_values",
    operationType: "destructive",
    description: "Clear a single spreadsheet value range through values.clear and return the cleared A1 range.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input({ ...spreadsheetReference, range: a1Range }, ["spreadsheetId", "range"]),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        clearedRange: s.string({ description: "Cleared A1 range." }),
      },
      { required: ["spreadsheetId", "clearedRange"], description: "Clear values result." },
    ),
  },
  {
    name: "spreadsheets_values_batch_clear",
    operationType: "destructive",
    description: "Clear multiple spreadsheet value ranges through values.batchClear and return cleared ranges only.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input({ ...spreadsheetReference, ranges: stringList }, ["spreadsheetId", "ranges"]),
    outputSchema: clearedRangesOutput(),
  },
  {
    name: "batch_clear_values_by_data_filter",
    operationType: "destructive",
    description: "Clear spreadsheet values through values.batchClearByDataFilter and return the cleared ranges.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input({ ...spreadsheetReference, dataFilters: objectArray }, ["spreadsheetId", "dataFilters"]),
    outputSchema: clearedRangesOutput(),
  },
  {
    name: "batch_update_values_by_data_filter",
    operationType: "destructive",
    description:
      "Write spreadsheet values through values.batchUpdateByDataFilter and return stable aggregate counters.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        data: s.array(
          s.object(
            { dataFilter: objectSchema, values: cellMatrix, majorDimension },
            { required: ["dataFilter", "values"], description: "Data-filter-addressed values update item." },
          ),
          { minItems: 1, description: "Data-filter-addressed ranges to update." },
        ),
        valueInputOption,
        ...responseRenderOptions,
      },
      ["spreadsheetId", "data", "valueInputOption"],
    ),
    outputSchema: batchUpdateResponse,
  },
  {
    name: "add_sheet",
    operationType: "write",
    description: "Add a new sheet through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        title: s.string({ minLength: 1, description: "New sheet title." }),
        properties: objectSchema,
        forceUnique: s.boolean({ description: "Ensure the title is unique." }),
        objectSheetConfig: objectSchema,
        dataSourceConfig: objectSchema,
        ...responseOptions,
      },
      ["spreadsheetId"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "delete_sheet",
    operationType: "destructive",
    description: "Delete a sheet through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input({ ...spreadsheetReference, sheetId, ...responseOptions }, ["spreadsheetId", "sheetId"]),
    outputSchema: batchMutationResponse,
  },
  {
    name: "update_sheet_properties",
    operationType: "destructive",
    description: "Update a sheet's properties through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        updateSheetProperties: s.object(
          {
            properties: objectSchema,
            fields: s.string({ minLength: 1, description: "Field mask." }),
          },
          { description: "Google updateSheetProperties request payload." },
        ),
        properties: objectSchema,
        fields: s.string({ minLength: 1, description: "Field mask for shorthand properties." }),
        ...responseOptions,
      },
      ["spreadsheetId"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "update_spreadsheet_properties",
    operationType: "destructive",
    description:
      "Update spreadsheet-level properties through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        properties: objectSchema,
        fields: s.string({ minLength: 1, description: "Field mask." }),
        ...responseOptions,
      },
      ["spreadsheetId", "properties", "fields"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "append_dimension",
    operationType: "write",
    description: "Append rows or columns through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetId,
        dimension,
        length: s.integer({ minimum: 1, description: "Number of rows or columns to append." }),
        ...responseOptions,
      },
      ["spreadsheetId", "sheetId", "dimension", "length"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "insert_dimension",
    operationType: "write",
    description: "Insert rows or columns through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        insertDimension: s.object(
          {
            range: dimensionRange,
            inheritFromBefore: s.boolean({ description: "Inherit properties from the previous dimension." }),
          },
          { required: ["range"], description: "Insert dimension request." },
        ),
        ...responseOptions,
      },
      ["spreadsheetId", "insertDimension"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "delete_dimension",
    operationType: "destructive",
    description: "Delete rows or columns through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        deleteDimensionRequest: s.object(
          { range: dimensionRange },
          { required: ["range"], description: "Delete dimension request." },
        ),
        sheetId,
        sheetName,
        dimension,
        startIndex: s.integer({ minimum: 0, description: "Start index." }),
        endIndex: s.integer({ minimum: 1, description: "End index." }),
        ...responseOptions,
      },
      ["spreadsheetId"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "auto_resize_dimensions",
    operationType: "write",
    description: "Auto-resize rows or columns through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetId,
        sheetName,
        dimension,
        startIndex: s.integer({ minimum: 0 }),
        endIndex: s.integer({ minimum: 1 }),
        ...responseOptions,
      },
      ["spreadsheetId", "dimension", "startIndex", "endIndex"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "update_dimension_properties",
    operationType: "destructive",
    description: "Update row or column properties through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetId,
        sheetName,
        dimension,
        startIndex: s.integer({ minimum: 0 }),
        endIndex: s.integer({ minimum: 1 }),
        pixelSize: s.integer({ minimum: 0, description: "Pixel size." }),
        hiddenByUser: s.boolean({ description: "Whether the dimension is hidden by the user." }),
        ...responseOptions,
      },
      ["spreadsheetId", "dimension", "startIndex", "endIndex"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "set_basic_filter",
    operationType: "write",
    description: "Set a basic filter through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input({ ...spreadsheetReference, filter: objectSchema, ...responseOptions }, [
      "spreadsheetId",
      "filter",
    ]),
    outputSchema: batchMutationResponse,
  },
  {
    name: "clear_basic_filter",
    operationType: "destructive",
    description: "Clear a basic filter through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input({ ...spreadsheetReference, sheetId, ...responseOptions }, ["spreadsheetId", "sheetId"]),
    outputSchema: batchMutationResponse,
  },
  {
    name: "find_replace",
    operationType: "destructive",
    description: "Run find and replace through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        find: s.string({ minLength: 1, description: "Value to find." }),
        replace: s.string({ description: "Replacement value." }),
        allSheets: s.boolean({ description: "Search every sheet." }),
        range: a1Range,
        rangeSheetId: sheetId,
        sheetId,
        sheetName,
        ...gridIndexes,
        includeFormulas: s.boolean({ description: "Search formulas." }),
        matchCase: s.boolean({ description: "Match case." }),
        matchEntireCell: s.boolean({ description: "Match entire cell." }),
        searchByRegex: s.boolean({ description: "Find value is a regex." }),
      },
      ["spreadsheetId", "find", "replace"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "format_cell",
    operationType: "write",
    description: "Format cells through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        range: a1Range,
        sheetName,
        worksheetId: sheetId,
        ...gridIndexes,
        red: s.number({ minimum: 0, maximum: 1, description: "Background red component." }),
        green: s.number({ minimum: 0, maximum: 1, description: "Background green component." }),
        blue: s.number({ minimum: 0, maximum: 1, description: "Background blue component." }),
        bold: s.boolean({ description: "Apply bold text." }),
        italic: s.boolean({ description: "Apply italic text." }),
        underline: s.boolean({ description: "Apply underline text." }),
        strikethrough: s.boolean({ description: "Apply strikethrough text." }),
        fontSize: s.integer({ minimum: 1, description: "Font size in points." }),
      },
      ["spreadsheetId"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "mutate_conditional_format_rules",
    operationType: "destructive",
    description: "Mutate conditional format rules through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        operation: s.stringEnum(["ADD", "UPDATE", "DELETE", "MOVE"], { description: "Mutation operation." }),
        sheetId,
        index: s.integer({ minimum: 0, description: "Rule index." }),
        newIndex: s.integer({ minimum: 0, description: "New rule index for move." }),
        rule: objectSchema,
      },
      ["spreadsheetId", "operation", "sheetId"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "set_data_validation_rule",
    operationType: "destructive",
    description: "Set or clear data validation through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetId,
        mode: s.stringEnum(["SET", "CLEAR"], { description: "Whether to set or clear validation." }),
        ...gridIndexes,
        validationType: s.string({ minLength: 1, description: "Data validation condition type." }),
        values: stringList,
        sourceRangeA1: a1Range,
        formula: s.string({ minLength: 1, description: "Custom formula." }),
        strict: s.boolean({ description: "Reject invalid input." }),
        showCustomUi: s.boolean({ description: "Show custom UI." }),
        inputMessage: s.string({ description: "Cell selection message." }),
        filteredRowsIncluded: s.boolean({ description: "Include filtered rows." }),
      },
      ["spreadsheetId", "sheetId", "mode", "startRowIndex", "endRowIndex", "startColumnIndex", "endColumnIndex"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "create_chart",
    operationType: "write",
    description: "Create a chart through spreadsheets.batchUpdate and return stable batch replies.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetId,
        chartSpec: objectSchema,
        chartType: s.string({ minLength: 1, description: "Chart type shorthand." }),
        dataRange: a1Range,
        title: s.string({ description: "Chart title." }),
        subtitle: s.string({ description: "Chart subtitle." }),
        xAxisTitle: s.string({ description: "X axis title." }),
        yAxisTitle: s.string({ description: "Y axis title." }),
        legendPosition: s.string({ description: "Legend position." }),
        backgroundRed: s.number({ minimum: 0, maximum: 1 }),
        backgroundGreen: s.number({ minimum: 0, maximum: 1 }),
        backgroundBlue: s.number({ minimum: 0, maximum: 1 }),
      },
      ["spreadsheetId", "sheetId"],
    ),
    outputSchema: batchMutationResponse,
  },
  {
    name: "spreadsheets_sheets_copy_to",
    operationType: "write",
    description: "Copy a sheet to another spreadsheet through sheets.copyTo and return a stable copiedSheet payload.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetId,
        destinationSpreadsheetId: s.string({ minLength: 1, description: "Destination spreadsheet ID." }),
      },
      ["spreadsheetId", "sheetId", "destinationSpreadsheetId"],
    ),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Destination spreadsheet ID." }),
        copiedSheet: normalizedSheetProperties,
      },
      { required: ["spreadsheetId", "copiedSheet"], description: "Copy sheet result." },
    ),
  },
  {
    name: "create_spreadsheet_row",
    operationType: "write",
    description: "Insert an empty row into a sheet through spreadsheets.batchUpdate with stable top-level fields.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: rowOrColumnInput(),
    outputSchema: batchMutationResponse,
  },
  {
    name: "create_spreadsheet_column",
    operationType: "write",
    description: "Insert an empty column into a sheet through spreadsheets.batchUpdate with stable top-level fields.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: rowOrColumnInput(),
    outputSchema: batchMutationResponse,
  },
  {
    name: "lookup_spreadsheet_row",
    operationType: "read",
    description: "Find the first row where a cell exactly matches the query and return a stable found/rowData payload.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        query: s.string({ minLength: 1, description: "Cell value to search for." }),
        range: a1Range,
        caseSensitive: s.boolean({ description: "Case-sensitive comparison." }),
        normalizeWhitespace: s.boolean({ description: "Normalize whitespace before comparing." }),
      },
      ["spreadsheetId", "query"],
    ),
    outputSchema: s.object(
      {
        found: s.boolean({ description: "Whether a matching row was found." }),
        rowData: s.array(s.string(), { description: "First matching row values." }),
      },
      { required: ["found", "rowData"], description: "Lookup row result." },
    ),
  },
  {
    name: "aggregate_column_data",
    operationType: "read",
    description:
      "Aggregate numeric values from a target column, optionally filtered by another column, with stable counters.",
    requiredScopes: googlesheetsReadScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetName,
        targetColumn: s.string({ minLength: 1, description: "Column header or A1 column to aggregate." }),
        operation: s.stringEnum(["sum", "average", "count", "min", "max", "percentage"], {
          description: "Aggregation operation.",
        }),
        searchColumn: s.string({ minLength: 1, description: "Column used to filter rows." }),
        searchValue: s.string({ description: "Value matched in the search column." }),
        caseSensitive: s.boolean({ description: "Case-sensitive matching." }),
        hasHeaderRow: s.boolean({ description: "Whether the first row contains headers." }),
        percentageTotal: s.number({ description: "Explicit denominator for percentage." }),
      },
      ["spreadsheetId", "sheetName", "targetColumn", "operation"],
    ),
    outputSchema: s.object(
      {
        result: s.number({ description: "Computed result." }),
        operation: s.string({ description: "Operation performed." }),
        matchingRowsCount: s.integer({ description: "Rows matching the filter." }),
        processedValuesCount: s.integer({ description: "Numeric values processed." }),
        valuesProcessed: s.array(s.number(), { description: "Values included in the aggregation." }),
        searchDetails: objectSchema,
      },
      {
        required: [
          "result",
          "operation",
          "matchingRowsCount",
          "processedValuesCount",
          "valuesProcessed",
          "searchDetails",
        ],
        description: "Aggregation result.",
      },
    ),
  },
  {
    name: "upsert_rows",
    operationType: "write",
    description:
      "Upsert rows by key while preserving uncovered columns, adding missing headers when needed, and returning stable counters.",
    requiredScopes: googlesheetsWriteScopes,
    inputSchema: input(
      {
        ...spreadsheetReference,
        sheetName,
        rows: cellMatrix,
        headers: stringList,
        keyColumn: s.string({ minLength: 1, description: "Header name used as the row key." }),
        keyColumnIndex: s.integer({ minimum: 0, description: "Zero-based key column index." }),
        tableStart: a1Range,
        strictMode: s.boolean({ description: "Reject row widths that exceed headers." }),
        normalizationMessage: s.string({ description: "Optional normalization note." }),
      },
      ["spreadsheetId", "sheetName", "rows"],
    ),
    outputSchema: s.object(
      {
        spreadsheetId: s.string({ description: "Spreadsheet ID." }),
        sheetName,
        rowsUpdated: s.integer({ description: "Existing rows updated." }),
        rowsInserted: s.integer({ description: "New rows inserted." }),
        columnsAdded: s.integer({ description: "New columns added." }),
        totalRowsProcessed: s.integer({ description: "Input rows processed." }),
      },
      {
        required: ["spreadsheetId", "sheetName", "rowsUpdated", "rowsInserted", "columnsAdded", "totalRowsProcessed"],
        description: "Upsert rows result.",
      },
    ),
  },
];

export type GooglesheetsActionName =
  | "add_sheet"
  | "aggregate_column_data"
  | "append_dimension"
  | "auto_resize_dimensions"
  | "batch_clear_values_by_data_filter"
  | "batch_get"
  | "batch_update_values_by_data_filter"
  | "clear_basic_filter"
  | "clear_values"
  | "create_chart"
  | "create_google_sheet1"
  | "create_spreadsheet_column"
  | "create_spreadsheet_row"
  | "delete_dimension"
  | "delete_sheet"
  | "find_replace"
  | "format_cell"
  | "get_conditional_format_rules"
  | "get_data_validation_rules"
  | "get_sheet_names"
  | "get_spreadsheet_by_data_filter"
  | "get_spreadsheet_info"
  | "insert_dimension"
  | "lookup_spreadsheet_row"
  | "mutate_conditional_format_rules"
  | "search_developer_metadata"
  | "search_spreadsheets"
  | "set_basic_filter"
  | "set_data_validation_rule"
  | "spreadsheets_sheets_copy_to"
  | "spreadsheets_values_append"
  | "spreadsheets_values_batch_clear"
  | "spreadsheets_values_batch_get_by_data_filter"
  | "update_dimension_properties"
  | "update_sheet_properties"
  | "update_spreadsheet_properties"
  | "update_values_batch"
  | "upsert_rows"
  | "values_get"
  | "values_update";

export const googlesheetsActions: ActionDefinition[] = actions.map((action) =>
  defineProviderAction(service, {
    name: action.name,
    operationType: action.operationType,
    description: action.description,
    requiredScopes: action.requiredScopes,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
  }),
);

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "The input payload for this action.");
}

function clearedRangesOutput(): JsonSchema {
  return s.object(
    {
      spreadsheetId: s.string({ description: "Spreadsheet ID." }),
      clearedRanges: s.array(s.string(), { description: "Cleared A1 ranges." }),
    },
    { required: ["spreadsheetId", "clearedRanges"], description: "Clear ranges result." },
  );
}

function rowOrColumnInput(): JsonSchema {
  return input(
    {
      ...spreadsheetReference,
      sheetId,
      sheetName,
      insertIndex: s.integer({ minimum: 0, description: "Zero-based insertion index." }),
      inheritFromBefore: s.boolean({ description: "Inherit dimension properties from the previous row or column." }),
      ...responseOptions,
    },
    ["spreadsheetId"],
  );
}

function schemaProperties(schema: JsonSchema): Record<string, JsonSchema> {
  return (schema.properties ?? {}) as Record<string, JsonSchema>;
}
