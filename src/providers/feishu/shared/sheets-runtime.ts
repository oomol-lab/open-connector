import type { FeishuJsonRequest } from "./client.ts";

import { compactObject } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuSheetsActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

type SheetToolKind = "read" | "write";

interface SheetReference {
  readonly id?: string;
  readonly name?: string;
  readonly index?: number;
  readonly rowCount?: number;
  readonly columnCount?: number;
  readonly raw?: Record<string, unknown>;
}

interface TypedTable {
  readonly name: string;
  readonly startCell?: string;
  readonly columns: readonly string[];
  readonly data: readonly (readonly unknown[])[];
  readonly dtypes: Readonly<Record<string, string>>;
  readonly formats?: Readonly<Record<string, string>>;
  readonly header?: boolean;
  readonly allowOverwrite?: boolean;
}

const unboundedReadLimit = 1_000_000_000;
const excelEpochMilliseconds = Date.UTC(1899, 11, 30);
const millisecondsPerDay = 86_400_000;

export function createFeishuSheetsActionHandlers(
  request: FeishuJsonRequest,
): Readonly<Record<string, FeishuSheetsActionHandler>> {
  return {
    create_workbook: async (input) => {
      const data = await request({
        method: "POST",
        path: "/sheets/v3/spreadsheets",
        body: compactObject({
          title: input.title,
          folder_token: input.folderToken,
        }),
      });
      const workbook = optionalObject(data.spreadsheet) ?? data;
      const spreadsheetToken =
        optionalString(workbook.spreadsheet_token) ??
        optionalString(workbook.token) ??
        optionalString(data.spreadsheet_token);
      if (!spreadsheetToken) {
        throw invalidResponse("created workbook is missing spreadsheet_token");
      }
      return { workbook, spreadsheetToken };
    },
    get_workbook: async (input) => ({
      workbook: await workbookStructure(request, input.spreadsheetToken),
    }),
    get_sheet_changeset: async (input) => ({
      result: await getSheetChangeset(request, input),
    }),
    get_sheet: async (input) => ({
      sheet: await resolveSheet(request, input),
    }),
    create_sheet: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "write",
        "modify_workbook_structure",
        compactObject({
          excel_id: input.spreadsheetToken,
          operation: "create",
          sheet_name: input.title,
          target_index: input.index,
          rows: input.rowCount,
          columns: input.columnCount,
        }),
      ),
    }),
    update_sheet: (input) => updateSheet(request, input),
    delete_sheet: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "write",
        "modify_workbook_structure",
        withSheetSelector(input, {
          excel_id: input.spreadsheetToken,
          operation: "delete",
        }),
      ),
    }),
    get_cells: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "read",
        "get_cell_ranges",
        withSheetSelector(
          input,
          compactObject({
            excel_id: input.spreadsheetToken,
            ranges: input.ranges,
            include_styles: input.includeStyles,
            value_render_option: input.renderFormulas ? "formula" : undefined,
            skip_hidden: input.skipHidden,
            cell_limit: unboundedReadLimit,
            max_chars: input.maxCharacters,
          }),
        ),
      ),
    }),
    set_cells: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "write",
        "set_cell_range",
        withSheetSelector(
          input,
          compactObject({
            excel_id: input.spreadsheetToken,
            range: input.range,
            cells: input.cells,
            allow_overwrite: input.allowOverwrite,
            copy_to_range: input.copyToRange,
          }),
        ),
      ),
    }),
    clear_cells: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "write",
        "clear_cell_range",
        withSheetSelector(input, {
          excel_id: input.spreadsheetToken,
          range: input.range,
          clear_type: optionalString(input.clearType) ?? "contents",
        }),
      ),
    }),
    search_cells: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "read",
        "search_data",
        withSheetSelector(
          input,
          compactObject({
            excel_id: input.spreadsheetToken,
            search_term: input.searchTerm,
            range: input.range,
            options: normalizeSearchOptions(input.options),
            offset: input.offset,
            max_matches: input.maxMatches,
          }),
        ),
      ),
    }),
    replace_cells: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "write",
        "replace_data",
        withSheetSelector(
          input,
          compactObject({
            excel_id: input.spreadsheetToken,
            search_term: input.searchTerm,
            replace_term: input.replacement,
            range: input.range,
            options: normalizeSearchOptions(input.options),
          }),
        ),
      ),
    }),
    get_typed_table: (input) => getTypedTable(request, input),
    put_typed_table: (input) => putTypedTable(request, input),
    batch_update_sheet: async (input) => ({
      result: await callSheetTool(
        request,
        input.spreadsheetToken,
        "write",
        "batch_update",
        compactObject({
          excel_id: input.spreadsheetToken,
          operations: normalizeBatchOperations(input.operations, input.spreadsheetToken),
          continue_on_error: input.continueOnError === true ? true : undefined,
        }),
      ),
    }),
  };
}

