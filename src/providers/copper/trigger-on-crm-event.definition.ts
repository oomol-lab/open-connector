import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const resourceTypes = ["lead", "person", "company", "opportunity", "task", "project"] as const;
const events = ["new", "update", "delete"] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "copper.on_crm_event",
  provider: "copper",
  name: "on_crm_event",
  displayName: "CRM Record Event",
  description: "Triggers when selected Copper CRM records are created, updated, or deleted.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "resourceType",
      jsonSchema: { type: "string", enum: resourceTypes, title: "Resource Type" },
      nullable: false,
      value: "opportunity",
    },
    {
      handle: "event",
      jsonSchema: { type: "string", enum: events, title: "Event" },
      nullable: false,
      value: "new",
    },
  ],
  outputs: [
    { handle: "resourceType", jsonSchema: s.string(), nullable: false },
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
