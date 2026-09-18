import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "one_password_events";

export type OnePasswordEventsActionName = "list_audit_events" | "list_item_usages" | "list_sign_in_attempts";

const cursorEventInputSchema: JsonSchema = s.object(
  "Input payload for reading a 1Password Events API cursor stream.",
  {
    cursor: s.nonEmptyString("Cursor from a previous 1Password Events API response."),
    startTime: s.dateTime("Start time for a reset cursor request."),
    endTime: s.dateTime("End time for a reset cursor request."),
    limit: s.positiveInteger("Maximum number of events to return, from 1 to 1000.", {
      maximum: 1000,
    }),
  },
  { optional: ["cursor", "startTime", "endTime", "limit"] },
);
cursorEventInputSchema.not = {
  anyOf: [
    { required: ["cursor", "startTime"] },
    { required: ["cursor", "endTime"] },
    { required: ["cursor", "limit"] },
  ],
};

const eventPayloadSchema = s.looseObject("One raw event object returned by 1Password.");
const eventStreamOutputSchema = s.object("A normalized 1Password Events API stream response.", {
  cursor: s.string("Cursor to continue reading the event stream."),
  hasMore: s.boolean("Whether 1Password reports more events are available for this cursor."),
  events: s.array("The event objects returned by 1Password.", eventPayloadSchema),
  raw: s.looseObject("The raw 1Password Events API response object."),
});

export const onePasswordEventsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_audit_events",
    operationType: "read",
    description: "List 1Password audit events using the official cursor-based Events API.",
    requiredScopes: ["auditevents"],
    inputSchema: cursorEventInputSchema,
    outputSchema: eventStreamOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_item_usages",
    operationType: "read",
    description: "List 1Password item usage events using the official cursor-based Events API.",
    requiredScopes: ["itemusages"],
    inputSchema: cursorEventInputSchema,
    outputSchema: eventStreamOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_sign_in_attempts",
    operationType: "read",
    description: "List 1Password sign-in attempts using the official cursor-based Events API.",
    requiredScopes: ["signinattempts"],
    inputSchema: cursorEventInputSchema,
    outputSchema: eventStreamOutputSchema,
  }),
];
