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
      jsonSchema: {
        type: "string",
        pattern: "^app[A-Za-z0-9]{14}$",
      },
      nullable: false,
    },
    {
      handle: "formula",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
    },
    {
      handle: "tableIdOrName",
      jsonSchema: {
        type: "string",
        minLength: 1,
        maxLength: 255,
      },
      nullable: false,
    },
    {
      handle: "triggerField",
      jsonSchema: {
        type: "string",
        minLength: 1,
        maxLength: 255,
        pattern: "^[^}]*$",
      },
      nullable: false,
    },
    {
      handle: "view",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
    },
    {
      group: "Advanced settings",
      collapsed: true,
    },
    {
      handle: "fields",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          minLength: 1,
        },
      },
      nullable: false,
      value: [],
    },
    {
      handle: "maxRecordsPerPoll",
      jsonSchema: {
        type: "integer",
        minimum: 1,
        maximum: 1000,
      },
      nullable: false,
      value: 200,
    },
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
