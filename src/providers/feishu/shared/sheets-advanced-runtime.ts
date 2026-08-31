import type { FeishuJsonRequest } from "./client.ts";

import { compactObject } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuSheetsAdvancedActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface ObjectFamily {
  readonly plural: string;
  readonly singular: string;
  readonly listTool: string;
  readonly manageTool: string;
  readonly idField?: string;
}

const objectFamilies: readonly ObjectFamily[] = [
  {
    singular: "chart",
    plural: "charts",
    listTool: "get_chart_objects",
    manageTool: "manage_chart_object",
    idField: "chart_id",
  },
  {
    singular: "pivot_table",
    plural: "pivot_tables",
    listTool: "get_pivot_table_objects",
    manageTool: "manage_pivot_table_object",
    idField: "pivot_table_id",
  },
  {
    singular: "conditional_format",
    plural: "conditional_formats",
    listTool: "get_conditional_format_objects",
    manageTool: "manage_conditional_format_object",
    idField: "conditional_format_id",
  },
  {
    singular: "filter",
    plural: "filters",
    listTool: "get_filter_objects",
    manageTool: "manage_filter_object",
    idField: "filter_id",
  },
  {
    singular: "filter_view",
    plural: "filter_views",
    listTool: "get_filter_view_objects",
    manageTool: "manage_filter_view_object",
    idField: "view_id",
  },
  {
    singular: "sparkline",
    plural: "sparklines",
    listTool: "get_sparkline_objects",
    manageTool: "manage_sparkline_object",
    idField: "group_id",
  },
  {
    singular: "float_image",
    plural: "float_images",
    listTool: "get_float_image_objects",
    manageTool: "manage_float_image_object",
    idField: "float_image_id",
  },
];
const maxDropdownCells = 100_000;

export function createFeishuSheetsAdvancedActionHandlers(
  request: FeishuJsonRequest,
): Readonly<Record<string, FeishuSheetsAdvancedActionHandler>> {
  const handlers: Record<string, FeishuSheetsAdvancedActionHandler> = {
    insert_sheet_dimension: (input) =>
      toolResult(request, input, "write", "modify_sheet_structure", {
        operation: "insert",
        position: input.position,
        count: input.count,
        side: input.inheritStyle,
      }),
    freeze_sheet_dimension: (input) => {
      const count = number(input.count, "count");
      const dimension = string(input.dimension, "dimension");
      return toolResult(request, input, "write", "modify_sheet_structure", {
        operation: count === 0 ? "unfreeze" : "freeze",
        freeze_rows: count > 0 && dimension === "row" ? count : undefined,
        freeze_columns: count > 0 && dimension === "column" ? count : undefined,
      });
    },
    move_sheet_dimension: async (input) => {
      const source = parseDimensionRange(string(input.sourceRange, "sourceRange"));
      const target = parseDimensionPosition(string(input.target, "target"));
      if (source.dimension !== target.dimension) {
        throw new ProviderRequestError(400, "sourceRange and target must use the same dimension");
      }
      const result = await request({
        method: "POST",
        path: `/sheets/v3/spreadsheets/${segment(
          string(input.spreadsheetToken, "spreadsheetToken"),
        )}/sheets/${segment(string(input.sheetId, "sheetId"))}/move_dimension`,
        body: {
          source: {
            major_dimension: source.dimension === "row" ? "ROWS" : "COLUMNS",
            start_index: source.start,
            end_index: source.end,
          },
          destination_index: target.index,
        },
      });
      return { result };
    },
    merge_sheet_range: (input) =>
      toolResult(request, input, "write", "merge_cells", {
        operation: "merge",
        range: input.range,
        merge_type: input.mergeType ?? "all",
      }),
    unmerge_sheet_range: (input) =>
      toolResult(request, input, "write", "merge_cells", {
        operation: "unmerge",
        range: input.range,
      }),
    resize_sheet_range: (input) => {
      const dimension = string(input.dimension, "dimension");
      const type = string(input.type, "type");
      if (type === "pixel" && typeof input.pixels !== "number") {
        throw new ProviderRequestError(400, "pixels is required for pixel resize");
      }
      const size = compactObject({ type, value: input.pixels });
      return toolResult(request, input, "write", "resize_range", {
        range: normalizeDimensionRange(string(input.range, "range")),
        resize_height: dimension === "row" ? size : undefined,
        resize_width: dimension === "column" ? size : undefined,
      });
    },
    move_sheet_range: (input) => transformRange(request, input, "move"),
    copy_sheet_range: (input) => transformRange(request, input, "copy"),
    fill_sheet_range: (input) =>
      toolResult(request, input, "write", "transform_range", {
        operation: "fill",
        range: input.sourceRange,
        destination_range: input.targetRange,
        fill_type: input.seriesType === "copy" ? "copyCells" : "fillSeries",
      }),
    sort_sheet_range: (input) =>
      toolResult(request, input, "write", "transform_range", {
        operation: "sort",
        range: input.range,
        sort_conditions: input.sortConditions,
        has_header: input.hasHeader === true ? true : undefined,
      }),
    verify_sheet_formulas: (input) =>
      toolResult(
        request,
        input,
        "read",
        "verify_formula",
        {
          sheet_ids: input.sheetIds,
          sheet_names: input.sheetIds === undefined ? input.sheetNames : undefined,
          ranges: input.ranges,
          max_locations_per_error: input.maxLocations,
        },
        false,
      ),
    get_sheet_dropdown: (input) =>
      toolResult(request, input, "read", "get_cell_ranges", {
        ranges: [input.range],
        include_styles: false,
        value_render_option: "formatted_value",
      }),
    set_sheet_dropdown: (input) => setDropdown(request, input, buildDropdownValidation(input)),
    update_sheet_dropdowns: (input) => batchDropdown(request, input, requireObject(input.validation, "validation")),
    delete_sheet_dropdowns: (input) => batchDropdown(request, input, null),
    list_sheet_history: (input) =>
      toolResult(
        request,
        input,
        "read",
        "history_list",
        {
          end_version: input.endVersion,
        },
        false,
      ),
    revert_sheet_history: (input) =>
      toolResult(
        request,
        input,
        "write",
        "history_revert",
        {
          history_version_id: input.historyVersionId,
        },
        false,
      ),
    get_sheet_history_revert_status: (input) =>
      toolResult(
        request,
        input,
        "read",
        "history_revert_status",
        {
          transaction_id: input.transactionId,
        },
        false,
      ),
  };
  for (const operation of ["delete", "hide", "unhide", "group", "ungroup"]) {
    handlers[`${operation}_sheet_dimension`] = (input) =>
      toolResult(request, input, "write", "modify_sheet_structure", {
        operation,
        range: input.range,
        group_state: operation === "group" ? input.groupState : undefined,
      });
  }
  for (const family of objectFamilies) {
    handlers[`list_sheet_${family.plural}`] = (input) =>
      toolResult(
        request,
        input,
        "read",
        family.listTool,
        family.singular === "filter" ? {} : { [family.idField ?? "object_id"]: input.objectId },
      );
    handlers[`create_sheet_${family.singular}`] = (input) => manageObject(request, input, family, "create");
    handlers[`update_sheet_${family.singular}`] = (input) => manageObject(request, input, family, "update");
    handlers[`delete_sheet_${family.singular}`] = (input) => manageObject(request, input, family, "delete");
  }
  return handlers;
}

