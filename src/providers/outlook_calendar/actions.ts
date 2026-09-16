import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { outlookCalendarProfileScopes, outlookCalendarScopes, outlookCalendarSharedScopes } from "./scopes.ts";

const service = "outlook_calendar";

interface OutlookCalendarActionSource {
  name: string;
  description: string;
  requiredScopes: string[];
  providerPermissions: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const rawObject = s.record(true, { description: "A Microsoft Graph object." });
const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const stringArray = (description: string): JsonSchema => s.stringArray(description, { minItems: 1 });
const calendarId = nonEmptyString("Outlook calendar ID.");
const eventId = nonEmptyString("Outlook event ID.");
const nextLink = s.url("Opaque Microsoft Graph pagination URL returned by a previous call.");
const select = stringArray("Microsoft Graph fields to include in the response.");
const timeZone = nonEmptyString("Windows time zone name used for returned date-time values.");
const dateTimeTimeZone = s.object(
  {
    dateTime: nonEmptyString("Local date and time, such as 2026-09-16T10:00:00."),
    timeZone: nonEmptyString("Windows time zone name, such as UTC or Pacific Standard Time."),
  },
  { required: ["dateTime", "timeZone"], description: "Microsoft Graph dateTimeTimeZone value." },
);
const emailAddress = s.object(
  {
    address: s.email("Email address."),
    name: s.string("Display name."),
  },
  { required: ["address"], description: "Email address and optional display name." },
);
const attendee = s.object(
  {
    emailAddress,
    type: s.stringEnum(["required", "optional", "resource"], { description: "Attendee type." }),
  },
  { required: ["emailAddress", "type"], description: "Meeting attendee." },
);
const location = s.looseObject(
  {
    displayName: s.string("Location display name."),
    locationEmailAddress: s.string("Location email address."),
    locationType: s.string("Microsoft Graph location type."),
    uniqueId: s.string("Provider location identifier."),
    uniqueIdType: s.string("Provider location identifier type."),
  },
  { description: "Event location." },
);
const itemBody = s.object(
  {
    contentType: s.stringEnum(["text", "html"], { description: "Body content type." }),
    content: s.string("Body content."),
  },
  { required: ["contentType", "content"], description: "Event body." },
);
const onlineMeetingProvider = s.stringEnum(["unknown", "skypeForBusiness", "skypeForConsumer", "teamsForBusiness"], {
  description: "Online meeting provider.",
});
const eventFields = {
  subject: s.string("Event subject."),
  body: itemBody,
  bodyPreview: s.string("Plain-text body preview."),
  start: dateTimeTimeZone,
  end: dateTimeTimeZone,
  location,
  locations: s.array(location, { description: "Event locations." }),
  attendees: s.array(attendee, { description: "Event attendees." }),
  categories: stringArray("Outlook categories assigned to the event."),
  importance: s.stringEnum(["low", "normal", "high"], { description: "Event importance." }),
  sensitivity: s.stringEnum(["normal", "personal", "private", "confidential"], {
    description: "Event sensitivity.",
  }),
  showAs: s.stringEnum(["free", "tentative", "busy", "oof", "workingElsewhere", "unknown"], {
    description: "Free/busy status shown for the event.",
  }),
  isAllDay: s.boolean("Whether the event lasts all day."),
  isOnlineMeeting: s.boolean("Whether to create an online meeting."),
  onlineMeetingProvider,
  recurrence: rawObject,
  responseRequested: s.boolean("Whether attendee responses are requested."),
  allowNewTimeProposals: s.boolean("Whether attendees may propose a new time."),
  transactionId: s.string("Client-generated identifier used to avoid duplicate creates."),
};
const eventWrite = s.object(eventFields, { additionalProperties: false, description: "Writable event fields." });
const eventCreate = s.object(eventFields, {
  required: ["subject", "start", "end"],
  additionalProperties: false,
  description: "Event creation payload.",
});
const event = s.looseObject(
  {
    id: nonEmptyString("Event ID."),
    iCalUId: s.string("iCalendar UID."),
    seriesMasterId: s.nullableString("Recurring series master ID."),
    type: s.string("Event type."),
    subject: s.string("Event subject."),
    body: rawObject,
    bodyPreview: s.string("Plain-text body preview."),
    start: dateTimeTimeZone,
    end: dateTimeTimeZone,
    location,
    locations: s.array(location, { description: "Event locations." }),
    attendees: s.array(rawObject, { description: "Attendees and their response status." }),
    organizer: rawObject,
    recurrence: rawObject,
    responseStatus: rawObject,
    onlineMeeting: rawObject,
    onlineMeetingUrl: s.nullableString("Legacy online meeting URL."),
    webLink: s.string("Outlook web URL for the event."),
    isCancelled: s.boolean("Whether the event is cancelled."),
  },
  { description: "Outlook event resource." },
);
const calendar = s.looseObject(
  {
    id: nonEmptyString("Calendar ID."),
    name: nonEmptyString("Calendar name."),
    color: s.string("Calendar color."),
    hexColor: s.string("Calendar hexadecimal color."),
    canEdit: s.boolean("Whether the current user may edit this calendar."),
    canShare: s.boolean("Whether the current user may share this calendar."),
    canViewPrivateItems: s.boolean("Whether private event details are visible."),
    isDefaultCalendar: s.boolean("Whether this is the default calendar."),
    owner: rawObject,
  },
  { description: "Outlook calendar resource." },
);
const user = s.looseObject(
  {
    id: nonEmptyString("Microsoft account ID."),
    displayName: s.string("Account display name."),
    mail: s.nullableString("Primary email address."),
    userPrincipalName: s.string("User principal name."),
  },
  { description: "Current Microsoft account profile." },
);
const success = s.object(
  { success: s.literal(true, { description: "Whether the operation completed successfully." }) },
  { required: ["success"], description: "Operation acknowledgement." },
);

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "Outlook Calendar action input.");
}