async function updateSheet(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const updates: Array<Record<string, unknown>> = [];
  const selector = sheetReferenceFromInput(input);
  let reference = selector;
  if (selector.name || typeof input.index === "number") {
    const structure = await workbookStructure(request, input.spreadsheetToken);
    const resolved = selectSheetReference(structure, selector);
    if (!resolved.id) {
      throw invalidResponse("the selected sheet is missing sheet_id");
    }
    reference = {
      id: resolved.id,
      index: resolved.index,
    };
  }
  if (typeof input.title === "string") {
    updates.push(
      withReference(reference, {
        excel_id: input.spreadsheetToken,
        operation: "rename",
        new_name: input.title,
      }),
    );
  }
  if (typeof input.index === "number") {
    if (!reference.id || reference.index === undefined) {
      throw invalidResponse("the sheet move source is missing sheet_id or index");
    }
    updates.push(
      withReference(reference, {
        excel_id: input.spreadsheetToken,
        operation: "move",
        source_index: reference.index,
        target_index: input.index,
      }),
    );
  }
  if (typeof input.hidden === "boolean") {
    updates.push(
      withReference(reference, {
        excel_id: input.spreadsheetToken,
        operation: input.hidden ? "hide" : "unhide",
      }),
    );
  }
  if (typeof input.tabColor === "string") {
    updates.push(
      withReference(reference, {
        excel_id: input.spreadsheetToken,
        operation: "set_tab_color",
        tab_color: input.tabColor,
      }),
    );
  }
  if (updates.length === 0) {
    throw new ProviderRequestError(400, "provide at least one sheet update");
  }
  const results: Record<string, unknown>[] = [];
  for (const update of updates) {
    results.push(await callSheetTool(request, input.spreadsheetToken, "write", "modify_workbook_structure", update));
  }
  return { results };
}

async function workbookStructure(request: FeishuJsonRequest, spreadsheetToken: unknown) {
  const token = requireString(spreadsheetToken, "spreadsheetToken");
  return callSheetTool(request, token, "read", "get_workbook_structure", {
    excel_id: token,
  });
}

async function getSheetChangeset(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = requireString(input.spreadsheetToken, "spreadsheetToken");
  const startRevision = requirePositiveInteger(input.startRevision, "startRevision");
  const endRevision =
    input.endRevision === undefined ? undefined : requirePositiveInteger(input.endRevision, "endRevision");
  if (endRevision !== undefined && endRevision < startRevision) {
    throw new ProviderRequestError(400, "endRevision must be at least startRevision");
  }
  if (endRevision !== undefined && endRevision - startRevision + 1 > 20) {
    throw new ProviderRequestError(400, "the revision interval must not exceed 20");
  }
  return callSheetTool(request, token, "read", "get_changeset", {
    excel_id: token,
    start_revision: startRevision,
    end_revision: endRevision,
  });
}

