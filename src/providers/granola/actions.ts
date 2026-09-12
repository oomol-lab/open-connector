import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "granola";

/** Meeting fields shared by the API-key and OAuth transports. Missing upstream fields stay omitted. */
export interface GranolaMeeting {
  id: string;
  title: string | null;
  date?: string;
  attendees?: string;
  summary?: string;
}

const meetingSchema = s.requiredObject("A Granola meeting.", {
  id: s.nonEmptyString("Meeting ID for this connection. OAuth and API-key IDs are not interchangeable."),
  title: s.nullable(s.string("Meeting title, when available.")),
  date: s.optional(s.string("Meeting date when available, not a creation or update timestamp.")),
  attendees: s.optional(s.string("Participant names and email addresses when available.")),
  summary: s.optional(s.string("Meeting summary, preserving its original Markdown when present.")),
});

const cursorSchema = s.nonEmptyString("Cursor returned by this action for the same connection and filters.");
const pageSizeSchema = s.integer("Maximum number of records to return. Granola allows 1 to 30.", {
  minimum: 1,
  maximum: 30,
});
const dateOrDateTimeSchema = s.nonEmptyString(
  "API-key-only date or date-time filter, such as 2026-01-27 or 2026-01-27T15:30:00Z. MCP does not expose note creation or update timestamps.",
);

const userSchema = s.looseObject("A Granola user object.", {
  name: s.nullable(s.string("The name of the user.")),
  email: s.email("The email address of the user."),
});

const folderSchema = s.looseObject(
  "A Granola folder object. MCP supplies ID and name; REST also supplies object type and folder hierarchy.",
  {
    id: s.string("The ID of the folder."),
    object: s.string("The object type returned by Granola."),
    name: s.string("The name of the folder."),
    parent_folder_id: s.nullable(s.string("The ID of the parent folder, or null for top-level folders.")),
  },
);

const noteSummarySchema = s.looseObject(
  "A Granola note summary object. MCP supplies the ID and title; REST includes owner and timestamps.",
  {
    id: s.string("The ID of the note."),
    object: s.string("The object type returned by Granola."),
    title: s.nullable(s.string("The title of the note.")),
    owner: userSchema,
    created_at: s.string("The creation time of the note."),
    updated_at: s.string("The last update time of the note."),
  },
);

const calendarInviteeSchema = s.looseObject("A Granola calendar invitee object.", {
  email: s.email("The email address of the calendar invitee."),
});

const calendarEventSchema = s.looseObject("A Granola calendar event object.", {
  event_title: s.nullable(s.string("The title of the calendar event.")),
  invitees: s.array("Calendar invitees returned by Granola.", calendarInviteeSchema),
  organiser: s.nullable(s.string("The email address of the organiser.")),
  calendar_event_id: s.nullable(s.string("The ID of the calendar event.")),
  scheduled_start_time: s.nullable(s.string("The scheduled start time of the calendar event.")),
  scheduled_end_time: s.nullable(s.string("The scheduled end time of the calendar event.")),
});

const speakerSchema = s.looseObject("A Granola transcript speaker object.", {
  source: s.string("The source of the speaker, such as microphone or speaker."),
  diarization_label: s.string("The diarized anonymous speaker label when Granola returns one."),
});

const transcriptItemSchema = s.looseObject(
  "A Granola transcript item. MCP returns one text-only item preserving the full transcript.",
  {
    speaker: speakerSchema,
    text: s.string("The transcript text."),
    start_time: s.string("The start time of the transcript item."),
    end_time: s.string("The end time of the transcript item."),
  },
);

const noteSchema = s.looseObject(
  "A Granola note object. MCP supplies ID, title, Markdown summary, and an optional transcript; other REST metadata is omitted.",
  {
    id: s.string("The ID of the note."),
    object: s.string("The object type returned by Granola."),
    title: s.nullable(s.string("The title of the note.")),
    owner: userSchema,
    created_at: s.string("The creation time of the note."),
    updated_at: s.string("The last update time of the note."),
    web_url: s.url("The URL to view the note in Granola."),
    calendar_event: s.nullable(calendarEventSchema),
    attendees: s.array("Meeting attendees returned by Granola.", userSchema),
    folder_membership: s.array("Folders that contain the note.", folderSchema),
    summary_text: s.string("The plain text summary of the note."),
    summary_markdown: s.nullable(s.string("The markdown summary of the note, when available.")),
    transcript: s.nullable(s.array("Transcript items returned by Granola.", transcriptItemSchema)),
  },
);

