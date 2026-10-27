import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const eventSchema: JsonSchema = s.object(
  {
    row: { type: "object" },
    rowNumber: s.integer(),
    sheetId: s.integer(),
    sheetTitle: s.string(),
    spreadsheetId: s.string(),
    values: s.array({}),
  },
  { additionalProperties: false, required: ["spreadsheetId", "sheetId", "sheetTitle", "rowNumber", "row", "values"] },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "columnRange",
      jsonSchema: {
        type: "string",
        pattern: "^[A-Za-z]{1,3}(?::[A-Za-z]{1,3})?$",
      },
      nullable: false,
      value: "A:ZZZ",
    },
    {
      handle: "sheet",
      jsonSchema: {
        type: "string",
        minLength: 1,
      },
      nullable: false,
    },
    {
      handle: "spreadsheetId",
      jsonSchema: {
        type: "string",
        minLength: 1,
      },
      nullable: false,
    },
    {
      group: "Advanced settings",
      collapsed: true,
    },
    {
      handle: "dateTimeRender",
      jsonSchema: {
        type: "string",
        enum: ["FORMATTED_STRING", "SERIAL_NUMBER"],
      },
      nullable: false,
      value: "FORMATTED_STRING",
    },
    {
      handle: "firstDataRow",
      jsonSchema: {
        type: "integer",
        minimum: 1,
      },
      nullable: false,
      value: 2,
    },
    {
      handle: "headerRow",
      jsonSchema: {
        type: "integer",
        minimum: 1,
      },
      nullable: false,
      value: 1,
    },
    {
      handle: "maxRowsPerPoll",
      jsonSchema: {
        type: "integer",
        minimum: 1,
        maximum: 500,
      },
      nullable: false,
      value: 100,
    },
    {
      handle: "valueRender",
      jsonSchema: {
        type: "string",
        enum: ["UNFORMATTED_VALUE", "FORMATTED_VALUE", "FORMULA"],
      },
      nullable: false,
      value: "UNFORMATTED_VALUE",
    },
  ],
  definitionVersion: 2,
  description: "Polls a sheet and triggers once for every new row appended below the last row already seen.",
  displayName: "New Row Added",
  key: "googlesheets.on_row_added",
  name: "on_row_added",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "googlesheets",
  type: "poll",
};
