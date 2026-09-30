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
      jsonSchema: s.string({ pattern: "^[A-Za-z]{1,3}(?::[A-Za-z]{1,3})?$" }),
      nullable: false,
      value: "A:ZZZ",
    },
    {
      handle: "dateTimeRender",
      jsonSchema: s.stringEnum(["FORMATTED_STRING", "SERIAL_NUMBER"]),
      nullable: false,
      value: "FORMATTED_STRING",
    },
    {
      handle: "firstDataRow",
      jsonSchema: s.integer({ minimum: 1 }),
      nullable: false,
      value: 2,
    },
    { handle: "headerRow", jsonSchema: s.integer({ minimum: 1 }), nullable: false, value: 1 },
    {
      handle: "maxRowsPerPoll",
      jsonSchema: s.integer({ maximum: 500, minimum: 1 }),
      nullable: false,
      value: 100,
    },
    { handle: "sheet", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    { handle: "spreadsheetId", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    {
      handle: "valueRender",
      jsonSchema: s.stringEnum(["UNFORMATTED_VALUE", "FORMATTED_VALUE", "FORMULA"]),
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
