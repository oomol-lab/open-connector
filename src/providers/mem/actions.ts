import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mem";

const requestIdSchema = s.nonEmptyString("Identifier for the Mem API request.");
const noteIdSchema = s.uuid("UUID of the Mem note.");
const collectionIdsSchema = s.array("Collection UUIDs associated with the note.", s.uuid("A Mem collection UUID."));
const audioRecordingIdsSchema = s.array(
  "Audio recording UUIDs associated with the note.",
  s.uuid("A Mem audio recording UUID."),
);

const noteListItemSchema = s.looseRequiredObject(
  "A note summary returned by Mem.",
  {
    id: noteIdSchema,
    title: s.string("Current title of the note."),
    content: s.nullableString("Full markdown content when the request includes note content."),
    collection_ids: collectionIdsSchema,
    audio_recording_ids: audioRecordingIdsSchema,
    snippet: s.nullableString("Derived preview text for the note."),
    created_at: s.dateTime("Creation timestamp for the note."),
    updated_at: s.dateTime("Last modification timestamp for the note."),
  },
  { optional: ["content", "snippet"] },
);

const noteWriteResponseProperties = {
  request_id: requestIdSchema,
  id: noteIdSchema,
  title: s.string("Current title of the note."),
  content: s.string("Full markdown content stored for the note."),
  version: s.integer("Current note content document version.", { minimum: 1 }),
  collection_ids: collectionIdsSchema,
  created_at: s.dateTime("Creation timestamp for the note."),
  updated_at: s.dateTime("Last modification timestamp for the note."),
};
const noteWriteResponseSchema = s.object("A note returned after a Mem write operation.", noteWriteResponseProperties, {
  required: Object.keys(noteWriteResponseProperties),
  additionalProperties: true,
});

const attachmentMetadataSchema = s.looseRequiredObject(
  "Compact metadata for an attachment embedded in a note.",
  {
    attachment_kind: s.stringEnum("The attachment kind.", ["pdf", "image"]),
    attachment_id: s.uuid("UUID of the note attachment."),
    page_count: s.nullableInteger("Number of pages for a PDF attachment."),
    summary: s.nullableString("Extracted summary for the attachment."),
    suggested_search: s.nullableString("Suggested query for searching within the attachment."),
    ocr_text: s.nullableString("Extracted OCR text for an image attachment."),
    visual_description: s.nullableString("Visual description for an image attachment."),
    image_type: s.nullableString("Detected image type for an image attachment."),
  },
  {
    optional: ["page_count", "summary", "suggested_search", "ocr_text", "visual_description", "image_type"],
  },
);

const fullNoteResponseProperties = {
  request_id: requestIdSchema,
  id: noteIdSchema,
  title: s.string("Current title of the note."),
  content: s.string("Full markdown content stored for the note."),
  version: s.integer("Current note content document version.", { minimum: 1 }),
  collection_ids: collectionIdsSchema,
  audio_recording_ids: audioRecordingIdsSchema,
  attachment_metadata: s.array("Compact metadata for attachments embedded in the note.", attachmentMetadataSchema),
  trashed_at: s.nullable(s.dateTime("Timestamp when the note was moved to trash, or null when active.")),
  created_at: s.dateTime("Creation timestamp for the note."),
  updated_at: s.dateTime("Last modification timestamp for the note."),
};
const fullNoteResponseSchema = s.object("The full current state of a Mem note.", fullNoteResponseProperties, {
  required: Object.keys(fullNoteResponseProperties),
  additionalProperties: true,
});

const updatedNoteResponseProperties = {
  request_id: requestIdSchema,
  id: noteIdSchema,
  title: s.string("Current title of the note after the update."),
  content: s.string("Full markdown content stored after the update."),
  version: s.integer("Current note content document version after the update.", { minimum: 1 }),
  collection_ids: collectionIdsSchema,
  trashed_at: s.nullable(s.dateTime("Timestamp when the note was moved to trash, or null when active.")),
  created_at: s.dateTime("Creation timestamp for the note."),
  updated_at: s.dateTime("Last modification timestamp after the update."),
};
const updatedNoteResponseSchema = s.object(
  "The current state of a Mem note after an update.",
  updatedNoteResponseProperties,
  { required: Object.keys(updatedNoteResponseProperties), additionalProperties: true },
);

const lifecycleResponseSchema = s.object(
  "The acknowledgement returned by a Mem note lifecycle operation.",
  { request_id: requestIdSchema },
  { required: ["request_id"], additionalProperties: true },
);