async function resolveSheet(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const structure = await workbookStructure(request, input.spreadsheetToken);
  const selector = sheetReferenceFromInput(input);
  const sheet = extractSheets(structure).find((candidate) => {
    const reference = toSheetReference(candidate);
    return selector.id ? reference.id === selector.id : reference.name === selector.name;
  });
  if (!sheet) {
    throw new ProviderRequestError(404, `sub-sheet ${selector.id ?? selector.name ?? ""} was not found`);
  }
  return sheet;
}

async function getTypedTable(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = requireString(input.spreadsheetToken, "spreadsheetToken");
  const structure = await workbookStructure(request, token);
  const selected = selectSheetReference(structure, sheetReferenceFromInput(input));
  let range = optionalString(input.range);
  if (!range) {
    const lastColumn =
      selected.columnCount && selected.columnCount > 0 ? columnIndexToLetters(selected.columnCount - 1) : "A";
    const lastRow = selected.rowCount && selected.rowCount > 0 ? selected.rowCount : 1;
    const currentRegion = await callSheetTool(
      request,
      token,
      "read",
      "get_range_as_csv",
      withReference(selected, {
        excel_id: token,
        range: `A1:${lastColumn}${lastRow}`,
        max_rows: unboundedReadLimit,
      }),
    );
    range = optionalString(currentRegion.current_region) ?? optionalString(currentRegion.actual_range);
  }
  if (!range) {
    return {
      table: {
        name: selected.name ?? selected.id ?? "",
        columns: [],
        data: [],
        dtypes: {},
        range: "",
      },
    };
  }

  const result = await callSheetTool(
    request,
    token,
    "read",
    "get_cell_ranges",
    withReference(selected, {
      excel_id: token,
      ranges: [range],
      include_styles: true,
      value_render_option: "raw_value",
      cell_limit: unboundedReadLimit,
    }),
  );
  return {
    table: cellsToTypedTable(
      selected.name ?? selected.id ?? "",
      range,
      extractCellGrid(result),
      input.noHeader === true,
    ),
  };
}

async function putTypedTable(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = requireString(input.spreadsheetToken, "spreadsheetToken");
  const table = readTypedTable(input.table);
  const structure = await workbookStructure(request, token);
  const existing = extractSheets(structure)
    .map(toSheetReference)
    .find((sheet) => sheet.name === table.name);
  const reference: SheetReference = existing ?? { name: table.name };
  if (!existing) {
    await callSheetTool(request, token, "write", "modify_workbook_structure", {
      excel_id: token,
      operation: "create",
      sheet_name: table.name,
      rows: Math.max(200, table.data.length + (table.header === false ? 0 : 1)),
      columns: Math.max(20, table.columns.length),
    });
  }

  const matrix = buildTypedCellMatrix(table);
  const startCell = (optionalString(table.startCell) ?? "A1").toUpperCase();
  const start = parseCellReference(startCell);
  const endColumn = columnIndexToLetters(start.column + table.columns.length - 1);
  const endRow = start.row + matrix.length - 1;
  const range = `${startCell}:${endColumn}${endRow}`;
  const result = await callSheetTool(
    request,
    token,
    "write",
    "set_cell_range",
    withReference(reference, {
      excel_id: token,
      range,
      cells: matrix,
      allow_overwrite: table.allowOverwrite ?? true,
    }),
  );
  return {
    spreadsheetToken: token,
    sheetName: table.name,
    range,
    result,
  };
}

async function callSheetTool(
  request: FeishuJsonRequest,
  spreadsheetToken: unknown,
  kind: SheetToolKind,
  toolName: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const token = requireString(spreadsheetToken, "spreadsheetToken");
  const data = await request({
    method: "POST",
    path: `/sheet_ai/v2/spreadsheets/${segment(token)}/tools/invoke_${kind}`,
    body: {
      tool_name: toolName,
      input: JSON.stringify(input),
    },
  });
  const output = data.output;
  if (typeof output === "string") {
    if (output.length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(output) as unknown;
      return requireObject(parsed, `${toolName} output`);
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      throw invalidResponse(`${toolName} returned invalid JSON output`);
    }
  }
  return optionalObject(output) ?? data;
}

