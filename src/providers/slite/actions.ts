import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "slite";

const reviewStates = ["Verified", "Outdated", "VerificationRequested", "VerificationExpired"];
const noteFormats = ["md", "html", "sliteml"];
const listNotesOrderBy = ["lastEditedAt_DESC", "lastEditedAt_ASC", "listPosition_DESC", "listPosition_ASC"];
const searchNoteTypes = ["rich_text", "collection", "discussion"];

const reviewStateSchema = s.stringEnum("The Slite review state filter.", reviewStates);
const noteOwnerSchema = s.object(
  "The review owner metadata attached to a note when Slite returns it.",
  {
    userId: s.nullableString("The user owner identifier when the note is owned by a user."),
    groupId: s.nullableString("The group owner identifier when the note is owned by a group."),
  },
  { optional: ["userId", "groupId"] },
);

const noteSummaryFields = {
  id: s.nonEmptyString("The Slite note identifier."),
  title: s.string("The Slite note title."),
  url: s.nonEmptyString("The absolute Slite URL for the note."),
  createdAt: s.dateTime("The ISO timestamp when the note was created."),
  updatedAt: s.dateTime("The ISO timestamp when the note metadata was last updated."),
  lastEditedAt: s.dateTime("The ISO timestamp when the note content was last edited."),
  parentNoteId: s.nullableString("The parent note identifier, or null when the note is at the root level."),
  archivedAt: s.nullable(s.dateTime("The ISO timestamp when the note was archived, or null when it is active.")),
  attributes: s.nullable(
    s.stringArray("The collection attribute values attached to the note when Slite returns them."),
  ),
  columns: s.nullable(s.stringArray("The collection column names attached to the note when Slite returns them.")),
  iconColor: s.nullableString("The optional icon color returned by Slite."),
  iconShape: s.nullableString("The optional icon identifier returned by Slite."),
  owner: s.nullable(noteOwnerSchema),
  reviewState: s.nullable(reviewStateSchema),
};

const noteSummarySchema = s.object(
  "The stable Slite note summary returned by note listing and mutation endpoints.",
  noteSummaryFields,
);
const noteWithContentSchema = s.object(
  "The stable Slite note payload returned when reading a single note with content.",
  {
    ...noteSummaryFields,
    content: s.string("The note content returned in the requested Slite format."),
  },
);

const parentSearchNoteSchema = s.object("One parent note breadcrumb entry returned by Slite search.", {
  id: s.nonEmptyString("The parent note identifier."),
  title: s.string("The parent note title."),
});

const searchHitSchema = s.object("One normalized Slite search hit.", {
  id: s.nonEmptyString("The Slite note identifier."),
  title: s.string("The Slite note title."),
  type: s.stringEnum("The Slite note type returned by search.", searchNoteTypes),
  highlight: s.string("The excerpt that matched the search query."),
  updatedAt: s.dateTime("The ISO timestamp when the note metadata was last updated."),
  lastEditedAt: s.dateTime("The ISO timestamp when the note content was last edited."),
  archivedAt: s.nullable(s.dateTime("The ISO timestamp when the note was archived, or null when it is active.")),
  iconColor: s.nullableString("The optional icon color returned by Slite."),
  iconShape: s.nullableString("The optional icon identifier returned by Slite."),
  parentNotes: s.array("The parent note breadcrumb trail returned by Slite search.", parentSearchNoteSchema),
  reviewState: s.nullable(reviewStateSchema),
});

const groupSchema = s.object("The normalized Slite group object.", {
  id: s.nonEmptyString("The Slite group identifier."),
  name: s.string("The Slite group name."),
  description: s.string("The Slite group description."),
});

const listNotesInputSchema = s.object(
  "Input parameters for listing Slite notes with optional owner, parent, order, and cursor filters.",
  {
    ownerId: s.nonEmptyString("Optional Slite user identifier used to filter notes by owner."),
    parentNoteId: s.nonEmptyString("Optional Slite parent note identifier used to list direct child notes."),
    orderBy: s.stringEnum("The ordering applied to the returned notes.", listNotesOrderBy),
    cursor: s.nonEmptyString("Optional pagination cursor returned by a previous list_notes call."),
  },
  { optional: ["ownerId", "parentNoteId", "orderBy", "cursor"] },
);

const createNoteInputSchema = s.object(
  "Input parameters for creating a Slite note with markdown or HTML content.",
  {
    title: s.nonEmptyString("The title of the note to create."),
    parentNoteId: s.nonEmptyString(
      "Optional parent note identifier. When omitted, Slite creates the note in the personal channel.",
    ),
    templateId: s.nonEmptyString("Optional Slite template identifier to apply to the new note."),
    markdown: s.nonEmptyString("Optional Markdown content used to populate the new note."),
    html: s.nonEmptyString("Optional HTML content used to populate the new note."),
    attributes: s.array(
      "Optional collection attribute values ordered by the parent collection columns.",
      s.nullable(s.nonEmptyString("One collection attribute value, or null to leave a column empty.")),
    ),
  },
  { optional: ["parentNoteId", "templateId", "markdown", "html", "attributes"] },
);

