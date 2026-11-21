import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const events = ["subscribe", "unsubscribe", "profile", "upemail", "cleaned", "campaign"] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "mailchimp.on_audience_event",
  provider: "mailchimp",
  name: "on_audience_event",
  displayName: "Audience Event",
  description: "Triggers when subscriber or campaign events occur in a Mailchimp audience.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["GET", "POST"],
    body: { formats: ["form", "json"], allowArray: false, allowEmpty: true },
    successStatus: 200,
  },
  configInputs: [
    { handle: "listId", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    {
      handle: "events",
      jsonSchema: s.array(s.stringEnum(events), { minItems: 1, uniqueItems: true }),
      nullable: false,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "listId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