function cellsToTypedTable(
  name: string,
  range: string,
  grid: readonly (readonly Record<string, unknown>[])[],
  noHeader: boolean,
) {
  if (grid.length === 0) {
    return { name, columns: [], data: [], dtypes: {}, range };
  }
  const header = noHeader ? [] : (grid[0] ?? []);
  const rows = noHeader ? grid : grid.slice(1);
  const columnCount = grid.reduce((count, row) => Math.max(count, row.length), 0);
  const columns: string[] = [];
  const dataTypes: Record<string, string> = {};
  const formats: Record<string, string> = {};
  const types: string[] = [];

  for (let column = 0; column < columnCount; column += 1) {
    const nameValue = noHeader ? `col${column + 1}` : stringifyCellValue(header[column]?.value) || `col${column + 1}`;
    if (columns.includes(nameValue)) {
      throw new ProviderRequestError(400, `duplicate header column name: ${nameValue}`);
    }
    const inferred = inferColumn(rows, column);
    columns.push(nameValue);
    types.push(inferred.type);
    dataTypes[nameValue] = inferred.dtype;
    if (inferred.format && inferred.format !== "@") {
      formats[nameValue] = inferred.format;
    }
  }
  const data = rows.map((row) => columns.map((_column, index) => typedCellValue(row[index], types[index] ?? "string")));
  return {
    name,
    columns,
    data,
    dtypes: dataTypes,
    ...(Object.keys(formats).length > 0 ? { formats } : {}),
    range,
  };
}

function inferColumn(rows: readonly (readonly Record<string, unknown>[])[], column: number) {
  const seen = new Set<string>();
  let format = "";
  for (const row of rows) {
    const cell = row[column];
    const value = cell?.value;
    if (value == null || value === "") {
      continue;
    }
    const cellFormat = cellNumberFormat(cell);
    if (isDateFormat(cellFormat) && typeof value === "number") {
      seen.add("date");
      format ||= cellFormat;
    } else if (cellFormat.trim() === "@") {
      seen.add("string");
    } else if (typeof value === "number") {
      seen.add("number");
      format ||= cellFormat;
    } else if (typeof value === "boolean") {
      seen.add("bool");
    } else {
      seen.add("string");
    }
  }
  const type = seen.size === 1 ? ([...seen][0] ?? "string") : "string";
  const dtype =
    type === "number" ? "float64" : type === "date" ? "datetime64[ns]" : type === "bool" ? "bool" : "object";
  return { type, dtype, format };
}

function typedCellValue(cell: Record<string, unknown> | undefined, type: string) {
  const value = cell?.value;
  if (value == null || value === "") {
    return null;
  }
  if (type === "date" && typeof value === "number") {
    return new Date(excelEpochMilliseconds + value * millisecondsPerDay).toISOString().slice(0, 10);
  }
  return type === "string" ? stringifyCellValue(value) : value;
}

function buildTypedCellMatrix(table: TypedTable) {
  const matrix: Array<Array<Record<string, unknown>>> = [];
  if (table.header !== false) {
    matrix.push(table.columns.map((name) => ({ value: name })));
  }
  for (let rowIndex = 0; rowIndex < table.data.length; rowIndex += 1) {
    const row = table.data[rowIndex] ?? [];
    if (row.length !== table.columns.length) {
      throw new ProviderRequestError(
        400,
        `table row ${rowIndex + 1} has ${row.length} cells; expected ${table.columns.length}`,
      );
    }
    matrix.push(
      table.columns.map((column, columnIndex) =>
        buildTypedCell(
          row[columnIndex],
          optionalString(table.dtypes[column]) ?? "object",
          optionalString(table.formats?.[column]),
        ),
      ),
    );
  }
  if (matrix.length === 0) {
    throw new ProviderRequestError(400, "typed table has no cells to write");
  }
  return matrix;
}