function transformRange(request: FeishuJsonRequest, input: Record<string, unknown>, operation: "move" | "copy") {
  const pasteTypes: Readonly<Record<string, string>> = {
    all: "all",
    values: "value_only",
    formulas: "formula_only",
    formats: "format_only",
  };
  return toolResult(request, input, "write", "transform_range", {
    operation,
    range: input.sourceRange,
    destination_range: input.targetRange,
    destination_sheet_id: input.targetSheetId,
    paste_type: operation === "copy" && typeof input.pasteType === "string" ? pasteTypes[input.pasteType] : undefined,
  });
}

function manageObject(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
  family: ObjectFamily,
  operation: "create" | "update" | "delete",
) {
  const objectId = family.singular === "filter" ? input.sheetId : input.objectId;
  return toolResult(
    request,
    input,
    "write",
    family.manageTool,
    {
      operation,
      properties: operation === "delete" ? undefined : requireObject(input.properties, "properties"),
      [family.idField ?? "object_id"]: operation === "create" ? undefined : objectId,
    },
    input.sheetId !== undefined || input.sheetName !== undefined,
  );
}

async function setDropdown(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
  validation: Record<string, unknown>,
) {
  const dimensions = parseCellRange(string(input.range, "range"));
  assertDropdownCellBudget(dimensions.rows * dimensions.columns);
  const cells = Array.from({ length: dimensions.rows }, () =>
    Array.from({ length: dimensions.columns }, () => ({
      data_validation: validation,
    })),
  );
  return toolResult(request, input, "write", "set_cell_range", {
    range: input.range,
    cells,
  });
}

async function batchDropdown(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
  validation: Record<string, unknown> | null,
) {
  const token = string(input.spreadsheetToken, "spreadsheetToken");
  const ranges = stringArray(input.ranges, "ranges");
  let totalCells = 0;
  const operations = ranges.map((value) => {
    const split = value.lastIndexOf("!");
    if (split <= 0 || split === value.length - 1) {
      throw new ProviderRequestError(400, "dropdown batch ranges must include a sheet prefix");
    }
    const sheetName = value.slice(0, split).replaceAll("'", "");
    const cellRange = value.slice(split + 1);
    const dimensions = parseCellRange(cellRange);
    totalCells += dimensions.rows * dimensions.columns;
    assertDropdownCellBudget(totalCells);
    return {
      tool_name: "set_cell_range",
      input: {
        excel_id: token,
        sheet_name: sheetName,
        range: cellRange,
        cells: Array.from({ length: dimensions.rows }, () =>
          Array.from({ length: dimensions.columns }, () => ({
            data_validation: validation,
          })),
        ),
      },
    };
  });
  return invokeTool(request, token, "write", "batch_update", {
    excel_id: token,
    operations,
  });
}