const updateNoteInputSchema = s.object(
  "Input parameters for updating a Slite note title, content, or collection attributes.",
  {
    noteId: s.nonEmptyString("The Slite note identifier to update."),
    title: s.nonEmptyString("The new title for the note."),
    markdown: s.nonEmptyString("The new Markdown content for the note."),
    html: s.nonEmptyString("The new HTML content for the note."),
    attributes: s.array(
      "The replacement collection attribute values ordered by the parent collection columns.",
      s.nullable(s.nonEmptyString("One collection attribute value, or null to clear a column.")),
    ),
  },
  { optional: ["title", "markdown", "html", "attributes"] },
);

const searchNotesInputSchema = s.object(
  "Input parameters for searching Slite notes.",
  {
    query: s.string("The free-text query used to search notes."),
    parentNoteId: s.nonEmptyString("Optional parent note identifier used to restrict search to a subtree."),
    depth: s.number("Optional note depth filter applied by Slite.", { minimum: 0 }),
    reviewState: reviewStateSchema,
    page: s.integer("The zero-based results page to request from Slite.", { minimum: 0 }),
    hitsPerPage: s.integer("The number of hits to request per page.", { minimum: 1, maximum: 100 }),
    highlightPreTag: s.string("Optional HTML tag inserted before highlighted matches."),
    highlightPostTag: s.string("Optional HTML tag inserted after highlighted matches."),
    lastEditedAfter: s.dateTime("Optional ISO timestamp used to restrict results to notes edited after this moment."),
    lastUpdatedAfter: s.dateTime("Optional ISO timestamp used to restrict results to notes updated after this moment."),
    includeArchived: s.boolean("Whether Slite should include archived notes in the search results."),
  },
  {
    optional: [
      "query",
      "parentNoteId",
      "depth",
      "reviewState",
      "page",
      "hitsPerPage",
      "highlightPreTag",
      "highlightPostTag",
      "lastEditedAfter",
      "lastUpdatedAfter",
      "includeArchived",
    ],
  },
);

export const sliteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_notes",
    description: "List Slite notes with optional owner, parent, ordering, and pagination filters.",
    inputSchema: listNotesInputSchema,
    outputSchema: s.object("The paginated Slite note list response.", {
      hasNextPage: s.boolean("Whether Slite has another page of notes to fetch."),
      nextCursor: s.nullableString("The cursor for the next page, or null when finished."),
      total: s.number("The total number of notes matching the query."),
      notes: s.array("The note summaries returned by Slite.", noteSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_note",
    description: "Read one Slite note and return its content in Markdown, HTML, or SliteML.",
    inputSchema: s.object(
      "Input parameters for reading one Slite note.",
      {
        noteId: s.nonEmptyString("The Slite note identifier to fetch."),
        format: s.stringEnum("The content format Slite should return.", noteFormats),
      },
      { optional: ["format"] },
    ),
    outputSchema: noteWithContentSchema,
  }),
  defineProviderAction(service, {
    name: "create_note",
    description: "Create a Slite note with markdown or HTML content and optional collection attributes.",
    inputSchema: createNoteInputSchema,
    outputSchema: noteSummarySchema,
  }),
  defineProviderAction(service, {
    name: "update_note",
    description: "Update a Slite note title, body content, or collection attributes.",
    inputSchema: updateNoteInputSchema,
    outputSchema: noteSummarySchema,
  }),
  defineProviderAction(service, {
    name: "delete_note",
    description: "Delete a Slite note and its children by note identifier.",
    inputSchema: s.object("Input parameters for deleting a Slite note.", {
      noteId: s.nonEmptyString("The Slite note identifier to delete."),
    }),
    outputSchema: s.object("The normalized result returned after deleting a Slite note.", {
      success: s.boolean("Whether the note deletion request completed successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_notes",
    description: "Search Slite notes by query string and optional review, depth, archive, and date filters.",
    inputSchema: searchNotesInputSchema,
    outputSchema: s.object("The normalized Slite note search response.", {
      nbPages: s.number("The total number of pages returned by Slite for the current search."),
      page: s.number("The current results page returned by Slite."),
      hits: s.array("The matching note hits returned by Slite.", searchHitSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_groups",
    description: "Search Slite groups by name and return cursor-based pagination metadata.",
    inputSchema: s.object(
      "Input parameters for searching Slite groups.",
      {
        query: s.nonEmptyString("The group name query string to match."),
        cursor: s.nonEmptyString("Optional pagination cursor returned by Slite group search."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.object("The normalized Slite group search response.", {
      groups: s.array("The groups returned by Slite for the current query.", groupSchema),
      total: s.number("The total number of matching Slite groups."),
      hasNextPage: s.boolean("Whether Slite has another page of groups to fetch."),
      nextCursor: s.nullableString("The cursor for the next group page, or null when finished."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Read one Slite group by identifier.",
    inputSchema: s.object("Input parameters for reading one Slite group.", {
      groupId: s.nonEmptyString("The Slite group identifier to fetch."),
    }),
    outputSchema: groupSchema,
  }),
];
