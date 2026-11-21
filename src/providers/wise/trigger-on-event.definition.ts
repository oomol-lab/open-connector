import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const triggerEvents = [
  "transfers#state-change",
  "transfers#active-cases",
  "balances#credit",
  "balances#update",
  "swift-in#credit",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "wise.on_event",
  provider: "wise",
  name: "on_event",
  displayName: "Transfer or Balance Event",
  description: "Triggers when selected Wise webhook subscription events occur for a profile.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    { handle: "profileId", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    {
      handle: "triggerOn",
      jsonSchema: { type: "string", enum: triggerEvents, title: "Event" },
      nullable: false,
      value: "transfers#state-change",
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