const listQueryFields = {
  top: s.integer({ minimum: 1, maximum: 1000, description: "Maximum resources to return." }),
  filter: s.string("OData filter expression."),
  orderby: s.string("OData orderby expression."),
  select,
  expand: s.string("OData expand expression."),
  nextLink,
  preferTimeZone: timeZone,
};
const listEventsOutput = s.object(
  {
    events: s.array(event, { description: "Events returned by Microsoft Graph." }),
    nextLink: s.nullableString("Next-page URL, or null when no page remains."),
  },
  { required: ["events", "nextLink"], description: "Paginated Outlook event response." },
);
const scheduleInformation = s.looseObject(
  {
    scheduleId: s.nonEmptyString("SMTP address represented by this availability result."),
    availabilityView: s.string("Merged availability view for the requested interval."),
    scheduleItems: s.array(
      s.looseObject(
        {
          status: s.string("Free/busy status."),
          subject: s.string("Schedule item subject when visible."),
          location: s.string("Schedule item location when visible."),
          start: dateTimeTimeZone,
          end: dateTimeTimeZone,
        },
        { description: "One busy interval in the schedule." },
      ),
      { description: "Busy intervals returned for the schedule." },
    ),
    workingHours: rawObject,
    error: rawObject,
  },
  { description: "Availability information for one requested schedule." },
);
const meetingTimeSuggestionsResult = s.looseObject(
  {
    emptySuggestionsReason: s.nullableString("Reason no meeting time could be suggested."),
    meetingTimeSuggestions: s.array(
      s.looseObject(
        {
          meetingTimeSlot: s.object(
            { start: dateTimeTimeZone, end: dateTimeTimeZone },
            { required: ["start", "end"], description: "Suggested meeting interval." },
          ),
          confidence: s.number({ minimum: 0, maximum: 100, description: "Suggestion confidence percentage." }),
          organizerAvailability: s.string("Organizer availability for the suggestion."),
          attendeeAvailability: s.array(rawObject, { description: "Availability of each attendee." }),
          locations: s.array(rawObject, { description: "Suggested meeting locations." }),
          suggestionReason: s.string("Explanation for the suggestion."),
        },
        { description: "One suggested meeting time." },
      ),
      { description: "Meeting time suggestions returned by Microsoft Graph." },
    ),
  },
  { description: "Result of finding candidate meeting times." },
);