const createNoteAction = defineProviderAction(service, {
  name: "create_note",
  operationType: "write",
  description: "Create a Mem note from a complete markdown body and optional collection links.",
  inputSchema: s.object(
    "The markdown body and optional metadata for a new Mem note.",
    {
      id: s.nullable(s.uuid("Optional caller-provided UUID for the note.")),
      content: s.string("Full markdown body; the first line becomes the note title.", {
        maxLength: 200000,
      }),
      collection_ids: s.nullable(collectionIdsSchema),
      collection_titles: s.nullable(
        s.array(
          "Collection titles matched case-insensitively by exact title.",
          s.string("A Mem collection title.", { maxLength: 1000 }),
        ),
      ),
      created_at: s.nullable(s.dateTime("Optional creation timestamp for the note.")),
      updated_at: s.nullable(s.dateTime("Optional initial update timestamp for the note.")),
    },
    { optional: ["id", "collection_ids", "collection_titles", "created_at", "updated_at"] },
  ),
  outputSchema: noteWriteResponseSchema,
});

const listNotesAction = defineProviderAction(service, {
  name: "list_notes",
  operationType: "read",
  description: "List Mem notes with cursor pagination, chronological ordering, and filters.",
  inputSchema: s.object(
    "Cursor pagination and filters for listing Mem notes.",
    {
      limit: s.nullable(s.integer("Maximum notes to return in this page.", { minimum: 1, maximum: 100 })),
      page: s.nullableString("Opaque cursor returned by a previous list response."),
      order_by: s.stringEnum("Timestamp used for chronological ordering.", ["created_at", "updated_at"]),
      collection_id: s.nullable(s.uuid("Collection UUID used to filter notes.")),
      filter_by_created_after: s.nullable(s.dateTime("Inclusive lower bound for note creation time.")),
      filter_by_created_before: s.nullable(s.dateTime("Inclusive upper bound for note creation time.")),
      filter_by_updated_after: s.nullable(s.dateTime("Inclusive lower bound for note update time.")),
      filter_by_updated_before: s.nullable(s.dateTime("Inclusive upper bound for note update time.")),
      contains_open_tasks: s.boolean("Whether to include notes containing an open task."),
      contains_tasks: s.boolean("Whether to include notes containing any task."),
      contains_images: s.boolean("Whether to include notes containing image media."),
      contains_files: s.boolean("Whether to include notes containing file-like attachments."),
      include_note_content: s.boolean("Whether each result should include full markdown content."),
    },
    {
      optional: [
        "limit",
        "page",
        "order_by",
        "collection_id",
        "filter_by_created_after",
        "filter_by_created_before",
        "filter_by_updated_after",
        "filter_by_updated_before",
        "contains_open_tasks",
        "contains_tasks",
        "contains_images",
        "contains_files",
        "include_note_content",
      ],
    },
  ),
  outputSchema: s.looseRequiredObject(
    "A cursor-paginated page of Mem note summaries.",
    {
      request_id: requestIdSchema,
      results: s.array("Notes in the current page.", noteListItemSchema),
      total: s.integer("Total matching notes before pagination.", { minimum: 0 }),
      next_page: s.nullableString("Opaque cursor for the next page of notes."),
    },
    { optional: ["next_page"] },
  ),
});

const readNoteAction = defineProviderAction(service, {
  name: "read_note",
  operationType: "read",
  description: "Read the full current state of one Mem note, including trash state.",
  inputSchema: s.requiredObject("The UUID of the Mem note to read.", {
    note_id: s.uuid("UUID of the target Mem note."),
  }),
  outputSchema: fullNoteResponseSchema,
});

