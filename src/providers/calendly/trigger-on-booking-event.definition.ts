import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
export const events = ["invitee.created", "invitee.canceled"] as const;
export const snapshot: TriggerKeySnapshot & { readonly type: "integration" } = {
  key: "calendly.on_booking_event",
  provider: "calendly",
  name: "on_booking_event",
  displayName: "Booking Created or Canceled",
  description:
    "Receives bookings and cancellations, preserving reschedule links. Requires a Personal Access Token connection.",
  definitionVersion: 2,
  type: "integration",
  endpoint: {
    methods: ["POST"],
    body: { formats: ["json"], allowArray: false, allowEmpty: false },
    successStatus: 200,
  },
  configInputs: [
    {
      handle: "scope",
      jsonSchema: { type: "string", enum: ["user", "organization"], title: "Scope" },
      nullable: false,
      value: "user",
    },
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
    { handle: "inviteeUri", jsonSchema: s.string(), nullable: false },
    { handle: "createdAt", jsonSchema: s.string(), nullable: false },
    { handle: "body", jsonSchema: { type: "object" }, nullable: false },
  ],
};
