import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const topics: readonly string[] = [
  "coupon.created",
  "coupon.updated",
  "coupon.deleted",
  "coupon.restored",
  "customer.created",
  "customer.updated",
  "customer.deleted",
  "order.created",
  "order.updated",
  "order.deleted",
  "order.restored",
  "product.created",
  "product.updated",
  "product.deleted",
  "product.restored",
  "product.published",
] as const;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  configInputs: [
    {
      handle: "events",
      jsonSchema: s.array(s.stringEnum(topics), { maxItems: 16, minItems: 1, uniqueItems: true }),
      nullable: false,
    },
    {
      handle: "webhookName",
      jsonSchema: s.string({ maxLength: 120, minLength: 1 }),
      nullable: false,
      value: "OOMOL Trigger",
    },
  ],
  definitionVersion: 2,
  description: "Triggers when selected WooCommerce store events occur.",
  displayName: "Store Event",
  endpoint: {
    body: { allowArray: false, allowEmpty: false, formats: ["json"] },
    methods: ["POST"],
    successStatus: 202,
  },
  key: "woocommerce.on_store_event",
  name: "on_store_event",
  outputs: [
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "event", jsonSchema: s.string(), nullable: false },
    { handle: "resource", jsonSchema: s.string(), nullable: false },
    { handle: "source", jsonSchema: s.string(), nullable: false },
    { handle: "topic", jsonSchema: s.string(), nullable: false },
    { handle: "webhookId", jsonSchema: s.string(), nullable: false },
  ],
  provider: "woocommerce",
  type: "integration",
};