const searchNotesAction = defineProviderAction(service, {
  name: "search_notes",
  operationType: "read",
  description: "Search Mem notes by relevance with filters and bounded snapshot pagination.",
  inputSchema: s.object(
    "Search query, filters, and bounded snapshot pagination settings.",
    {
      query: s.nonEmptyString("Free-text query used to search notes by relevance."),
      filter_by_collection_ids: s.nullable(
        s.array("Collection UUID filters; notes in any listed collection may match.", s.uuid("A Mem collection UUID.")),
      ),
      filter_by_created_after: s.nullable(s.dateTime("Inclusive lower bound for note creation time.")),
      filter_by_created_before: s.nullable(s.dateTime("Inclusive upper bound for note creation time.")),
      filter_by_updated_after: s.nullable(s.dateTime("Inclusive lower bound for note update time.")),
      filter_by_updated_before: s.nullable(s.dateTime("Inclusive upper bound for note update time.")),
      filter_by_contains_open_tasks: s.boolean("Whether to include notes containing an open task."),
      filter_by_contains_tasks: s.boolean("Whether to include notes containing any task."),
      filter_by_contains_images: s.boolean("Whether to include notes containing image media."),
      filter_by_contains_files: s.boolean("Whether to include notes containing file-like attachments."),
      config: s.object(
        "Flags controlling the search response payload.",
        { include_note_content: s.boolean("Whether search results should include full markdown content.") },
        { optional: ["include_note_content"] },
      ),
      limit: s.nullable(s.integer("Maximum notes to return in this search page.", { minimum: 1, maximum: 50 })),
      offset: s.integer("Zero-based number of matching notes to skip.", { minimum: 0 }),
      snapshot_id: s.nullable(s.uuid("Snapshot UUID returned by a previous search page.")),
    },
    {
      optional: [
        "filter_by_collection_ids",
        "filter_by_created_after",
        "filter_by_created_before",
        "filter_by_updated_after",
        "filter_by_updated_before",
        "filter_by_contains_open_tasks",
        "filter_by_contains_tasks",
        "filter_by_contains_images",
        "filter_by_contains_files",
        "config",
        "limit",
        "offset",
        "snapshot_id",
      ],
    },
  ),
  outputSchema: s.object(
    "A bounded relevance-ranked search page from Mem.",
    {
      request_id: requestIdSchema,
      results: s.array("Relevance-ranked note results.", noteListItemSchema),
      total: s.integer("Matching notes captured in the bounded search snapshot.", { minimum: 0 }),
      offset: s.integer("Zero-based offset applied to the search results.", { minimum: 0 }),
      limit: s.integer("Limit applied to the search page.", { minimum: 1, maximum: 50 }),
      has_next_page: s.boolean("Whether another page exists in this search snapshot."),
      snapshot_id: s.uuid("Snapshot UUID to reuse for deterministic later pages."),
    },
    {
      required: ["request_id", "results", "total", "offset", "limit", "has_next_page", "snapshot_id"],
      additionalProperties: true,
    },
  ),
});

const updateNoteAction = defineProviderAction(service, {
  name: "update_note",
  operationType: "destructive",
  description: "Replace a Mem note's markdown body using its exact current content version.",
  inputSchema: s.object(
    "The note UUID, complete replacement body, and optimistic concurrency version.",
    {
      note_id: s.uuid("UUID of the Mem note to update."),
      content: s.string("Complete replacement markdown body for the note.", { maxLength: 200000 }),
      version: s.integer("Exact current content document version.", { minimum: 1 }),
      updated_at: s.nullable(s.dateTime("Optional update timestamp for this write.")),
    },
    { optional: ["updated_at"] },
  ),
  outputSchema: updatedNoteResponseSchema,
});

const trashNoteAction = defineProviderAction(service, {
  name: "trash_note",
  operationType: "destructive",
  description: "Move a Mem note to trash so it can be restored later.",
  inputSchema: s.requiredObject("The UUID of the Mem note to move to trash.", {
    note_id: s.uuid("UUID of the target Mem note."),
  }),
  outputSchema: lifecycleResponseSchema,
});

const restoreNoteAction = defineProviderAction(service, {
  name: "restore_note",
  operationType: "write",
  description: "Restore a previously trashed Mem note to the active note set.",
  inputSchema: s.requiredObject("The UUID of the trashed Mem note to restore.", {
    note_id: s.uuid("UUID of the target Mem note."),
  }),
  outputSchema: lifecycleResponseSchema,
});

const deleteNoteAction = defineProviderAction(service, {
  name: "delete_note",
  operationType: "destructive",
  description: "Permanently delete a Mem note; this operation cannot be restored.",
  inputSchema: s.requiredObject("The UUID of the Mem note to permanently delete.", {
    note_id: s.uuid("UUID of the target Mem note."),
  }),
  outputSchema: lifecycleResponseSchema,
});

export const memActions: ActionDefinition[] = [
  createNoteAction,
  listNotesAction,
  readNoteAction,
  searchNotesAction,
  updateNoteAction,
  trashNoteAction,
  restoreNoteAction,
  deleteNoteAction,
];
