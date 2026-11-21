import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const events = [
  "convo.assigned",
  "convo.created",
  "convo.deleted",
  "convo.merged",
  "convo.moved",
  "convo.status",
  "convo.tags",
  "convo.customer.reply.created",
  "convo.agent.reply.created",
  "convo.note.created",
  "customer.created",
  "customer.updated",
  "satisfaction.ratings",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "helpscout.on_conversation_event",
  provider: "helpscout",
  name: "on_conversation_event",
  displayName: "Conversation Event",
  description: "Triggers when selected Help Scout conversation or customer webhook events occur.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "events",
      jsonSchema: s.array(s.stringEnum(events), { minItems: 1, uniqueItems: true }),
      nullable: false,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
