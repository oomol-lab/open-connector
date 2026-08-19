import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "granola";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const cursorSchema = nonEmptyString("Cursor token returned by a previous Granola page.");
const pageSizeSchema = s.integer("Maximum number of records to return. Granola allows 1 to 30.", {
  minimum: 1,
  maximum: 30,
});
const dateOrDateTimeSchema = nonEmptyString(
  "Date or date-time filter accepted by Granola, such as 2026-01-27 or 2026-01-27T15:30:00Z.",
);

const userSchema = s.looseObject("A Granola user object.", {
  name: s.nullable(s.string("The name of the user.")),
  email: s.email("The email address of the user."),
});

const folderSchema = s.looseObject("A Granola folder object.", {
  id: s.string("The ID of the folder."),
  object: s.string("The object type returned by Granola."),
  name: s.string("The name of the folder."),
  parent_folder_id: s.nullable(s.string("The ID of the parent folder, or null for top-level folders.")),
});

const noteSummarySchema = s.looseObject("A Granola note summary object.", {
  id: s.string("The ID of the note."),
  object: s.string("The object type returned by Granola."),
  title: s.nullable(s.string("The title of the note.")),
  owner: userSchema,
  created_at: s.string("The creation time of the note."),
  updated_at: s.string("The last update time of the note."),
});

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

const transcriptItemSchema = s.looseObject("A Granola transcript item.", {
  speaker: speakerSchema,
  text: s.string("The transcript text."),
  start_time: s.string("The start time of the transcript item."),
  end_time: s.string("The end time of the transcript item."),
});

const noteSchema = s.looseObject("A Granola note object.", {
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
});

const listNotesInputSchema = s.object(
  "Query parameters for listing Granola notes.",
  {
    created_before: dateOrDateTimeSchema,
    created_after: dateOrDateTimeSchema,
    updated_after: dateOrDateTimeSchema,
    folder_id: nonEmptyString("Granola folder ID used to filter notes."),
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
    note_id: nonEmptyString("Granola note ID to retrieve."),
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
    description: "List accessible Granola meeting notes with optional date, folder, and cursor filters.",
    requiredScopes: [],
    inputSchema: listNotesInputSchema,
    outputSchema: listNotesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_note",
    description: "Get a Granola meeting note by ID, optionally including the transcript.",
    requiredScopes: [],
    inputSchema: getNoteInputSchema,
    outputSchema: getNoteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_folders",
    description: "List accessible Granola folders with cursor pagination.",
    requiredScopes: [],
    inputSchema: listFoldersInputSchema,
    outputSchema: listFoldersOutputSchema,
  }),
];