function buildDropdownValidation(input: Record<string, unknown>) {
  const options = Array.isArray(input.options) ? input.options : undefined;
  const sourceRange = typeof input.sourceRange === "string" ? input.sourceRange : undefined;
  if ((options === undefined) === (sourceRange === undefined)) {
    throw new ProviderRequestError(400, "provide exactly one of options or sourceRange");
  }
  return compactObject({
    type: options ? "list" : "listFromRange",
    items: options,
    range: sourceRange,
    highlight_colors: input.colors,
    support_multiple_values: input.multiple === true ? true : undefined,
    enable_highlight: typeof input.highlight === "boolean" ? input.highlight : undefined,
  });
}

function assertDropdownCellBudget(cells: number) {
  if (cells > maxDropdownCells) {
    throw new ProviderRequestError(400, `dropdown ranges expand to more than ${maxDropdownCells} cells`);
  }
}

async function toolResult(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
  kind: "read" | "write",
  toolName: string,
  toolInput: Record<string, unknown>,
  withSelector = true,
) {
  const token = string(input.spreadsheetToken, "spreadsheetToken");
  return invokeTool(
    request,
    token,
    kind,
    toolName,
    compactObject({
      excel_id: token,
      ...toolInput,
      ...(withSelector ? selector(input) : {}),
    }),
  );
}

async function invokeTool(
  request: FeishuJsonRequest,
  token: string,
  kind: "read" | "write",
  toolName: string,
  input: Record<string, unknown>,
) {
  const data = await request({
    method: "POST",
    path: `/sheet_ai/v2/spreadsheets/${segment(token)}/tools/invoke_${kind}`,
    body: {
      tool_name: toolName,
      input: JSON.stringify(input),
    },
  });
  if (typeof data.output === "string") {
    try {
      const output = JSON.parse(data.output) as unknown;
      return { result: optionalObject(output) ?? { items: output } };
    } catch {
      throw new ProviderRequestError(502, `Invalid ${toolName} JSON output`);
    }
  }
  return { result: data };
}

function selector(input: Record<string, unknown>) {
  if (typeof input.sheetId === "string") {
    return { sheet_id: input.sheetId };
  }
  if (typeof input.sheetName === "string") {
    return { sheet_name: input.sheetName };
  }
  throw new ProviderRequestError(400, "provide exactly one of sheetId or sheetName");
}

function parseDimensionRange(value: string) {
  const parts = value.split(":");
  const start = parseDimensionPosition(parts[0] ?? "");
  const end = parseDimensionPosition(parts[1] ?? parts[0] ?? "");
  if (start.dimension !== end.dimension || end.index < start.index) {
    throw new ProviderRequestError(400, `invalid dimension range: ${value}`);
  }
  return { dimension: start.dimension, start: start.index, end: end.index };
}

function parseDimensionPosition(value: string) {
  let digits = value.length > 0;
  let letters = value.length > 0;
  for (const character of value) {
    digits &&= character >= "0" && character <= "9";
    letters &&= (character >= "A" && character <= "Z") || (character >= "a" && character <= "z");
  }
  if (digits && value[0] !== "0") {
    return { dimension: "row", index: Number(value) - 1 };
  }
  if (letters) {
    let index = 0;
    for (const character of value.toUpperCase()) {
      index = index * 26 + character.charCodeAt(0) - 64;
    }
    return { dimension: "column", index: index - 1 };
  }
  throw new ProviderRequestError(400, `invalid dimension position: ${value}`);
}

function normalizeDimensionRange(value: string) {
  parseDimensionRange(value);
  return value.includes(":") ? value : `${value}:${value}`;
}

function parseCellRange(value: string) {
  const parts = value.toUpperCase().split(":");
  const start = parseCell(parts[0] ?? "");
  const end = parseCell(parts[1] ?? parts[0] ?? "");
  if (end.row < start.row || end.column < start.column) {
    throw new ProviderRequestError(400, `invalid cell range: ${value}`);
  }
  return {
    rows: end.row - start.row + 1,
    columns: end.column - start.column + 1,
  };
}

function parseCell(value: string) {
  let split = 0;
  while (split < value.length && value.charCodeAt(split) >= 65 && value.charCodeAt(split) <= 90) {
    split += 1;
  }
  const columnLetters = value.slice(0, split);
  const row = Number(value.slice(split));
  if (columnLetters.length === 0 || !Number.isInteger(row) || row <= 0) {
    throw new ProviderRequestError(400, `invalid cell reference: ${value}`);
  }
  let column = 0;
  for (const character of columnLetters) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  return { row, column };
}

function requireObject(value: unknown, fieldName: string) {
  const result = optionalObject(value);
  if (result) {
    return result;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an object`);
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function string(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
}

function stringArray(value: unknown, fieldName: string) {
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)) {
    return value as string[];
  }
  throw new ProviderRequestError(400, `${fieldName} must contain non-empty strings`);
}

function number(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a number`);
}

function segment(value: string) {
  return encodeURIComponent(value);
}