function buildTypedCell(value: unknown, dtype: string, explicitFormat: string | undefined) {
  const normalized = dtype.toLowerCase();
  const cell: Record<string, unknown> = {};
  const isDate = normalized.startsWith("datetime") || normalized === "date";
  const isString = normalized === "object" || normalized === "string" || normalized.startsWith("string[");
  const format = explicitFormat ?? (isDate ? "yyyy-mm-dd" : isString ? "@" : undefined);
  if (format) {
    cell.cell_styles = { number_format: format };
  }
  if (value == null) {
    return cell;
  }
  if (isDate) {
    if (typeof value !== "string") {
      throw new ProviderRequestError(400, "date cells must be ISO date strings");
    }
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) {
      throw new ProviderRequestError(400, `invalid ISO date: ${value}`);
    }
    cell.value = Math.round((date.getTime() - excelEpochMilliseconds) / millisecondsPerDay);
  } else if (isString) {
    cell.value = stringifyCellValue(value);
  } else if (normalized === "bool" || normalized === "boolean") {
    if (typeof value !== "boolean") {
      throw new ProviderRequestError(400, "boolean cells must be true or false");
    }
    cell.value = value;
  } else if (
    normalized.startsWith("int") ||
    normalized.startsWith("uint") ||
    normalized.startsWith("float") ||
    normalized.startsWith("complex") ||
    normalized === "number"
  ) {
    if (typeof value !== "number") {
      throw new ProviderRequestError(400, "numeric cells must be JSON numbers");
    }
    cell.value = value;
  } else {
    cell.value = value;
  }
  return cell;
}

function readTypedTable(value: unknown): TypedTable {
  const table = requireObject(value, "table");
  const name = requireString(table.name, "table.name");
  const columns = requireStringArray(table.columns, "table.columns");
  const data = requireArray(table.data, "table.data").map((row, index) => {
    if (!Array.isArray(row)) {
      throw new ProviderRequestError(400, `table.data[${index}] must be an array`);
    }
    return row;
  });
  return {
    name,
    startCell: optionalString(table.startCell),
    columns,
    data,
    dtypes: requireStringRecord(table.dtypes, "table.dtypes"),
    formats: optionalStringRecord(table.formats, "table.formats"),
    header: typeof table.header === "boolean" ? table.header : undefined,
    allowOverwrite: typeof table.allowOverwrite === "boolean" ? table.allowOverwrite : undefined,
  };
}

function extractCellGrid(result: Record<string, unknown>) {
  const ranges = Array.isArray(result.ranges) ? result.ranges : [];
  const firstRange = optionalObject(ranges[0]);
  const rows = Array.isArray(firstRange?.cells) ? firstRange.cells : [];
  return rows.map((row) => (Array.isArray(row) ? row.map((cell) => optionalObject(cell) ?? {}) : []));
}

function selectSheetReference(structure: Record<string, unknown>, selector: SheetReference) {
  const reference = extractSheets(structure)
    .map(toSheetReference)
    .find((sheet) => (selector.id ? sheet.id === selector.id : sheet.name === selector.name));
  if (!reference) {
    throw new ProviderRequestError(404, `sub-sheet ${selector.id ?? selector.name ?? ""} was not found`);
  }
  return reference;
}

function sheetReferenceFromInput(input: Record<string, unknown>): SheetReference {
  const id = optionalString(input.sheetId);
  const name = optionalString(input.sheetName);
  if ((id == null) === (name == null)) {
    throw new ProviderRequestError(400, "provide exactly one of sheetId or sheetName");
  }
  return { id, name };
}

