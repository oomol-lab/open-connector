import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";

const eventTypes = [
  "customer_created",
  "customer_changed",
  "customer_deleted",
  "subscription_created",
  "subscription_started",
  "subscription_activated",
  "subscription_changed",
  "subscription_cancelled",
  "subscription_reactivated",
  "subscription_renewed",
  "invoice_generated",
  "invoice_updated",
  "payment_succeeded",
  "payment_failed",
  "payment_refunded",
] as const;

export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  key: "chargebee.on_event",
  provider: "chargebee",
  name: "on_event",
  displayName: "Billing Event",
  description: "Polls Chargebee events for customer, subscription, invoice, and payment changes.",
  definitionVersion: 2,
  type: "poll",
  configInputs: [
    {
      handle: "eventTypes",
      jsonSchema: s.array(s.stringEnum(eventTypes), { uniqueItems: true }),
      nullable: true,
    },
  ],
  outputs: [
    { handle: "eventType", jsonSchema: s.string(), nullable: false },
    { handle: "eventId", jsonSchema: s.string(), nullable: false },
    { handle: "occurredAt", jsonSchema: s.integer(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
