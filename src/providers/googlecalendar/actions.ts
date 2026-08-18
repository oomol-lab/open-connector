import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  googlecalendarAclReadScopes,
  googlecalendarAclWriteScopes,
  googlecalendarCalendarsWriteScopes,
  googlecalendarEventsWriteScopes,
  googlecalendarReadScopes,
  googlecalendarSettingsReadScopes,
} from "./scopes.ts";

const service = "googlecalendar";

interface GooglecalendarActionSource {
  name: GooglecalendarActionName;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const nonEmptyString = s.string({ minLength: 1 });
const rfc3339 = s.string({ format: "date-time", description: "RFC 3339 timestamp." });
const objectSchema = s.record(true, { description: "Google Calendar API object." });
const objectArray = s.array(objectSchema, { description: "Google Calendar API objects." });
const success = s.object(
  { success: s.literal(true, { description: "Whether the operation completed successfully." }) },
  { required: ["success"], description: "Operation result." },
);
const repeatedString = s.union([nonEmptyString, s.array(nonEmptyString, { minItems: 1 })], {
  description: "One string or an array of strings.",
});

const calendarId = nonEmptyStringWithDescription(
  "Google Calendar ID. Omit to use the primary calendar when supported.",
);
const eventId = nonEmptyStringWithDescription("Google Calendar event ID.");
const ruleId = nonEmptyStringWithDescription("Google Calendar ACL rule ID.");
const sendUpdates = s.stringEnum(
  "Which guests receive notifications about this change. Omit it to keep Google Calendar's default notification behavior. none can stop the change from syncing to external calendars; use import_event for migrations.",
  ["all", "externalOnly", "none"],
);

const eventDateTime = s.object(
  {
    date: s.string({ minLength: 1, description: "All-day event date in YYYY-MM-DD format." }),
    dateTime: rfc3339,
    timeZone: nonEmptyStringWithDescription("IANA time zone used to interpret the event time."),
  },
  { description: "Event date or date-time." },
);

const attendee = s.object(
  {
    email: nonEmptyStringWithDescription("Attendee email address."),
    displayName: s.string({ description: "Attendee display name." }),
    optional: s.boolean({ description: "Whether attendance is optional." }),
    resource: s.boolean({ description: "Whether the attendee represents a resource." }),
    responseStatus: s.string({ description: "Attendee response status." }),
    comment: s.string({ description: "Additional attendee comment." }),
    additionalGuests: s.integer({ description: "Number of additional guests." }),
  },
  { required: ["email"], description: "Event attendee." },
);

const reminderOverride = s.object(
  {
    method: nonEmptyStringWithDescription("Reminder delivery method, such as email or popup."),
    minutes: s.integer({ description: "Minutes before the event." }),
  },
  { required: ["method", "minutes"], description: "Reminder override." },
);

const reminders = s.object(
  {
    useDefault: s.boolean({ description: "Whether to use default calendar reminders." }),
    overrides: s.array(reminderOverride, { description: "Reminder overrides." }),
  },
  { description: "Event reminders." },
);

const eventWritable = s.object(
  {
    summary: s.string({ description: "Event title." }),
    description: s.string({ description: "Event description." }),
    location: s.string({ description: "Event location." }),
    start: eventDateTime,
    end: eventDateTime,
    attendees: s.array(attendee, { description: "Event attendees." }),
    recurrence: s.array(nonEmptyString, { description: "Recurrence rules." }),
    conferenceData: objectSchema,
    reminders,
    colorId: s.string({ description: "Google Calendar color ID." }),
    visibility: s.string({ description: "Event visibility." }),
    transparency: s.string({ description: "Whether the event blocks time." }),
    status: s.string({ description: "Event status." }),
    extendedProperties: objectSchema,
    attachments: objectArray,
    source: objectSchema,
  },
  { additionalProperties: false, description: "Writable Google Calendar event fields." },
);

const eventCreate = s.object(schemaProperties(eventWritable), {
  required: ["start", "end"],
  additionalProperties: false,
  description: "Event creation payload.",
});

const eventImport = s.object(
  {
    ...schemaProperties(eventCreate),
    iCalUID: nonEmptyStringWithDescription("iCalendar UID required when importing an event."),
  },
  { required: ["start", "end", "iCalUID"], additionalProperties: false, description: "Imported event payload." },
);

const eventOutput = s.object(
  {
    id: nonEmptyStringWithDescription("Event ID."),
    status: nonEmptyStringWithDescription("Event status."),
    summary: s.string({ description: "Event title." }),
    description: s.string({ description: "Event description." }),
    location: s.string({ description: "Event location." }),
    htmlLink: s.string({ description: "Google Calendar web URL." }),
    created: s.string({ description: "Creation timestamp." }),
    updated: s.string({ description: "Update timestamp." }),
    start: eventDateTime,
    end: eventDateTime,
    organizer: objectSchema,
    creator: objectSchema,
    attendees: s.array(attendee, { description: "Event attendees." }),
    recurrence: s.array(nonEmptyString, { description: "Recurrence rules." }),
    recurringEventId: s.string({ description: "Recurring master event ID." }),
    originalStartTime: eventDateTime,
    eventType: s.string({ description: "Event type." }),
    conferenceData: objectSchema,
    extendedProperties: objectSchema,
    attachments: objectArray,
    reminders,
    source: objectSchema,
  },
  { required: ["id", "status"], additionalProperties: true, description: "Google Calendar event." },
);

const calendarListEntry = s.object(
  {
    id: nonEmptyStringWithDescription("Calendar ID."),
    summary: nonEmptyStringWithDescription("Calendar summary."),
    accessRole: nonEmptyStringWithDescription("Access role granted on the calendar."),
    primary: s.boolean({ description: "Whether this is the primary calendar." }),
    hidden: s.boolean({ description: "Whether the calendar is hidden." }),
    selected: s.boolean({ description: "Whether the calendar is selected." }),
    timeZone: s.string({ description: "Calendar time zone." }),
    backgroundColor: s.string({ description: "Calendar background color." }),
    foregroundColor: s.string({ description: "Calendar foreground color." }),
    summaryOverride: s.string({ description: "Calendar list display override." }),
    defaultReminders: s.array(reminderOverride, { description: "Default reminders." }),
  },
  { required: ["id", "summary", "accessRole"], additionalProperties: true, description: "Calendar list entry." },
);

const calendarResource = s.object(
  {
    id: nonEmptyStringWithDescription("Calendar ID."),
    summary: nonEmptyStringWithDescription("Calendar summary."),
    kind: s.string({ description: "Google resource kind." }),
    etag: s.string({ description: "Entity tag." }),
    description: s.string({ description: "Calendar description." }),
    location: s.string({ description: "Calendar location." }),
    timeZone: s.string({ description: "Calendar time zone." }),
    conferenceProperties: objectSchema,
  },
  { required: ["id", "summary"], additionalProperties: true, description: "Google Calendar resource." },
);

const calendarWritable = s.object(
  {
    summary: nonEmptyStringWithDescription("Calendar summary."),
    description: s.string({ description: "Calendar description." }),
    location: s.string({ description: "Calendar location." }),
    timeZone: s.string({ description: "Calendar time zone." }),
  },
  { required: ["summary"], additionalProperties: false, description: "Writable calendar fields." },
);

const calendarListEntryWritable = s.object(
  {
    summaryOverride: s.string({ description: "Calendar list display override." }),
    backgroundColor: s.string({ description: "Calendar background color." }),
    foregroundColor: s.string({ description: "Calendar foreground color." }),
    selected: s.boolean({ description: "Whether the calendar is selected." }),
    hidden: s.boolean({ description: "Whether the calendar is hidden." }),
    defaultReminders: s.array(reminderOverride, { description: "Default reminders." }),
    notificationSettings: objectSchema,
  },
  { additionalProperties: false, description: "Writable calendar list entry fields." },
);

const aclScope = s.object(
  {
    type: nonEmptyStringWithDescription("ACL scope type, such as user or default."),
    value: s.string({ description: "ACL scope value." }),
  },
  { required: ["type"], description: "ACL scope." },
);

const aclRule = s.object(
  {
    id: s.string({ description: "ACL rule ID." }),
    kind: s.string({ description: "Google resource kind." }),
    etag: s.string({ description: "Entity tag." }),
    role: nonEmptyStringWithDescription("ACL role granted to the scope."),
    scope: aclScope,
  },
  { required: ["role", "scope"], additionalProperties: true, description: "Calendar ACL rule." },
);

const aclRuleWritable = s.object(
  {
    scope: aclScope,
    role: nonEmptyStringWithDescription("ACL role granted to the scope."),
  },
  { required: ["scope", "role"], additionalProperties: false, description: "Writable ACL rule." },
);

const eventPage = s.object(
  {
    items: s.array(eventOutput, { description: "Events returned by Google Calendar." }),
    nextPageToken: s.string({ description: "Next page token." }),
    nextSyncToken: s.string({ description: "Incremental sync token." }),
    timeZone: s.string({ description: "Response time zone." }),
    updated: s.string({ description: "Response update timestamp." }),
  },
  { required: ["items"], additionalProperties: true, description: "Events page." },
);

const listEventsInputProperties = {
  calendarId,
  q: s.string({ description: "Full-text event search query." }),
  iCalUID: s.string({ description: "iCalendar UID filter." }),
  orderBy: s.string({ description: "Sort order." }),
  timeMin: rfc3339,
  timeMax: rfc3339,
  timeZone: s.string({ description: "Response time zone." }),
  pageToken: s.string({ description: "Page token." }),
  syncToken: s.string({ description: "Incremental sync token." }),
  eventTypes: repeatedString,
  maxResults: s.integer({ minimum: 1, maximum: 2500, description: "Maximum events to return." }),
  updatedMin: rfc3339,
  showDeleted: s.boolean({ description: "Include deleted events." }),
  maxAttendees: s.integer({ minimum: 1, description: "Maximum attendees per event." }),
  singleEvents: s.boolean({ description: "Expand recurring events." }),
  showHiddenInvitations: s.boolean({ description: "Include hidden invitations." }),
  sharedExtendedProperty: repeatedString,
  privateExtendedProperty: repeatedString,
};

const actions: GooglecalendarActionSource[] = [
  action(
    "list_calendars",
    "List the current user's Google Calendar list entries.",
    googlecalendarReadScopes,
    input({
      maxResults: s.integer({ minimum: 1, maximum: 250, description: "Maximum calendar list entries to return." }),
      pageToken: s.string({ description: "Page token." }),
      syncToken: s.string({ description: "Incremental sync token." }),
      showHidden: s.boolean({ description: "Include hidden calendars." }),
      showDeleted: s.boolean({ description: "Include deleted calendars." }),
      minAccessRole: s.string({ description: "Minimum access role." }),
    }),
    page(calendarListEntry),
  ),
  action(
    "get_calendar_list_entry",
    "Fetch one Google Calendar list entry by calendar ID.",
    googlecalendarReadScopes,
    calendarIdInput(),
    calendarListEntry,
  ),
  action(
    "add_calendar_to_list",
    "Add a calendar to the current user's Google Calendar list.",
    googlecalendarCalendarsWriteScopes,
    calendarIdInput(),
    calendarListEntry,
  ),
  action(
    "update_calendar_list_entry",
    "Replace writable fields on a Google Calendar list entry.",
    googlecalendarCalendarsWriteScopes,
    input({ calendarId, entry: calendarListEntryWritable }, ["calendarId", "entry"]),
    calendarListEntry,
  ),
  action(
    "patch_calendar_list_entry",
    "Patch writable fields on a Google Calendar list entry.",
    googlecalendarCalendarsWriteScopes,
    input({ calendarId, entry: calendarListEntryWritable }, ["calendarId", "entry"]),
    calendarListEntry,
  ),
  action(
    "remove_calendar_from_list",
    "Remove a calendar from the current user's Calendar list.",
    googlecalendarCalendarsWriteScopes,
    calendarIdInput(),
    success,
  ),
  action(
    "get_calendar",
    "Fetch one Google Calendar resource by ID.",
    googlecalendarReadScopes,
    calendarIdInput(),
    calendarResource,
  ),
  action(
    "create_calendar",
    "Create a Google Calendar.",
    googlecalendarCalendarsWriteScopes,
    calendarWritable,
    calendarResource,
  ),
  action(
    "update_calendar",
    "Replace writable fields on a Google Calendar resource.",
    googlecalendarCalendarsWriteScopes,
    input({ calendarId, calendar: calendarWritable }, ["calendarId", "calendar"]),
    calendarResource,
  ),
  action(
    "patch_calendar",
    "Patch writable fields on a Google Calendar resource.",
    googlecalendarCalendarsWriteScopes,
    input({ calendarId, calendar: calendarWritable }, ["calendarId", "calendar"]),
    calendarResource,
  ),
  action(
    "delete_calendar",
    "Delete a Google Calendar.",
    googlecalendarCalendarsWriteScopes,
    calendarIdInput(),
    success,
  ),
  action(
    "clear_calendar",
    "Clear all events from a Google Calendar.",
    googlecalendarCalendarsWriteScopes,
    calendarIdInput(),
    success,
  ),
  action(
    "list_events",
    "List events from a Google Calendar.",
    googlecalendarReadScopes,
    input(listEventsInputProperties, ["calendarId"]),
    eventPage,
  ),
  action(
    "list_events_all_calendars",
    "List events across multiple Google Calendars and aggregate the result.",
    googlecalendarReadScopes,
    input(
      {
        calendarIds: s.array(nonEmptyString, { description: "Calendar IDs to query." }),
        q: s.string({ description: "Full-text event search query." }),
        timeMin: rfc3339,
        timeMax: rfc3339,
        timeZone: s.string({ description: "Response time zone." }),
        eventTypes: repeatedString,
        showDeleted: s.boolean({ description: "Include deleted events." }),
        singleEvents: s.boolean({ description: "Expand recurring events." }),
        maxResultsPerCalendar: s.integer({ minimum: 1, maximum: 2500, description: "Maximum events per calendar." }),
      },
      ["timeMin", "timeMax"],
    ),
    s.object(
      {
        events: s.array(
          s.object({ ...schemaProperties(eventOutput), sourceCalendar: objectSchema }, { additionalProperties: true }),
          { description: "Aggregated events." },
        ),
        summaryView: objectArray,
        calendarsQueried: objectArray,
        errorsByCalendar: s.record(objectSchema, { description: "Errors keyed by calendar ID." }),
      },
      {
        required: ["events", "summaryView", "calendarsQueried", "errorsByCalendar"],
        description: "Aggregated calendar events.",
      },
    ),
  ),
  action(
    "get_event",
    "Fetch one Google Calendar event.",
    googlecalendarReadScopes,
    calendarEventIdInput(),
    eventOutput,
  ),
  action(
    "create_event",
    "Create a Google Calendar event.",
    googlecalendarEventsWriteScopes,
    input({ calendarId, event: eventCreate, sendUpdates }, ["calendarId", "event"]),
    eventOutput,
  ),
  action(
    "update_event",
    "Replace writable fields on a Google Calendar event.",
    googlecalendarEventsWriteScopes,
    input({ calendarId, eventId, event: eventWritable, sendUpdates }, ["calendarId", "eventId", "event"]),
    eventOutput,
  ),
  action(
    "patch_event",
    "Patch writable fields on a Google Calendar event.",
    googlecalendarEventsWriteScopes,
    input({ calendarId, eventId, event: eventWritable, sendUpdates }, ["calendarId", "eventId", "event"]),
    eventOutput,
  ),
  action(
    "delete_event",
    "Delete a Google Calendar event.",
    googlecalendarEventsWriteScopes,
    input({ calendarId, eventId, sendUpdates }, ["calendarId", "eventId"]),
    success,
  ),
  action(
    "import_event",
    "Import an event into Google Calendar without conferenceData or attachments.",
    googlecalendarEventsWriteScopes,
    input({ calendarId, event: eventImport }, ["calendarId", "event"]),
    eventOutput,
  ),
  action(
    "move_event",
    "Move a Google Calendar event to another calendar.",
    googlecalendarEventsWriteScopes,
    input(
      {
        calendarId,
        eventId,
        destinationCalendarId: nonEmptyStringWithDescription("Destination calendar ID."),
        sendUpdates,
      },
      ["calendarId", "eventId", "destinationCalendarId"],
    ),
    eventOutput,
  ),
  action(
    "list_event_instances",
    "List instances of a recurring Google Calendar event.",
    googlecalendarReadScopes,
    input(
      {
        calendarId,
        eventId,
        timeMin: rfc3339,
        timeMax: rfc3339,
        timeZone: s.string({ description: "Response time zone." }),
        pageToken: s.string({ description: "Page token." }),
        maxResults: s.integer({ minimum: 1, maximum: 2500, description: "Maximum instances to return." }),
        showDeleted: s.boolean({ description: "Include deleted instances." }),
        maxAttendees: s.integer({ minimum: 1, description: "Maximum attendees per instance." }),
      },
      ["calendarId", "eventId"],
    ),
    eventPage,
  ),
  action(
    "quick_add_event",
    "Create a Google Calendar event with natural language text.",
    googlecalendarEventsWriteScopes,
    input(
      {
        calendarId,
        text: nonEmptyStringWithDescription("Natural-language event text."),
        sendUpdates,
      },
      ["calendarId", "text"],
    ),
    eventOutput,
  ),
  action(
    "sync_events",
    "Incrementally sync events from a Google Calendar.",
    googlecalendarReadScopes,
    input(listEventsInputProperties, ["calendarId"]),
    eventPage,
  ),
  action(
    "free_busy_query",
    "Query busy intervals for calendars and groups.",
    googlecalendarReadScopes,
    freeBusyInput(),
    freeBusyOutput(),
  ),
  action(
    "find_free_slots",
    "Derive free slots from Google Calendar freeBusy data.",
    googlecalendarReadScopes,
    freeBusyInput(),
    s.object(
      {
        kind: nonEmptyStringWithDescription("Derived free-slots resource kind."),
        timeMin: nonEmptyStringWithDescription("Lower bound of the analyzed time range."),
        timeMax: nonEmptyStringWithDescription("Upper bound of the analyzed time range."),
        calendars: s.record(objectSchema, { description: "Free-slot results keyed by calendar ID." }),
      },
      { required: ["kind", "timeMin", "timeMax", "calendars"], description: "Derived free slots." },
    ),
  ),
  action("get_colors", "Fetch the Google Calendar colors resource.", googlecalendarReadScopes, input({}), objectSchema),
  action(
    "list_settings",
    "List Google Calendar settings.",
    googlecalendarSettingsReadScopes,
    input({
      maxResults: s.integer({ minimum: 1, maximum: 250, description: "Maximum settings to return." }),
      pageToken: s.string({ description: "Page token." }),
      syncToken: s.string({ description: "Incremental sync token." }),
    }),
    page(objectSchema),
  ),
  action(
    "get_setting",
    "Fetch one Google Calendar setting.",
    googlecalendarSettingsReadScopes,
    input({ settingId: nonEmptyStringWithDescription("Google Calendar setting ID.") }, ["settingId"]),
    objectSchema,
  ),
  action(
    "list_acl",
    "List ACL rules for a Google Calendar.",
    googlecalendarAclReadScopes,
    input(
      {
        calendarId,
        maxResults: s.integer({ minimum: 1, maximum: 100, description: "Maximum ACL rules to return." }),
        pageToken: s.string({ description: "Page token." }),
        syncToken: s.string({ description: "Incremental sync token." }),
        showDeleted: s.boolean({ description: "Include deleted ACL rules." }),
      },
      ["calendarId"],
    ),
    page(aclRule),
  ),
  action(
    "get_acl_rule",
    "Fetch one ACL rule from a Google Calendar.",
    googlecalendarAclReadScopes,
    calendarRuleIdInput(),
    aclRule,
  ),
  action(
    "create_acl_rule",
    "Create an ACL rule on a Google Calendar.",
    googlecalendarAclWriteScopes,
    input({ calendarId, rule: aclRuleWritable }, ["calendarId", "rule"]),
    aclRule,
  ),
  action(
    "update_acl_rule",
    "Replace writable fields on a Google Calendar ACL rule.",
    googlecalendarAclWriteScopes,
    input({ calendarId, ruleId, rule: aclRuleWritable }, ["calendarId", "ruleId", "rule"]),
    aclRule,
  ),
  action(
    "patch_acl_rule",
    "Patch writable fields on a Google Calendar ACL rule.",
    googlecalendarAclWriteScopes,
    input({ calendarId, ruleId, rule: aclRuleWritable }, ["calendarId", "ruleId", "rule"]),
    aclRule,
  ),
  action(
    "delete_acl_rule",
    "Delete an ACL rule from a Google Calendar.",
    googlecalendarAclWriteScopes,
    calendarRuleIdInput(),
    success,
  ),
  action(
    "find_event",
    "Search events in a Google Calendar using a query string.",
    googlecalendarReadScopes,
    input(
      {
        query: nonEmptyStringWithDescription("Full-text search query for events."),
        calendarId,
        timeMin: rfc3339,
        timeMax: rfc3339,
        updatedMin: rfc3339,
        eventTypes: repeatedString,
        orderBy: s.string({ description: "Sort order." }),
        singleEvents: s.boolean({ description: "Expand recurring events." }),
        showDeleted: s.boolean({ description: "Include deleted events." }),
        maxResults: s.integer({ minimum: 1, maximum: 2500, description: "Maximum events to return." }),
        pageToken: s.string({ description: "Page token." }),
      },
      ["query"],
    ),
    eventPage,
  ),
  action(
    "add_attendee",
    "Add one attendee to a Google Calendar event without replacing existing guests.",
    googlecalendarEventsWriteScopes,
    input(
      {
        eventId,
        attendeeEmail: nonEmptyStringWithDescription("Attendee email address to add."),
        calendarId: s.withDefault(calendarId, "primary"),
        sendUpdates: s.withDefault(
          s.stringEnum(
            "Who should receive invitation or update emails. Defaults to all so the new guest is notified.",
            ["all", "externalOnly", "none"],
          ),
          "all",
        ),
        displayName: schemaProperties(attendee).displayName,
        optional: schemaProperties(attendee).optional,
      },
      ["eventId", "attendeeEmail"],
    ),
    eventOutput,
  ),
  action(
    "remove_attendee",
    "Remove one attendee from a Google Calendar event without replacing the remaining guests.",
    googlecalendarEventsWriteScopes,
    input(
      {
        eventId,
        attendeeEmail: nonEmptyStringWithDescription("Attendee email address to remove."),
        calendarId: s.withDefault(calendarId, "primary"),
        sendUpdates: s.withDefault(
          s.stringEnum(
            "Who should receive cancellation or update emails. Defaults to all so remaining guests are notified.",
            ["all", "externalOnly", "none"],
          ),
          "all",
        ),
      },
      ["eventId", "attendeeEmail"],
    ),
    eventOutput,
  ),
];

export type GooglecalendarActionName =
  | "list_calendars"
  | "get_calendar_list_entry"
  | "add_calendar_to_list"
  | "update_calendar_list_entry"
  | "patch_calendar_list_entry"
  | "remove_calendar_from_list"
  | "get_calendar"
  | "create_calendar"
  | "update_calendar"
  | "patch_calendar"
  | "delete_calendar"
  | "clear_calendar"
  | "list_events"
  | "list_events_all_calendars"
  | "get_event"
  | "create_event"
  | "update_event"
  | "patch_event"
  | "delete_event"
  | "import_event"
  | "move_event"
  | "list_event_instances"
  | "quick_add_event"
  | "sync_events"
  | "free_busy_query"
  | "find_free_slots"
  | "get_colors"
  | "list_settings"
  | "get_setting"
  | "list_acl"
  | "get_acl_rule"
  | "create_acl_rule"
  | "update_acl_rule"
  | "patch_acl_rule"
  | "delete_acl_rule"
  | "find_event"
  | "add_attendee"
  | "remove_attendee";

export const googlecalendarActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    description: source.description,
    requiredScopes: source.requiredScopes,
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function action(
  name: GooglecalendarActionName,
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GooglecalendarActionSource {
  return { name, description, requiredScopes, inputSchema, outputSchema };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "The input payload for this action.");
}

function calendarIdInput(): JsonSchema {
  return input({ calendarId }, ["calendarId"]);
}

function calendarEventIdInput(): JsonSchema {
  return input({ calendarId, eventId }, ["calendarId", "eventId"]);
}

function calendarRuleIdInput(): JsonSchema {
  return input({ calendarId, ruleId }, ["calendarId", "ruleId"]);
}

function page(item: JsonSchema): JsonSchema {
  return s.object(
    {
      items: s.array(item, { description: "Items returned by Google Calendar." }),
      nextPageToken: s.string({ description: "Next page token." }),
      nextSyncToken: s.string({ description: "Incremental sync token." }),
    },
    { required: ["items"], additionalProperties: true, description: "Google Calendar page." },
  );
}

function freeBusyInput(): JsonSchema {
  return input(
    {
      items: s.union(
        [
          s.array(nonEmptyString, { minItems: 1 }),
          s.array(s.object({ id: nonEmptyString }, { required: ["id"] }), { minItems: 1 }),
        ],
        {
          description: "Calendar or group IDs to include in the freeBusy query.",
        },
      ),
      timeMin: rfc3339,
      timeMax: rfc3339,
      timeZone: s.string({ description: "Response time zone." }),
      groupExpansionMax: s.integer({ minimum: 1, maximum: 100, description: "Maximum calendars to expand per group." }),
      calendarExpansionMax: s.integer({
        minimum: 1,
        maximum: 50,
        description: "Maximum calendars to return after expansion.",
      }),
    },
    ["items", "timeMin", "timeMax"],
  );
}

function freeBusyOutput(): JsonSchema {
  return s.object(
    {
      kind: nonEmptyStringWithDescription("Google Calendar freeBusy resource kind."),
      timeMin: nonEmptyStringWithDescription("Lower bound of the queried time range."),
      timeMax: nonEmptyStringWithDescription("Upper bound of the queried time range."),
      calendars: s.record(objectSchema, { description: "Busy results keyed by calendar or group ID." }),
      groups: s.record(objectSchema, { description: "Expanded group results keyed by group ID." }),
    },
    { required: ["kind", "timeMin", "timeMax", "calendars"], description: "freeBusy response." },
  );
}

function nonEmptyStringWithDescription(description: string): JsonSchema {
  return s.nonEmptyString(description);
}

function schemaProperties(schema: JsonSchema): Record<string, JsonSchema> {
  return (schema.properties ?? {}) as Record<string, JsonSchema>;
}
