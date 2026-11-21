import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const actions = [
  "order.placed",
  "order.refunded",
  "order.updated",
  "attendee.checked_in",
  "attendee.checked_out",
  "attendee.updated",
  "event.created",
  "event.published",
  "event.unpublished",
  "event.updated",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "eventbrite.on_event",
  provider: "eventbrite",
  name: "on_event",
  displayName: "Eventbrite Webhook Event",
  description: "Triggers when selected Eventbrite order, attendee, or event webhook actions occur.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    { handle: "organizationId", jsonSchema: s.string({ minLength: 1 }), nullable: false },
    { handle: "eventId", jsonSchema: s.string({ minLength: 1 }), nullable: true },
    {
      handle: "actions",
      jsonSchema: s.array(s.stringEnum(actions), { minItems: 1, uniqueItems: true }),
      nullable: false,
    },
  ],
  outputs: [
    { handle: "action", jsonSchema: s.string(), nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "apiUrl", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
