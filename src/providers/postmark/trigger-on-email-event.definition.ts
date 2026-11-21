import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const events = ["Bounce", "Delivery", "Open", "Click", "SpamComplaint", "SubscriptionChange"] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "postmark.on_email_event",
  provider: "postmark",
  name: "on_email_event",
  displayName: "Email Event",
  description: "Triggers when selected Postmark email delivery or engagement events occur.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    { handle: "messageStream", jsonSchema: s.string({ minLength: 1 }), nullable: false, value: "outbound" },
    {
      handle: "events",
      jsonSchema: s.array(s.stringEnum(events), { minItems: 1, uniqueItems: true }),
      nullable: false,
    },
  ],
  outputs: [
    { handle: "recordType", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "messageId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
