import type { ActionDefinition, ActionOperationType, JsonSchema } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
interface ObjectFamily {
  readonly singular: string;
  readonly plural: string;
}
const objectFamilies: readonly ObjectFamily[] = [
  { singular: "chart", plural: "charts" },
  { singular: "pivot_table", plural: "pivot_tables" },
  { singular: "conditional_format", plural: "conditional_formats" },
  { singular: "filter", plural: "filters" },
  { singular: "filter_view", plural: "filter_views" },
  { singular: "sparkline", plural: "sparklines" },
  { singular: "float_image", plural: "float_images" },
];
const spreadsheetToken = s.nonEmptyString("The spreadsheet token.");
const sheetId = s.nonEmptyString("The sub-sheet ID.");
const sheetName = s.nonEmptyString("The sub-sheet name.");
const range = s.nonEmptyString("An A1 range without a sheet prefix.");
const raw = s.looseObject("The decoded Sheet AI result.");
const resultOutput = s.object(
  "The Sheets advanced operation result.",
  { result: raw },
  {
    optional: [],
  },
);
const selectorProperties = {
  sheetId: sheetId,
  sheetName: sheetName,
};
function sheetInput(description: string, properties: Record<string, JsonSchema> = {}) {
  const schema = s.object(
    description,
    {
      spreadsheetToken,
      ...selectorProperties,
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
export function createFeishuSheetsAdvancedActions(service: string): readonly ActionDefinition[] {
  const actions: ActionDefinition[] = [];
  const add = (name: string, description: string, write: boolean, inputSchema: Record<string, unknown>) => {
    actions.push(
      defineProviderAction(service, {
        name,
        operationType: sheetOperationType(name, write),
        description,
        requiredScopes: [write ? "sheets:spreadsheet:write_only" : "sheets:spreadsheet:read"],
        providerPermissions: [write ? "sheets:spreadsheet:write_only" : "sheets:spreadsheet:read"],
        inputSchema,
        outputSchema: resultOutput,
      }),
    );
  };
  add(
    "insert_sheet_dimension",
    "Insert blank rows or columns into a sub-sheet.",
    true,
    sheetInput("Identify the insertion point.", {
      position: s.nonEmptyString("A row number or column letter."),
      count: s.positiveInteger("The number of rows or columns to insert."),
      inheritStyle: s.stringEnum("The adjacent style to inherit.", ["before", "after"]),
    }),
  );
  for (const operation of ["delete", "hide", "unhide", "group", "ungroup"]) {
    add(
      `${operation}_sheet_dimension`,
      `${operation[0]!.toUpperCase()}${operation.slice(1)} rows or columns in a sub-sheet.`,
      true,
      sheetInput("Identify the dimension range.", {
        range: s.nonEmptyString("A row range such as 3:7 or column range such as C:F."),
        groupState: s.stringEnum("The initial group state.", ["expand", "collapse"]),
      }),
    );
  }
  add(
    "freeze_sheet_dimension",
    "Freeze or unfreeze the leading rows or columns.",
    true,
    sheetInput("Configure the frozen dimension.", {
      dimension: s.stringEnum("The dimension to freeze.", ["row", "column"]),
      count: s.nonNegativeInteger("The frozen count; zero unfreezes."),
    }),
  );
  add(
    "move_sheet_dimension",
    "Move a contiguous row or column range to a new position.",
    true,
    s.object(
      "Identify the native v3 dimension move.",
      {
        spreadsheetToken,
        sheetId,
        sourceRange: s.nonEmptyString("A row range such as 3:7 or column range such as C:F."),
        target: s.nonEmptyString("The destination row number or column letter."),
      },
      {
        optional: [],
      },
    ),
  );
  for (const operation of ["merge", "unmerge"]) {
    add(
      `${operation}_sheet_range`,
      `${operation[0]!.toUpperCase()}${operation.slice(1)} cells in a range.`,
      true,
      sheetInput("Identify the cell range.", {
        range,
        mergeType: s.stringEnum("How cells are merged.", ["all", "rows", "columns"]),
      }),
    );
  }
  add(
    "resize_sheet_range",
    "Resize rows or columns using pixels, standard size, or row auto-fit.",
    true,
    sheetInput("Configure row heights or column widths.", {
      dimension: s.stringEnum("The dimension to resize.", ["row", "column"]),
      range: s.nonEmptyString("A row range or column range."),
      type: s.stringEnum("The resize mode.", ["pixel", "standard", "auto"]),
      pixels: s.positiveInteger("The pixel size for pixel mode."),
    }),
  );
  for (const operation of ["move", "copy"]) {
    add(
      `${operation}_sheet_range`,
      `${operation[0]!.toUpperCase()}${operation.slice(1)} a cell range.`,
      true,
      sheetInput("Identify source and destination ranges.", {
        sourceRange: range,
        targetRange: s.nonEmptyString("The destination A1 range."),
        targetSheetId: sheetId,
        pasteType: s.stringEnum("What to copy.", ["all", "values", "formulas", "formats"]),
      }),
    );
  }
  add(
    "fill_sheet_range",
    "Fill a destination range from a source pattern.",
    true,
    sheetInput("Identify the source pattern and destination.", {
      sourceRange: range,
      targetRange: s.nonEmptyString("The destination A1 range."),
      seriesType: s.stringEnum("The fill behavior.", ["copy", "auto", "linear", "growth", "date"]),
    }),
  );
  add(
    "sort_sheet_range",
    "Sort a cell range by one or more columns.",
    true,
    sheetInput("Configure the range sort.", {
      range,
      sortConditions: s.array("The ordered sort conditions.", s.looseObject("One column and direction condition."), {
        minItems: 1,
      }),
      hasHeader: s.boolean("Whether the first row is a header."),
    }),
  );
  add(
    "verify_sheet_formulas",
    "Scan formulas for errors across selected sheets or ranges.",
    false,
    s.object(
      "Configure the workbook formula scan.",
      {
        spreadsheetToken,
        sheetIds: s.array("Sub-sheet IDs to scan.", sheetId, { minItems: 1 }),
        sheetNames: s.array("Sub-sheet names to scan.", sheetName, { minItems: 1 }),
        ranges: s.array("A1 ranges to scan.", range, { minItems: 1 }),
        maxLocations: s.positiveInteger("The maximum locations reported per error."),
      },
      {
        optional: ["sheetIds", "sheetNames", "ranges", "maxLocations"],
      },
    ),
  );
  add(
    "get_sheet_dropdown",
    "Read dropdown validation metadata for a range.",
    false,
    sheetInput("Identify the dropdown range.", { range }),
  );
  add(
    "set_sheet_dropdown",
    "Set dropdown validation across every cell in a range.",
    true,
    sheetInput("Configure the dropdown.", {
      range,
      options: s.array("The inline dropdown options.", s.string("An option."), {
        minItems: 1,
      }),
      sourceRange: s.nonEmptyString("A sheet-prefixed source range for dynamic options."),
      colors: s.array("Option highlight colors.", s.nonEmptyString("A hex color.")),
      multiple: s.boolean("Whether multiple values are allowed."),
      highlight: s.boolean("Whether option colors are highlighted."),
    }),
  );
  add(
    "update_sheet_dropdowns",
    "Apply one dropdown configuration to multiple sheet-prefixed ranges.",
    true,
    s.object(
      "Configure a batch dropdown update.",
      {
        spreadsheetToken,
        ranges: s.array("Sheet-prefixed destination ranges.", s.nonEmptyString("A sheet-prefixed range."), {
          minItems: 1,
          maxItems: 100,
        }),
        validation: s.looseObject("The complete data_validation object."),
      },
      {
        optional: [],
      },
    ),
  );
  add(
    "delete_sheet_dropdowns",
    "Remove dropdown validation from multiple sheet-prefixed ranges.",
    true,
    s.object(
      "Identify dropdown ranges to clear.",
      {
        spreadsheetToken,
        ranges: s.array("Sheet-prefixed destination ranges.", s.nonEmptyString("A sheet-prefixed range."), {
          minItems: 1,
          maxItems: 100,
        }),
      },
      {
        optional: [],
      },
    ),
  );
  for (const family of objectFamilies) {
    add(
      `list_sheet_${family.plural}`,
      `List ${family.plural.replaceAll("_", " ")} on a sub-sheet.`,
      false,
      sheetInput(
        `Filter ${family.plural.replaceAll("_", " ")}.`,
        family.singular === "filter" ? {} : { objectId: s.nonEmptyString("An optional object ID filter.") },
      ),
    );
    add(
      `create_sheet_${family.singular}`,
      `Create a ${family.singular.replaceAll("_", " ")} object.`,
      true,
      family.singular === "pivot_table"
        ? s.object(
            "Provide pivot properties and an optional placement sheet.",
            {
              spreadsheetToken,
              ...selectorProperties,
              properties: s.looseObject("The pivot properties, including source and optional target range."),
            },
            {
              optional: ["sheetId", "sheetName"],
            },
          )
        : sheetInput("Provide the complete object properties.", {
            properties: s.looseObject("The object properties accepted by Sheet AI."),
          }),
    );
    add(
      `update_sheet_${family.singular}`,
      `Update a ${family.singular.replaceAll("_", " ")} object.`,
      true,
      sheetInput("Identify the object and provide replacement properties.", {
        objectId:
          family.singular === "filter"
            ? s.nonEmptyString("The object ID; sheet filters use sheetId.")
            : s.nonEmptyString("The object ID."),
        properties: s.looseObject("The object properties accepted by Sheet AI."),
      }),
    );
    add(
      `delete_sheet_${family.singular}`,
      `Delete a ${family.singular.replaceAll("_", " ")} object.`,
      true,
      sheetInput("Identify the object to delete.", {
        objectId:
          family.singular === "filter"
            ? s.nonEmptyString("The object ID; sheet filters use sheetId.")
            : s.nonEmptyString("The object ID."),
      }),
    );
  }
  add(
    "list_sheet_history",
    "List spreadsheet edit history versions.",
    false,
    s.object(
      "Page backward through workbook history.",
      {
        spreadsheetToken,
        endVersion: s.positiveInteger("The maximum version for the next page."),
      },
      {
        optional: ["endVersion"],
      },
    ),
  );
  add(
    "revert_sheet_history",
    "Start an asynchronous revert to a spreadsheet history version.",
    true,
    s.object(
      "Identify the history version.",
      {
        spreadsheetToken,
        historyVersionId: s.nonEmptyString("The history version ID."),
      },
      {
        optional: [],
      },
    ),
  );
  add(
    "get_sheet_history_revert_status",
    "Poll the status of a spreadsheet history revert.",
    false,
    s.object(
      "Identify the revert transaction.",
      {
        spreadsheetToken,
        transactionId: s.nonEmptyString("The revert transaction ID."),
      },
      {
        optional: [],
      },
    ),
  );
  return actions;
}

function sheetOperationType(name: string, write: boolean): ActionOperationType {
  if (!write) return "read";
  if (/^(?:insert|unhide|group|merge|resize|copy|create)_/u.test(name)) return "write";
  return "destructive";
}