function toSheetReference(value: Record<string, unknown>): SheetReference {
  return {
    id: optionalString(value.sheet_id) ?? optionalString(value.id),
    name: optionalString(value.sheet_name) ?? optionalString(value.title) ?? optionalString(value.name),
    index: optionalNonNegativeNumber(value.index),
    rowCount: optionalPositiveNumber(value.row_count),
    columnCount: optionalPositiveNumber(value.column_count),
    raw: value,
  };
}

function extractSheets(structure: Record<string, unknown>) {
  const sheets = Array.isArray(structure.sheets) ? structure.sheets : [];
  return sheets.map(optionalObject).filter((sheet): sheet is Record<string, unknown> => sheet !== undefined);
}

function normalizeBatchOperations(value: unknown, spreadsheetToken: unknown) {
  const token = requireString(spreadsheetToken, "spreadsheetToken");
  return requireArray(value, "operations").map((item, index) => {
    const operation = requireObject(item, `operations[${index}]`);
    return {
      tool_name: requireString(operation.toolName, `operations[${index}].toolName`),
      input: {
        excel_id: token,
        ...requireObject(operation.input, `operations[${index}].input`),
      },
    };
  });
}

function normalizeSearchOptions(value: unknown) {
  const options = optionalObject(value);
  if (!options) {
    return undefined;
  }
  const normalized = compactObject({
    match_case: options.matchCase,
    match_entire_cell: options.matchEntireCell,
    use_regex: options.useRegex,
    match_formulas: options.matchFormulas,
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function withSheetSelector(input: Record<string, unknown>, body: Record<string, unknown>) {
  return withReference(sheetReferenceFromInput(input), body);
}

function withReference(reference: SheetReference, body: Record<string, unknown>) {
  return {
    ...body,
    ...(reference.id ? { sheet_id: reference.id } : {}),
    ...(reference.name ? { sheet_name: reference.name } : {}),
  };
}

function parseCellReference(value: string) {
  let column = 0;
  let columnLength = 0;
  while (columnLength < value.length) {
    const code = value.charCodeAt(columnLength);
    if (code < 65 || code > 90) {
      break;
    }
    column = column * 26 + code - 64;
    columnLength += 1;
  }
  const row = Number(value.slice(columnLength));
  if (columnLength === 0 || !Number.isInteger(row) || row <= 0) {
    throw new ProviderRequestError(400, `startCell must be an uppercase A1 cell reference: ${value}`);
  }
  return { column: column - 1, row };
}

function columnIndexToLetters(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function cellNumberFormat(cell: Record<string, unknown> | undefined) {
  return optionalString(optionalObject(cell?.cell_styles)?.number_format) ?? "";
}

function isDateFormat(value: string) {
  return value.toLowerCase().includes("yy");
}

function stringifyCellValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  } else if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  } else if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  } else if (value == null) {
    return "";
  } else {
    return JSON.stringify(value);
  }
}

function segment(value: string) {
  return encodeURIComponent(value);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireStringArray(value: unknown, fieldName: string) {
  const items = requireArray(value, fieldName);
  if (items.every((item) => typeof item === "string" && item.length > 0)) {
    return items as string[];
  }
  throw new ProviderRequestError(400, `${fieldName} must contain non-empty strings`);
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an array`);
}

function requireStringRecord(value: unknown, fieldName: string) {
  const record = requireObject(value, fieldName);
  for (const item of Object.values(record)) {
    if (typeof item !== "string") {
      throw new ProviderRequestError(400, `${fieldName} values must be strings`);
    }
  }
  return record as Record<string, string>;
}

function optionalStringRecord(value: unknown, fieldName: string) {
  return value === undefined ? undefined : requireStringRecord(value, fieldName);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalObject(value);
  if (object) {
    return object;
  }
  throw invalidResponse(`${label} must be an object`);
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalPositiveNumber(value: unknown) {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function optionalNonNegativeNumber(value: unknown) {
  return typeof value === "number" && value >= 0 ? value : undefined;
}

function invalidResponse(message: string) {
  return new ProviderRequestError(502, `Invalid Feishu Sheets response: ${message}`);
}
