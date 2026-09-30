import type { JsonSchema } from "../../core/types.ts";
import type { TriggerKeySnapshot } from "../../triggers/common/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
const changes: readonly string[] = ["created", "updated", "cancelled"] as const;
const eventSchema: JsonSchema = s.object(
  {
    attendeeEmails: s.array(s.string()),
    calendarId: s.string(),
    changeType: s.stringEnum(changes),
    created: { type: ["string", "null"] },
    creatorEmail: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    end: { type: ["object", "null"] },
    eventId: s.string(),
    eventType: { type: ["string", "null"] },
    htmlLink: { type: ["string", "null"] },
    isAllDay: s.boolean(),
    location: { type: ["string", "null"] },
    organizerEmail: { type: ["string", "null"] },
    recurringEventId: { type: ["string", "null"] },
    start: { type: ["object", "null"] },
    status: s.string(),
    summary: { type: ["string", "null"] },
    updated: { type: ["string", "null"] },
  },
  {
    additionalProperties: false,
    required: [
      "changeType",
      "calendarId",
      "eventId",
      "status",
      "summary",
      "description",
      "location",
      "htmlLink",
      "start",
      "end",
      "isAllDay",
      "organizerEmail",
      "creatorEmail",
      "attendeeEmails",
      "recurringEventId",
      "eventType",
      "created",
      "updated",
    ],
  },
);
export const snapshot: TriggerKeySnapshot & { readonly type: "poll" } = {
  configInputs: [
    {
      handle: "calendarId",
      jsonSchema: s.string({ maxLength: 1024, minLength: 1 }),
      nullable: false,
    },
    {
      handle: "changes",
      jsonSchema: s.array(s.stringEnum(changes), { minItems: 1, uniqueItems: true }),
      nullable: false,
      value: changes,
    },
    { handle: "matchTerm", jsonSchema: s.string(), nullable: false, value: "" },
    {
      handle: "maxEventsPerPoll",
      jsonSchema: s.integer({ maximum: 500, minimum: 1 }),
      nullable: false,
      value: 100,
    },
  ],
  definitionVersion: 2,
  description: "Polls a Google Calendar and triggers when an event is created, updated or cancelled.",
  displayName: "Event Changed",
  key: "googlecalendar.on_event_changed",
  name: "on_event_changed",
  outputs: [{ handle: "events", jsonSchema: s.array(eventSchema), nullable: false }],
  provider: "googlecalendar",
  type: "poll",
};
