import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  configInputs: [
    {
      handle: "apiVersion",
      jsonSchema: s.string({ maxLength: 40 }),
      nullable: false,
      value: "",
    },
    {
      handle: "events",
      jsonSchema: s.array(s.string({ maxLength: 120, pattern: "^(\\*|[a-z0-9_]+(?:\\.[a-z0-9_]+)+)$" }), {
        minItems: 1,
        uniqueItems: true,
      }),
      nullable: false,
    },
    {
      handle: "includeConnectedAccounts",
      jsonSchema: s.boolean(),
      nullable: false,
      value: false,
    },
  ],
  definitionVersion: 2,
  description: "Triggers when selected Stripe events happen on the connected account.",
  displayName: "Account Event",
  endpoint: {
    body: { allowArray: false, allowEmpty: false, formats: ["json"] },
    methods: ["POST"],
    successStatus: 202,
  },
  key: "stripe.on_event",
  name: "on_event",
  outputs: [
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "eventId", jsonSchema: s.string(), nullable: false },
    { handle: "livemode", jsonSchema: s.boolean(), nullable: false },
  ],
  provider: "stripe",
  type: "integration",
};
