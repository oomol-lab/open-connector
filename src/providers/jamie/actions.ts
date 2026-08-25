import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jamie";

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableDateTime = (description: string) => s.nullable(s.dateTime(description));
const nullablePersonSchema = s.nullable(
  s.looseRequiredObject(
    "A Jamie person object when the value is available.",
    {
      name: nonEmptyString("The person's display name."),
      email: nullableString("The person's email address when Jamie returned one."),
    },
    { optional: ["email"] },
  ),
);

const pageLimitSchema = s.integer("The number of items to return, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const cursorSchema = nonEmptyString("The pagination cursor returned by Jamie.");
const startDateSchema = nonEmptyString("Only return records starting or created on or after this ISO 8601 date.");
const endDateSchema = nonEmptyString("Only return records starting or created on or before this ISO 8601 date.");

const meetingSummarySchema = s.looseRequiredObject(
  "A Jamie meeting summary returned by a list endpoint.",
  {
    id: nonEmptyString("Unique Jamie meeting ID."),
    title: nonEmptyString("Meeting title."),
    generatedTitle: nullableString("AI-generated meeting title when available."),
    startTime: s.dateTime("ISO 8601 meeting start time."),
    endTime: nullableDateTime("ISO 8601 meeting end time when available."),
    calendarEventId: nullableString("Linked calendar event ID when available."),
    userId: nonEmptyString("ID of the Jamie user who recorded the meeting."),
  },
  { optional: ["generatedTitle", "endTime", "calendarEventId"] },
);

const summarySchema = s.looseRequiredObject("Jamie meeting summary content.", {
  markdown: s.string("Meeting summary formatted as Markdown."),
  html: s.string("Meeting summary formatted as HTML."),
  short: s.string("Short one-line meeting summary."),
});

const participantSchema = s.looseRequiredObject(
  "A participant detected from the Jamie transcript.",
  {
    id: nonEmptyString("Participant ID."),
    name: nonEmptyString("Participant display name."),
    email: nullableString("Participant email address when available."),
  },
  { optional: ["email"] },
);

const meetingTaskSchema = s.looseRequiredObject(
  "An action item included in a Jamie meeting detail response.",
  {
    content: nonEmptyString("Task description."),
    completed: s.boolean("Whether the task is marked as done."),
    assignee: nullablePersonSchema,
  },
  { optional: ["assignee"] },
);

const tagSchema = s.looseRequiredObject("A Jamie tag.", {
  id: nonEmptyString("Unique Jamie tag ID."),
  name: nonEmptyString("Jamie tag name."),
  shared: s.boolean("Whether the tag was shared with the current user."),
});

const meetingTagSchema = s.looseRequiredObject("A tag applied to a Jamie meeting.", {
  name: nonEmptyString("Jamie tag name."),
  color: nonEmptyString("Jamie tag color."),
});

const attendeeSchema = s.looseRequiredObject(
  "A calendar attendee linked to a Jamie meeting.",
  {
    name: nonEmptyString("Attendee display name."),
    email: nonEmptyString("Attendee email address."),
    responseStatus: nullableString("Attendee RSVP status when available."),
    organizer: s.boolean("Whether this attendee organized the calendar event."),
  },
  { optional: ["responseStatus"] },
);

const eventSchema = s.looseRequiredObject(
  "Calendar event information linked to a Jamie meeting.",
  {
    id: nullableString("Internal Jamie calendar event ID when available."),
    externalId: nullableString("Calendar provider event ID when available."),
    title: nonEmptyString("Calendar event title."),
    scheduledTime: s.dateTime("ISO 8601 scheduled start time."),
    endTime: nullableDateTime("ISO 8601 event end time when available."),
    attendees: s.array("People invited to the calendar event.", attendeeSchema),
  },
  { optional: ["id", "externalId", "endTime"] },
);

const meetingDetailSchema = s.looseRequiredObject("Full Jamie meeting details.", {
  id: nonEmptyString("Unique Jamie meeting ID."),
  title: nonEmptyString("Meeting title."),
  generatedTitle: nullableString("AI-generated meeting title when available."),
  startTime: s.dateTime("ISO 8601 meeting start time."),
  endTime: nullableDateTime("ISO 8601 meeting end time when available."),
  user: s.looseRequiredObject("Jamie user who recorded the meeting.", {
    id: nonEmptyString("Jamie user ID."),
    email: s.email("Jamie user email address."),
  }),
  summary: summarySchema,
  transcript: s.string("Full markdown-formatted meeting transcript."),
  participants: s.array("People detected from the transcript.", participantSchema),
  tasks: s.array("Action items extracted from the meeting.", meetingTaskSchema),
  tags: s.array("Tags applied to the meeting.", meetingTagSchema),
  event: eventSchema,
});

const taskSchema = s.looseRequiredObject(
  "A Jamie action item returned by tasks.list.",
  {
    id: nonEmptyString("Unique Jamie task ID."),
    text: nonEmptyString("Task description."),
    completed: s.boolean("Whether the task is marked as done."),
    assignee: s.nullable(
      s.looseRequiredObject(
        "Assigned person when Jamie returned one.",
        {
          id: nullableString("Assignee person ID when available."),
          name: nonEmptyString("Assignee display name."),
          email: nullableString("Assignee email address when available."),
        },
        { optional: ["id", "email"] },
      ),
    ),
    meetingId: nonEmptyString("ID of the meeting this task was extracted from."),
    meetingTitle: nullableString("Title of the source meeting when available."),
    createdAt: s.dateTime("ISO 8601 timestamp when the task was created."),
    userId: nonEmptyString("ID of the Jamie user who recorded the meeting."),
  },
  { optional: ["assignee", "meetingTitle"] },
);

const searchResultSchema = s.looseRequiredObject("A Jamie semantic search result.", {
  id: nonEmptyString("Unique search chunk ID."),
  text: nonEmptyString("The matching text excerpt."),
  meetingId: nonEmptyString("ID of the source meeting."),
  meetingTitle: nullableString("Title of the source meeting when available."),
  meetingDate: s.date("Date of the source meeting."),
});

const listMeetingsInputSchema = s.object(
  "Input parameters for listing Jamie meetings.",
  {
    limit: pageLimitSchema,
    cursor: cursorSchema,
    startDate: startDateSchema,
    endDate: endDateSchema,
    userEmail: s.email("Workspace-key-only filter for a specific user's email address."),
    tag: nonEmptyString("Personal-key-only filter by Jamie tag name."),
  },
  { optional: ["limit", "cursor", "startDate", "endDate", "userEmail", "tag"] },
);

const listTasksInputSchema = s.object(
  "Input parameters for listing Jamie tasks.",
  {
    limit: pageLimitSchema,
    cursor: cursorSchema,
    startDate: startDateSchema,
    endDate: endDateSchema,
    userEmail: s.email("Workspace-key-only filter for a specific user's email address."),
    completed: s.boolean("Filter tasks by completion status."),
    meetingId: nonEmptyString("Filter tasks from a specific Jamie meeting."),
  },
  { optional: ["limit", "cursor", "startDate", "endDate", "userEmail", "completed", "meetingId"] },
);

const getMeetingInputSchema = s.object("Input parameters for retrieving a Jamie meeting.", {
  meetingId: nonEmptyString("The Jamie meeting ID."),
});

const searchMeetingsInputSchema = s.object(
  "Input parameters for searching Jamie meeting content.",
  {
    query: nonEmptyString("The semantic search query."),
    startDate: startDateSchema,
    endDate: endDateSchema,
  },
  { optional: ["startDate", "endDate"] },
);

const paginatedMeetingOutputSchema = s.object("A page of Jamie meetings.", {
  meetings: s.array("Meetings returned for the requested page.", meetingSummarySchema),
  nextCursor: s.nullable(s.string("Cursor for the next page, or null if there are no more pages.")),
});

const paginatedTaskOutputSchema = s.object("A page of Jamie tasks.", {
  tasks: s.array("Tasks returned for the requested page.", taskSchema),
  nextCursor: s.nullable(s.string("Cursor for the next page, or null if there are no more pages.")),
});

export const jamieActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_meetings",
    description: "List Jamie meetings for a personal or workspace API key with optional pagination and filters.",
    requiredScopes: [],
    inputSchema: listMeetingsInputSchema,
    outputSchema: paginatedMeetingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_meeting",
    description: "Get full Jamie meeting details, including summary, transcript, tasks, and tags.",
    requiredScopes: [],
    inputSchema: getMeetingInputSchema,
    outputSchema: s.object("A Jamie meeting detail response.", {
      meeting: meetingDetailSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Jamie action items for a personal or workspace API key.",
    requiredScopes: [],
    inputSchema: listTasksInputSchema,
    outputSchema: paginatedTaskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_meetings",
    description: "Search Jamie meeting content with a personal API key.",
    requiredScopes: [],
    inputSchema: searchMeetingsInputSchema,
    outputSchema: s.object("Jamie semantic meeting search results.", {
      results: s.array("Matching meeting text chunks.", searchResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Jamie tags available to a personal API key.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing Jamie tags.", {}),
    outputSchema: s.object("Jamie tags response.", {
      tags: s.array("Tags returned by Jamie.", tagSchema),
    }),
  }),
];
