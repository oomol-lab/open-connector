import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
const calendarId = s.string("The Feishu calendar ID. Use `primary` for the caller's primary calendar.", {
  minLength: 1,
});
const eventId = s.string("The Feishu calendar event ID.", { minLength: 1 });
const timeValue = s.string(
  "An RFC 3339 date-time or Unix timestamp in seconds, for example `2026-07-23T09:00:00+08:00`.",
  { minLength: 1 },
);
const pageSize = s.positiveInteger("The maximum number of items to return on this page.", {
  maximum: 500,
});
const pageToken = s.string("The page token returned by the previous request.", { minLength: 1 });
const userIdType = s.stringEnum("The identifier type used for user fields.", ["open_id", "union_id", "user_id"]);
const looseItem = s.looseRequiredObject(
  "A Feishu calendar object.",
  {},
  {
    optional: [],
  },
);
const pageOutput = s.object(
  "A normalized page returned by Feishu.",
  {
    items: s.array("The items returned on this page.", looseItem),
    hasMore: s.boolean("Whether another page is available."),
    pageToken: s.nullable(s.string("The token for the next page.")),
  },
  {
    optional: [],
  },
);
const itemOutput = s.object(
  "A normalized Feishu calendar result.",
  {
    item: looseItem,
  },
  {
    optional: [],
  },
);
const attendee = s.object(
  "A user, chat, or meeting room attendee.",
  {
    type: s.stringEnum("The attendee type.", ["user", "chat", "resource", "third_party"]),
    id: s.string("The attendee identifier: a user open_id, chat_id, room_id, or third-party email.", { minLength: 1 }),
    approvalReason: s.string("The approval reason required by some meeting rooms."),
  },
  {
    optional: ["approvalReason"],
  },
);
const eventFields = {
  summary: s.string("The event title.", { minLength: 1 }),
  description: s.string("The event description in Feishu Markdown."),
  startTime: timeValue,
  endTime: timeValue,
  timezone: s.string("The IANA timezone used by the start and end times."),
  isAllDay: s.boolean("Whether the event is an all-day event."),
  visibility: s.stringEnum("The event visibility.", ["default", "public", "private"]),
  attendeeAbility: s.stringEnum("The permission granted to attendees.", [
    "none",
    "can_see_others",
    "can_invite_others",
    "can_modify_event",
  ]),
  freeBusyStatus: s.stringEnum("How the event affects availability.", ["busy", "free"]),
  location: s.looseRequiredObject(
    "The event location object accepted by Feishu.",
    {},
    {
      optional: [],
    },
  ),
  recurrence: s.string("The RFC 5545 recurrence rule, without the `RRULE:` prefix."),
  reminders: s.array(
    "Event reminders.",
    s.object(
      "A reminder before the event.",
      {
        minutes: s.integer("The number of minutes before the event.", { minimum: 0 }),
      },
      {
        optional: [],
      },
    ),
  ),
};
export function createFeishuCalendarActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "list_calendar_agenda",
      description: "List event instances in a Feishu calendar over a bounded time range.",
      requiredScopes: ["calendar:calendar.event:read"],
      providerPermissions: ["calendar:calendar.event:read"],
      inputSchema: s.object(
        "Choose a calendar and time range.",
        {
          calendarId,
          startTime: timeValue,
          endTime: timeValue,
        },
        {
          optional: [],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "search_calendar_events",
      description: "Search Feishu calendar events by text, time range, and attendee identifiers.",
      requiredScopes: ["calendar:calendar.event:read"],
      providerPermissions: ["calendar:calendar.event:read"],
      inputSchema: s.object(
        "Describe the event search.",
        {
          calendarId,
          query: s.string("Text to match in calendar events."),
          startTime: timeValue,
          endTime: timeValue,
          attendeeIds: s.array(
            "User open_ids, chat_ids, or meeting room IDs used to filter events.",
            s.string("An attendee identifier.", { minLength: 1 }),
          ),
          pageSize,
          pageToken,
        },
        {
          optional: ["query", "startTime", "endTime", "attendeeIds", "pageSize", "pageToken"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "get_calendar_event",
      description: "Get the complete details of one Feishu calendar event.",
      requiredScopes: ["calendar:calendar.event:read"],
      providerPermissions: ["calendar:calendar.event:read"],
      inputSchema: s.object(
        "Identify the calendar event.",
        { calendarId, eventId },
        {
          optional: [],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "create_calendar_event",
      description:
        "Create a Feishu calendar event and add attendees, rolling back the event if attendee creation fails.",
      requiredScopes: [
        "calendar:calendar.event:create",
        "calendar:calendar.event:update",
        "calendar:calendar.event:delete",
      ],
      providerPermissions: [
        "calendar:calendar.event:create",
        "calendar:calendar.event:update",
        "calendar:calendar.event:delete",
      ],
      inputSchema: s.object(
        "Describe the event and optional attendees.",
        {
          calendarId,
          summary: eventFields.summary,
          description: eventFields.description,
          startTime: eventFields.startTime,
          endTime: eventFields.endTime,
          timezone: eventFields.timezone,
          isAllDay: eventFields.isAllDay,
          visibility: eventFields.visibility,
          attendeeAbility: eventFields.attendeeAbility,
          freeBusyStatus: eventFields.freeBusyStatus,
          location: eventFields.location,
          recurrence: eventFields.recurrence,
          reminders: eventFields.reminders,
          attendees: s.array("Attendees to add after creating the event.", attendee),
          notifyAttendees: s.boolean("Whether Feishu should notify attendees."),
        },
        {
          optional: [
            "description",
            "timezone",
            "isAllDay",
            "visibility",
            "attendeeAbility",
            "freeBusyStatus",
            "location",
            "recurrence",
            "reminders",
            "attendees",
            "notifyAttendees",
          ],
        },
      ),
      outputSchema: itemOutput,
    }),
    defineProviderAction(service, {
      name: "update_calendar_event",
      description: "Update Feishu calendar event fields and incrementally add or remove attendees.",
      requiredScopes: ["calendar:calendar.event:update"],
      providerPermissions: ["calendar:calendar.event:update"],
      inputSchema: s.object(
        "Identify the event and provide fields or attendees to change.",
        {
          calendarId,
          eventId,
          summary: eventFields.summary,
          description: eventFields.description,
          startTime: eventFields.startTime,
          endTime: eventFields.endTime,
          timezone: eventFields.timezone,
          isAllDay: eventFields.isAllDay,
          visibility: eventFields.visibility,
          attendeeAbility: eventFields.attendeeAbility,
          freeBusyStatus: eventFields.freeBusyStatus,
          location: eventFields.location,
          recurrence: eventFields.recurrence,
          reminders: eventFields.reminders,
          addAttendees: s.array("Attendees to add.", attendee),
          removeAttendeeIds: s.array(
            "User open_ids, chat_ids, or room IDs to remove.",
            s.string("An attendee identifier.", { minLength: 1 }),
          ),
          notifyAttendees: s.boolean("Whether Feishu should notify attendees."),
        },
        {
          optional: [
            "summary",
            "description",
            "startTime",
            "endTime",
            "timezone",
            "isAllDay",
            "visibility",
            "attendeeAbility",
            "freeBusyStatus",
            "location",
            "recurrence",
            "reminders",
            "addAttendees",
            "removeAttendeeIds",
            "notifyAttendees",
          ],
        },
      ),
      outputSchema: s.object(
        "The updated event and attendee operation counts.",
        {
          item: looseItem,
          attendeesAdded: s.integer("The number of attendees added."),
          attendeesRemoved: s.integer("The number of attendees removed."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "delete_calendar_event",
      description: "Delete a Feishu calendar event.",
      requiredScopes: ["calendar:calendar.event:delete"],
      providerPermissions: ["calendar:calendar.event:delete"],
      inputSchema: s.object(
        "Identify the event to delete.",
        {
          calendarId,
          eventId,
          notifyAttendees: s.boolean("Whether Feishu should notify attendees."),
        },
        {
          optional: ["notifyAttendees"],
        },
      ),
      outputSchema: s.object(
        "The deletion result.",
        {
          deleted: s.boolean("Whether the event was deleted."),
          eventId: s.string("The deleted event ID."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "query_calendar_freebusy",
      description: "Query a Feishu user's free/busy periods and RSVP status.",
      requiredScopes: ["calendar:calendar.free_busy:read"],
      providerPermissions: ["calendar:calendar.free_busy:read"],
      inputSchema: s.object(
        "Describe the free/busy query.",
        {
          userId: s.string("The user identifier to query.", { minLength: 1 }),
          userIdType,
          startTime: timeValue,
          endTime: timeValue,
          includeRsvpStatus: s.boolean("Whether to include RSVP status."),
        },
        {
          optional: ["userIdType", "includeRsvpStatus"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "find_calendar_rooms",
      description: "Find meeting rooms available for the specified event time slots.",
      requiredScopes: ["calendar:calendar.free_busy:read"],
      providerPermissions: ["calendar:calendar.free_busy:read"],
      inputSchema: s.object(
        "Describe room requirements and candidate time slots.",
        {
          timeSlots: s.array(
            "Candidate meeting time slots.",
            s.object(
              "One candidate time slot.",
              {
                startTime: timeValue,
                endTime: timeValue,
              },
              {
                optional: [],
              },
            ),
            { minItems: 1, maxItems: 10 },
          ),
          attendeeUserIds: s.array(
            "User open_ids attending the meeting.",
            s.string("A user open_id.", { minLength: 1 }),
          ),
          attendeeChatIds: s.array(
            "Chat IDs whose members attend the meeting.",
            s.string("A chat ID.", { minLength: 1 }),
          ),
          city: s.string("The city name used to restrict room results."),
          building: s.string("The building name used to restrict room results."),
          floor: s.string("The floor name used to restrict room results."),
          roomName: s.string("Text to match in meeting room names."),
          minCapacity: s.positiveInteger("The minimum room capacity."),
          maxCapacity: s.positiveInteger("The maximum room capacity."),
          timezone: s.string("The IANA timezone of the requested slots."),
          recurrence: s.string("The RFC 5545 recurrence rule used for availability checks."),
        },
        {
          optional: [
            "attendeeUserIds",
            "attendeeChatIds",
            "city",
            "building",
            "floor",
            "roomName",
            "minCapacity",
            "maxCapacity",
            "timezone",
            "recurrence",
          ],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "suggest_calendar_times",
      description: "Suggest available meeting times for Feishu users and chats.",
      requiredScopes: ["calendar:calendar.free_busy:read"],
      providerPermissions: ["calendar:calendar.free_busy:read"],
      inputSchema: s.object(
        "Describe the meeting and acceptable time ranges.",
        {
          timeRanges: s.array(
            "Acceptable ranges in which Feishu may suggest a meeting time.",
            s.object(
              "One acceptable time range.",
              {
                startTime: timeValue,
                endTime: timeValue,
              },
              {
                optional: [],
              },
            ),
            { minItems: 1 },
          ),
          durationMinutes: s.positiveInteger("The desired meeting duration in minutes."),
          attendeeUserIds: s.array(
            "User open_ids attending the meeting.",
            s.string("A user open_id.", { minLength: 1 }),
          ),
          attendeeChatIds: s.array(
            "Chat IDs whose members attend the meeting.",
            s.string("A chat ID.", { minLength: 1 }),
          ),
        },
        {
          optional: ["attendeeUserIds", "attendeeChatIds"],
        },
      ),
      outputSchema: pageOutput,
    }),
    defineProviderAction(service, {
      name: "reply_calendar_event",
      description: "Accept, decline, or tentatively accept a Feishu calendar event invitation.",
      requiredScopes: ["calendar:calendar.event:reply"],
      providerPermissions: ["calendar:calendar.event:reply"],
      inputSchema: s.object(
        "Identify the event and choose an RSVP status.",
        {
          calendarId,
          eventId,
          status: s.stringEnum("The RSVP response.", ["accept", "decline", "tentative"]),
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The RSVP result.",
        {
          eventId: s.string("The replied event ID."),
          status: s.string("The RSVP status sent to Feishu."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "get_calendar_meeting_info",
      description: "Get video meeting and meeting-note relations for calendar event instances.",
      requiredScopes: ["calendar:calendar.event:read"],
      providerPermissions: ["calendar:calendar.event:read"],
      inputSchema: s.object(
        "Identify event instances to inspect.",
        {
          calendarId,
          instanceIds: s.array(
            "Calendar event instance IDs whose meeting relations should be returned.",
            s.string("A calendar event instance ID.", { minLength: 1 }),
            { minItems: 1, maxItems: 50 },
          ),
        },
        {
          optional: [],
        },
      ),
      outputSchema: pageOutput,
    }),
  ];
}