const listNotesInputSchema = s.object(
  "Query parameters for listing Granola notes.",
  {
    created_before: dateOrDateTimeSchema,
    created_after: dateOrDateTimeSchema,
    updated_after: dateOrDateTimeSchema,
    folder_id: s.nonEmptyString(
      "Folder ID returned for this connection. Folder filtering through MCP requires a paid plan.",
    ),
    cursor: cursorSchema,
    page_size: pageSizeSchema,
  },
  {
    optional: ["created_before", "created_after", "updated_after", "folder_id", "cursor", "page_size"],
  },
);

const getNoteInputSchema = s.object(
  "Path and query parameters for retrieving a Granola note.",
  {
    note_id: s.nonEmptyString("Granola note ID to retrieve."),
    include: s.stringEnum("Optional related Granola note data to include.", ["transcript"]),
  },
  { optional: ["include"] },
);

const listFoldersInputSchema = s.object(
  "Query parameters for listing Granola folders.",
  {
    cursor: cursorSchema,
    page_size: pageSizeSchema,
  },
  { optional: ["cursor", "page_size"] },
);

const listNotesOutputSchema = s.object("Paginated Granola notes response.", {
  notes: s.array("Notes returned by Granola.", noteSummarySchema),
  hasMore: s.boolean("Whether Granola has more notes to fetch."),
  cursor: s.nullable(s.string("The cursor to continue from, when one is available.")),
  nextCursor: s.nullable(s.string("Cursor to pass into the next request, when one is available.")),
});

const getNoteOutputSchema = s.object("Granola note response.", {
  note: noteSchema,
});

const listFoldersOutputSchema = s.object("Paginated Granola folders response.", {
  folders: s.array("Folders returned by Granola.", folderSchema),
  hasMore: s.boolean("Whether Granola has more folders to fetch."),
  cursor: s.nullable(s.string("The cursor to continue from, when one is available.")),
  nextCursor: s.nullable(s.string("Cursor to pass into the next request, when one is available.")),
});

export const granolaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_notes",
    description:
      "List Granola notes with OAuth or an API key. MCP lists meetings from the last 30 days and supports folder filtering and local cursor pagination. Creation and update filters require an API key.",
    requiredScopes: [],
    inputSchema: listNotesInputSchema,
    outputSchema: listNotesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_note",
    description:
      "Get a Granola note and summary by ID with OAuth or an API key, optionally including the transcript on eligible paid plans. Use an ID returned for the same connection.",
    requiredScopes: [],
    inputSchema: getNoteInputSchema,
    outputSchema: getNoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_folders",
    description:
      "List accessible Granola folders with OAuth or an API key and cursor pagination. MCP folder access requires a paid plan and uses local pagination of the returned list.",
    requiredScopes: [],
    inputSchema: listFoldersInputSchema,
    outputSchema: listFoldersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_meetings",
    description:
      "List recent Granola meetings with OAuth or an API key. OAuth uses MCP's last-30-days window; API keys list notes created in the last 30 days. Use get_meetings to read summaries.",
    requiredScopes: [],
    followUpActions: ["granola.get_meetings"],
    inputSchema: s.object({}),
    outputSchema: s.requiredObject("Recent meetings accessible to this connection.", {
      meetings: s.array(meetingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_meetings",
    description:
      "Read Granola meeting details and summaries by ID with OAuth or an API key. Use IDs returned for the same connection. Free-plan OAuth access covers personal notes from the last 30 days.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Meetings to retrieve.", {
      meeting_ids: s.array(s.nonEmptyString("Meeting ID returned by list_meetings."), {
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
      }),
    }),
    outputSchema: s.requiredObject("Requested meetings in input order.", {
      meetings: s.array(meetingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_meeting_transcript",
    description: "Read a Granola meeting transcript with OAuth or an API key. Requires an eligible paid Granola plan.",
    requiredScopes: [],
    inputSchema: s.requiredObject("Meeting whose transcript to retrieve.", {
      meeting_id: s.nonEmptyString("Meeting ID returned for this connection."),
    }),
    outputSchema: s.requiredObject("Transcript text for the requested meeting.", {
      meeting_id: s.nonEmptyString("Native Granola meeting ID."),
      transcript: s.nonEmptyString("Transcript text with speaker labels and timestamps when available."),
    }),
  }),
];
