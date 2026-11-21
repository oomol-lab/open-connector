import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const eventKeys = [
  "contact.add",
  "contact.edit",
  "contact.delete",
  "company.add",
  "company.edit",
  "company.delete",
  "opportunity.add",
  "opportunity.edit",
  "opportunity.delete",
  "order.add",
  "order.edit",
  "invoice.add",
  "invoice.payment.add",
  "task.add",
  "task.edit",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "keap.on_event",
  provider: "keap",
  name: "on_event",
  displayName: "CRM Event",
  description: "Triggers when selected Keap REST hook events occur.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: true },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "eventKey",
      jsonSchema: { type: "string", enum: eventKeys, title: "Event" },
      nullable: false,
      value: "contact.add",
    },
  ],
  outputs: [
    { handle: "eventKey", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
