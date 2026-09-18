import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "demio";

const automatedEventSchema = s.requiredObject("Demio automated-event playback details.", {
  duration: s.number("The automated event video duration in seconds."),
  ready: s.boolean("Whether the automated event video is ready to play."),
});

const eventDateSchema = s.looseRequiredObject(
  "A scheduled Demio event session.",
  {
    date_id: s.integer("The unique event session identifier."),
    status: s.string("The current event session status."),
    timestamp: s.integer("The scheduled event session time as a Unix timestamp."),
    datetime: s.string("The human-readable scheduled event session time."),
    zone: s.string("The timezone used for the event session."),
  },
  { optional: [] },
);

const eventListItemSchema = s.looseRequiredObject(
  "An active Demio event.",
  {
    id: s.integer("The unique event identifier."),
    name: s.string("The event name."),
    description: s.string("The event description."),
    date_id: s.integer("The next scheduled event session identifier."),
    status: s.string("The next scheduled event session status."),
    timestamp: s.integer("The next scheduled event session time as a Unix timestamp."),
    zone: s.string("The timezone used for the next scheduled event session."),
    registration_url: s.string("The public registration page URL for the event."),
    automated: s.nullable(automatedEventSchema),
  },
  { optional: ["description"] },
);

const eventDetailsSchema = s.looseRequiredObject(
  "Detailed Demio event information.",
  {
    id: s.integer("The unique event identifier."),
    name: s.string("The event name."),
    description: s.string("The event description."),
    registrants_stay_registered: s.boolean("Whether registrants stay registered throughout an event series."),
    registration_url: s.string("The public registration page URL for the event."),
    next_date_id: s.integer("The next available running or scheduled event session identifier."),
    automated: s.nullable(automatedEventSchema),
    dates: s.array("All scheduled, running, and finished sessions for the event.", eventDateSchema),
  },
  { optional: [] },
);

const customFieldSchema = s.looseRequiredObject(
  "A Demio participant custom field value.",
  {
    id: s.string("The custom registration field identifier."),
    name: s.string("The custom registration field name."),
    value: s.string("The participant's value for the custom registration field."),
  },
  { optional: [] },
);

const participantSchema = s.looseRequiredObject(
  "A participant in a Demio event session.",
  {
    email: s.string("The participant's email address."),
    name: s.string("The participant's name."),
    custom_fields: s.array("The participant's custom registration field values.", customFieldSchema),
    attended: s.boolean("Whether the participant attended the event session."),
    status: s.string("The participant's event session status."),
  },
  { optional: [] },
);

const registerAttendeeInputSchema = s.object(
  "Registration data for one Demio attendee. Extra string properties are sent as custom registration fields keyed by their Demio field identifiers.",
  {
    id: s.nullable(s.integer("The event ID, or null when ref_url identifies the event.")),
    ref_url: s.nullable(s.url("The event registration page URL, or null when id identifies the event.")),
    date_id: s.nullable(s.integer("The event session ID, or null to let Demio choose the nearest active session.")),
    name: s.string("The attendee's first name.", {
      minLength: 3,
    }),
    email: s.email("The attendee's email address."),
    last_name: s.string("The attendee's last name."),
    company: s.string("The attendee's company."),
    website: s.string("The attendee's company website."),
    phone_number: s.string("The attendee's phone number."),
    gdpr: s.string("The attendee's value for the predefined GDPR field."),
  },
  {
    optional: ["id", "ref_url", "date_id", "last_name", "company", "website", "phone_number", "gdpr"],
    additionalProperties: s.string("A custom registration field value keyed by its Demio field identifier."),
  },
);

export const demioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description: "List active Demio events, optionally filtered to upcoming, past, or automated events.",
    inputSchema: s.object(
      "Optional filtering for the Demio event list.",
      {
        type: s.stringEnum("The event type to return.", ["upcoming", "past", "automated"]),
      },
      { optional: ["type"] },
    ),
    outputSchema: s.array("The active Demio events.", eventListItemSchema),
  }),
  defineProviderAction(service, {
    name: "get_event",
    operationType: "read",
    description: "Get one Demio event with its public registration URL and complete scheduled session list.",
    inputSchema: s.object(
      "Input identifying a Demio event.",
      {
        id: s.integer("The unique event identifier."),
        active: s.boolean("Whether to return only active sessions in the event series."),
      },
      { optional: ["active"] },
    ),
    outputSchema: eventDetailsSchema,
  }),
  defineProviderAction(service, {
    name: "get_event_session",
    operationType: "read",
    description: "Get scheduling and status information for one Demio event session.",
    inputSchema: s.requiredObject("Input identifying a Demio event session.", {
      id: s.integer("The unique event identifier."),
      date_id: s.integer("The unique event session identifier."),
    }),
    outputSchema: eventDateSchema,
  }),
  defineProviderAction(service, {
    name: "register_attendee",
    operationType: "write",
    description: "Register one attendee for a Demio event and return the attendee hash and unique join link.",
    inputSchema: registerAttendeeInputSchema,
    outputSchema: s.looseRequiredObject(
      "The newly created Demio attendee registration.",
      {
        hash: s.nonEmptyString("The attendee hash used to identify the registration."),
        join_link: s.url("The attendee's unique event join link."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_event_participants",
    operationType: "read",
    description: "List participants for one Demio event session, optionally filtered by participation status.",
    inputSchema: s.object(
      "Input identifying a Demio event session participation report.",
      {
        date_id: s.integer("The unique event session identifier."),
        status: s.stringEnum("The participation status to return.", [
          "attended",
          "did not attend",
          "completed",
          "left early",
          "banned",
        ]),
      },
      { optional: ["status"] },
    ),
    outputSchema: s.looseRequiredObject(
      "The Demio event session participation report.",
      {
        participants: s.array("The participants in the event session.", participantSchema),
      },
      { optional: [] },
    ),
  }),
];