const actions: OutlookCalendarActionSource[] = [
  action(
    "get_current_user",
    "Get the profile for the connected Microsoft account.",
    outlookCalendarProfileScopes,
    user,
    input({}),
  ),
  action(
    "list_calendars",
    "List calendars belonging to the connected Microsoft account.",
    outlookCalendarScopes,
    s.object(
      {
        calendars: s.array(calendar, { description: "Calendars returned by Microsoft Graph." }),
        nextLink: s.nullableString("Next-page URL, or null when no page remains."),
      },
      { required: ["calendars", "nextLink"] },
    ),
    input(listQueryFields),
  ),
  action(
    "get_calendar",
    "Get one Outlook calendar by ID.",
    outlookCalendarScopes,
    calendar,
    input({ calendarId, select }, ["calendarId"]),
  ),
  action(
    "list_events",
    "List events from the default calendar or a selected calendar.",
    outlookCalendarScopes,
    listEventsOutput,
    input({ calendarId, ...listQueryFields }),
  ),
  action(
    "list_calendar_view",
    "List event occurrences and exceptions within a date-time range.",
    outlookCalendarScopes,
    listEventsOutput,
    input(
      {
        calendarId,
        startDateTime: s.dateTime("Inclusive range start as an ISO 8601 timestamp."),
        endDateTime: s.dateTime("Exclusive range end as an ISO 8601 timestamp."),
        ...listQueryFields,
      },
      ["startDateTime", "endDateTime"],
    ),
  ),
  action(
    "get_event",
    "Get one Outlook event by ID.",
    outlookCalendarScopes,
    event,
    input({ eventId, select, preferTimeZone: timeZone }, ["eventId"]),
  ),
  action(
    "get_schedule",
    "Get free and busy availability for users, rooms, or resources.",
    outlookCalendarScopes,
    s.object(
      { schedules: s.array(scheduleInformation, { description: "Availability results by schedule." }) },
      { required: ["schedules"] },
    ),
    input(
      {
        schedules: stringArray("SMTP addresses whose availability should be returned."),
        startTime: dateTimeTimeZone,
        endTime: dateTimeTimeZone,
        availabilityViewInterval: s.integer({
          minimum: 5,
          maximum: 1440,
          description: "Availability interval in minutes.",
        }),
        preferTimeZone: timeZone,
      },
      ["schedules", "startTime", "endTime"],
    ),
  ),
  action(
    "find_meeting_times",
    "Suggest meeting times that satisfy attendee, location, and time constraints.",
    outlookCalendarSharedScopes,
    meetingTimeSuggestionsResult,
    input({
      attendees: s.array(attendee, { minItems: 1, description: "People or resources invited to the meeting." }),
      locationConstraint: rawObject,
      timeConstraint: rawObject,
      meetingDuration: nonEmptyString("ISO 8601 duration, such as PT1H."),
      maxCandidates: s.integer({ minimum: 1, description: "Maximum suggestions to return." }),
      isOrganizerOptional: s.boolean("Whether the organizer may be unavailable."),
      returnSuggestionReasons: s.boolean("Whether each suggestion includes an explanation."),
      minimumAttendeePercentage: s.number({
        minimum: 0,
        maximum: 100,
        description: "Minimum attendee availability percentage.",
      }),
      preferTimeZone: timeZone,
    }),
  ),
  action(
    "create_event",
    "Create an event in the default calendar or a selected calendar.",
    outlookCalendarScopes,
    event,
    input({ calendarId, event: eventCreate, preferTimeZone: timeZone }, ["event"]),
  ),
  action(
    "update_event",
    "Update writable fields on an Outlook event.",
    outlookCalendarScopes,
    event,
    input({ eventId, event: eventWrite, preferTimeZone: timeZone }, ["eventId", "event"]),
  ),
  action(
    "delete_event",
    "Delete an Outlook event; deleting an organized meeting sends a cancellation to attendees.",
    outlookCalendarScopes,
    success,
    input({ eventId }, ["eventId"]),
  ),
  action(
    "cancel_event",
    "Cancel an organized event and notify its attendees.",
    outlookCalendarScopes,
    success,
    input({ eventId, comment: s.string("Cancellation message sent to attendees.") }, ["eventId"]),
  ),
  action(
    "accept_event",
    "Accept an event invitation for the connected account.",
    outlookCalendarScopes,
    success,
    responseInput(false),
  ),
  action(
    "decline_event",
    "Decline an event invitation for the connected account.",
    outlookCalendarScopes,
    success,
    responseInput(true),
  ),
  action(
    "tentatively_accept_event",
    "Tentatively accept an event invitation for the connected account.",
    outlookCalendarScopes,
    success,
    responseInput(true),
  ),
];

export const outlookCalendarActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, source),
);

function responseInput(allowNewTimeProposal: boolean): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    eventId,
    comment: s.string("Optional response message sent to the organizer."),
    sendResponse: s.boolean("Whether to send the response to the organizer."),
  };
  if (allowNewTimeProposal) {
    properties.proposedNewTime = s.object(
      { start: dateTimeTimeZone, end: dateTimeTimeZone },
      {
        required: ["start", "end"],
        description: "Alternative meeting time; sendResponse must be true when this is provided.",
      },
    );
  }
  return input(properties, ["eventId"]);
}

function action(
  name: string,
  description: string,
  scopes: string[],
  outputSchema: JsonSchema,
  inputSchema: JsonSchema,
): OutlookCalendarActionSource {
  return {
    name,
    description,
    requiredScopes: scopes,
    providerPermissions: scopes,
    inputSchema,
    outputSchema,
  };
}
