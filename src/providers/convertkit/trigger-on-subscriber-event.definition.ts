import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const events = [
  "subscriber.subscriber_activate",
  "subscriber.subscriber_unsubscribe",
  "subscriber.subscriber_bounce",
  "subscriber.subscriber_complain",
  "subscriber.form_subscribe",
  "subscriber.tag_add",
  "subscriber.tag_remove",
  "subscriber.purchase_create",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "convertkit.on_subscriber_event",
  provider: "convertkit",
  name: "on_subscriber_event",
  displayName: "Subscriber Event",
  description: "Triggers when selected Kit (ConvertKit) subscriber webhook events occur.",
  definitionVersion: 1,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "eventName",
      jsonSchema: { type: "string", enum: events, title: "Event" },
      nullable: false,
      value: "subscriber.subscriber_activate",
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
