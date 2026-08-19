import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "meet_geek";

const meetingIdSchema = s.nonEmptyString("MeetGeek meeting identifier.");
const teamIdSchema = s.positiveInteger("MeetGeek team identifier.");
const limitSchema = s.integer("Number of records to fetch, from 1 to 500.", { minimum: 1, maximum: 500 });
const cursorSchema = s.nonEmptyString("Pagination cursor returned by MeetGeek.");
const regionSchema = s.stringEnum("MeetGeek API region used for the request.", ["default", "eu", "us"]);
const looseRecordSchema = s.looseObject("A MeetGeek object returned by the API.");

const paginationSchema = s.looseObject("MeetGeek pagination metadata.", {
  next: s.string("Cursor for the next page of results."),
  limit: s.integer("Number of records requested for this page."),
});

const regionOnlyInputSchema = s.object(
  "Input parameters for selecting a MeetGeek API region.",
  {
    region: regionSchema,
  },
  { optional: ["region"] },
);

const paginatedInputSchema = s.object(
  "Input parameters for reading a paginated MeetGeek collection.",
  {
    limit: limitSchema,
    cursor: cursorSchema,
    region: regionSchema,
  },
  { optional: ["limit", "cursor", "region"] },
);

const teamMeetingsInputSchema = s.object(
  "Input parameters for reading a team's MeetGeek meetings.",
  {
    teamId: teamIdSchema,
    limit: limitSchema,
    cursor: cursorSchema,
    region: regionSchema,
  },
  { optional: ["limit", "cursor", "region"] },
);

const meetingInputSchema = s.object(
  "Input parameters for reading MeetGeek meeting data.",
  {
    meetingId: meetingIdSchema,
    region: regionSchema,
  },
  { optional: ["region"] },
);

const highlightsInputSchema = s.object(
  "Input parameters for reading MeetGeek meeting highlights.",
  {
    meetingId: meetingIdSchema,
    type: s.nonEmptyString("Optional MeetGeek highlight type, such as next_steps."),
    region: regionSchema,
  },
  { optional: ["type", "region"] },
);

const transcriptInputSchema = s.object(
  "Input parameters for reading MeetGeek meeting transcript sentences.",
  {
    meetingId: meetingIdSchema,
    limit: limitSchema,
    cursor: cursorSchema,
    region: regionSchema,
  },
  { optional: ["limit", "cursor", "region"] },
);

const meetingsPageOutputSchema = s.object("Paginated MeetGeek meetings response.", {
  meetings: s.array("Meetings returned by MeetGeek.", looseRecordSchema),
  pagination: paginationSchema,
  nextCursor: s.nullableString("Cursor to pass into the next request, when one is available."),
});

const meetingOutputSchema = s.object("MeetGeek meeting response.", {
  meeting: looseRecordSchema,
});

const summaryOutputSchema = s.object("MeetGeek meeting summary response.", {
  meetingId: s.string("MeetGeek meeting identifier returned with the summary."),
  summary: s.string("Meeting summary text returned by MeetGeek."),
  aiInsights: s.string("AI insights text returned by MeetGeek."),
  raw: looseRecordSchema,
});

const transcriptOutputSchema = s.object("Paginated MeetGeek transcript response.", {
  meetingId: s.string("MeetGeek meeting identifier returned with the transcript."),
  sentences: s.array("Transcript sentence records returned by MeetGeek.", looseRecordSchema),
  pagination: paginationSchema,
  nextCursor: s.nullableString("Cursor to pass into the next request, when one is available."),
});

const highlightsOutputSchema = s.object("MeetGeek highlights response.", {
  meetingId: s.string("MeetGeek meeting identifier returned with the highlights."),
  highlights: s.array("Highlight records returned by MeetGeek.", looseRecordSchema),
});

const insightsOutputSchema = s.object("MeetGeek insights response.", {
  insights: looseRecordSchema,
});

const teamsOutputSchema = s.object("MeetGeek teams response.", {
  shareAccess: s.array("Teams where the API key can share meetings.", looseRecordSchema),
  viewAccess: s.array("Teams where the API key can view meetings.", looseRecordSchema),
});

export const meetGeekActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_meetings",
    description: "List paginated past meetings from MeetGeek.",
    inputSchema: paginatedInputSchema,
    outputSchema: meetingsPageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_team_meetings",
    description: "List paginated past meetings for a MeetGeek team.",
    inputSchema: teamMeetingsInputSchema,
    outputSchema: meetingsPageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_meeting",
    description: "Get details for a MeetGeek meeting.",
    inputSchema: meetingInputSchema,
    outputSchema: meetingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_summary",
    description: "Get the summary and AI insights for a MeetGeek meeting.",
    inputSchema: meetingInputSchema,
    outputSchema: summaryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_transcript",
    description: "Get paginated transcript sentences for a MeetGeek meeting.",
    inputSchema: transcriptInputSchema,
    outputSchema: transcriptOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_highlights",
    description: "Get highlights for a MeetGeek meeting, optionally filtered by type.",
    inputSchema: highlightsInputSchema,
    outputSchema: highlightsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_insights",
    description: "Get KPI and improvement insights for a MeetGeek meeting.",
    inputSchema: meetingInputSchema,
    outputSchema: insightsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List MeetGeek teams available to the API key.",
    inputSchema: regionOnlyInputSchema,
    outputSchema: teamsOutputSchema,
  }),
];
