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
      jsonSchema: {
        type: "string",
        minLength: 1,
        maxLength: 1024,
      },
      nullable: false,
    },
    {
      handle: "changes",
      jsonSchema: {
        type: "array",
        items: {
          type: "string",
          enum: ["created", "updated", "cancelled"],
        },
        minItems: 1,
        uniqueItems: true,
      },
      nullable: false,
      value: ["created", "updated", "cancelled"],
    },
    {
      handle: "matchTerm",
      jsonSchema: {
        type: "string",
      },
      nullable: false,
      value: "",
    },
    {
      group: "Advanced settings",
      collapsed: true,
    },
    {
      handle: "maxEventsPerPoll",
      jsonSchema: {
        type: "integer",
        minimum: 1,
        maximum: 500,
      },
      nullable: false,
      value: 100,
    },
  ],
  definitionVersion: 3,
  description: "Polls a Google Calendar and triggers when an event is created, updated or cancelled.",
  displayName: "Event Changed",
  key: "googlecalendar.on_event_changed",
  name: "on_event_changed",
  outputs: [{ handle: "event", jsonSchema: eventSchema, nullable: false }],
  provider: "googlecalendar",
  type: "poll",
};
