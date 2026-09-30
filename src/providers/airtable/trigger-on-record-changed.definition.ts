import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const eventSchema: JsonSchema = s.object(
  {
    baseId: s.string(),
    createdTime: s.string(),
    fields: { type: "object" },
    recordId: s.string(),
    tableIdOrName: s.string(),
    triggerField: s.string(),
    triggerFieldValue: s.string(),
  },
  {
    additionalProperties: false,
    required: ["baseId", "tableIdOrName", "recordId", "createdTime", "triggerField", "triggerFieldValue", "fields"],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "baseId",
      jsonSchema: s.string({ pattern: "^app[A-Za-z0-9]{14}$" }),
      nullable: false,
    },
    {
      handle: "fields",
      jsonSchema: s.array(s.string({ minLength: 1 })),
      nullable: false,
      value: [],
    },
    { handle: "formula", jsonSchema: s.string(), nullable: false, value: "" },
    {
      handle: "maxRecordsPerPoll",
      jsonSchema: s.integer({ maximum: 1_000, minimum: 1 }),
      nullable: false,
      value: 200,
    },
    {
      handle: "tableIdOrName",
      jsonSchema: s.string({ maxLength: 255, minLength: 1 }),
      nullable: false,
    },
    {
      handle: "triggerField",
      jsonSchema: s.string({ maxLength: 255, minLength: 1, pattern: "^[^}]*$" }),
      nullable: false,
    },
    { handle: "view", jsonSchema: s.string(), nullable: false, value: "" },
  ],
  definitionVersion: 2,
  description: "Polls an Airtable table and triggers when a record is created or updated, ordered by a time field.",
  displayName: "Record Created or Updated",
  key: "airtable.on_record_changed",
  name: "on_record_changed",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "airtable",
  type: "poll",
};
