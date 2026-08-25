import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "teamup";

const calendarKeySchema = s.nonEmptyString(
  "The Teamup calendar key or calendar identifier that addresses the calendar.",
);
const eventIdSchema = s.nonEmptyString("The Teamup event identifier.");
const timezoneSchema = s.nonEmptyString("The IANA timezone used when Teamup returns event timestamps.");
const eventSchema = s.looseObject("The event object returned by Teamup.");
const subcalendarSchema = s.looseObject("The subcalendar object returned by Teamup.");

const listEventsAction = defineProviderAction(service, {
  name: "list_events",
  description: "List events from a Teamup calendar over an optional date range.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Teamup events.",
    {
      calendarKey: calendarKeySchema,
      startDate: s.string("The inclusive range start in YYYY-MM-DD format.", {
        format: "date",
      }),
      endDate: s.string("The inclusive range end in YYYY-MM-DD format.", { format: "date" }),
      timezone: timezoneSchema,
    },
    { optional: ["startDate", "endDate", "timezone"] },
  ),
  outputSchema: s.object("The response returned when listing Teamup events.", {
    events: s.array("The events returned by Teamup.", eventSchema),
  }),
});

const getEventAction = defineProviderAction(service, {
  name: "get_event",
  description: "Get one Teamup calendar event by its identifier.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Teamup event.",
    { calendarKey: calendarKeySchema, eventId: eventIdSchema, timezone: timezoneSchema },
    { optional: ["timezone"] },
  ),
  outputSchema: s.object("The response returned when getting a Teamup event.", {
    event: eventSchema,
  }),
});

const eventWriteFields = {
  startDateTime: s.nonEmptyString("The event start timestamp in ISO 8601 format."),
  endDateTime: s.nonEmptyString("The event end timestamp in ISO 8601 format."),
  subcalendarIds: s.array(
    "The Teamup subcalendar identifiers assigned to the event.",
    s.integer("One Teamup subcalendar identifier."),
    { minItems: 1 },
  ),
  allDay: s.boolean("Whether the event lasts all day."),
  title: s.nonEmptyString("The event title."),
  location: s.string("The event location."),
  who: s.string("The people or group associated with the event."),
  notes: s.string("The event notes, which may contain Teamup-supported HTML."),
  recurrenceRule: s.string("The event recurrence rule accepted by Teamup."),
};

const createEventAction = defineProviderAction(service, {
  name: "create_event",
  description: "Create an event in a Teamup calendar.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a Teamup event.",
    { calendarKey: calendarKeySchema, timezone: timezoneSchema, ...eventWriteFields },
    { optional: ["timezone", "allDay", "location", "who", "notes", "recurrenceRule"] },
  ),
  outputSchema: s.object("The response returned after creating a Teamup event.", {
    event: eventSchema,
  }),
});

const updateEventAction = defineProviderAction(service, {
  name: "update_event",
  description: "Update selected fields of an existing Teamup calendar event.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for updating a Teamup event.",
    {
      calendarKey: calendarKeySchema,
      eventId: eventIdSchema,
      timezone: timezoneSchema,
      ...eventWriteFields,
    },
    {
      optional: [
        "timezone",
        "subcalendarIds",
        "startDateTime",
        "endDateTime",
        "allDay",
        "title",
        "location",
        "who",
        "notes",
        "recurrenceRule",
      ],
    },
  ),
  outputSchema: s.object("The response returned after updating a Teamup event.", {
    event: eventSchema,
    undoId: s.nullable(s.string("The identifier Teamup can use to undo the update.")),
  }),
});

const deleteEventAction = defineProviderAction(service, {
  name: "delete_event",
  description: "Delete an event from a Teamup calendar.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for deleting a Teamup event.", {
    calendarKey: calendarKeySchema,
    eventId: eventIdSchema,
  }),
  outputSchema: s.object("The response returned after deleting a Teamup event.", {
    undoId: s.nullable(s.string("The identifier Teamup can use to undo the deletion.")),
  }),
});

const listSubcalendarsAction = defineProviderAction(service, {
  name: "list_subcalendars",
  description: "List subcalendars available through a Teamup calendar key or identifier.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Teamup subcalendars.",
    {
      calendarKey: calendarKeySchema,
      includeInactive: s.boolean("Whether inactive subcalendars should be included."),
    },
    { optional: ["includeInactive"] },
  ),
  outputSchema: s.object("The response returned when listing Teamup subcalendars.", {
    subcalendars: s.array("The subcalendars returned by Teamup.", subcalendarSchema),
  }),
});

export const teamupActions: readonly ActionDefinition[] = [
  listEventsAction,
  getEventAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
  listSubcalendarsAction,
];
