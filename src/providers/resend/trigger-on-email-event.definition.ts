import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const events = ["email.received", "email.bounced", "email.complained"] as const;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "resend.on_email_event",
  provider: "resend",
  name: "on_email_event",
  displayName: "Email Received, Bounced or Complained",
  description:
    "Receives inbound email, bounce, and complaint notifications. Read message bodies and attachments with Actions.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "eventTypes",
      jsonSchema: {
        type: "array",
        items: { type: "string", enum: events },
        minItems: 1,
        uniqueItems: true,
        title: "Events",
      },
      nullable: false,
      value: events,
    },
  ],
  outputs: [
    { handle: "event", jsonSchema: { type: "string", enum: events }, nullable: false },
    { handle: "deliveryId", jsonSchema: s.string(), nullable: false },
    { handle: "emailId", jsonSchema: s.string(), nullable: false },
    { handle: "createdAt", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
