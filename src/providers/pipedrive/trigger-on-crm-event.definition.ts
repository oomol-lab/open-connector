import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const events = ["deal.created", "deal.stage_changed", "deal.status_changed", "person.created"] as const;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "pipedrive.on_crm_event",
  provider: "pipedrive",
  name: "on_crm_event",
  displayName: "Deal or Contact Event",
  description:
    "Receives new deals or contacts, or actual changes to a deal stage or status using Pipedrive Webhooks v2.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "eventType",
      jsonSchema: { type: "string", enum: events, title: "Event" },
      nullable: false,
      value: "deal.created",
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string", enum: events }, nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "objectId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
