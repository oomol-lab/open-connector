import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fellow";

const nullableNonEmptyString = (description: string) => s.nullable(s.nonEmptyString(description));

const paginationSchema = s.object(
  "Cursor pagination options accepted by Fellow list endpoints.",
  {
    cursor: nullableNonEmptyString("The pagination cursor returned by a previous Fellow response."),
    page_size: s.integer("The number of records to return per page. Fellow allows 1 to 50.", {
      minimum: 1,
      maximum: 50,
    }),
  },
  { optional: ["cursor", "page_size"] },
);

const pageInfoSchema = s.looseRequiredObject(
  "Pagination metadata returned by Fellow.",
  {
    cursor: nullableNonEmptyString("The cursor to use for the next page when available."),
    page_size: s.integer("The page size used by Fellow for this response."),
  },
  { optional: ["cursor"] },
);

const userInfoSchema = s.looseRequiredObject("Fellow user information.", {
  id: s.nonEmptyString("The Fellow user ID."),
  email: s.nonEmptyString("The Fellow user email address."),
  full_name: s.nonEmptyString("The Fellow user's full name."),
});

const workspaceInfoSchema = s.looseRequiredObject("Fellow workspace information.", {
  id: s.nonEmptyString("The Fellow workspace ID."),
  name: s.nonEmptyString("The Fellow workspace name."),
  subdomain: s.nonEmptyString("The Fellow workspace subdomain."),
});

const upstreamRecordSchema = s.unknownObject(
  "A Fellow API record. The object keeps the upstream fields returned by Fellow.",
);

const noteIncludeSchema = s.object(
  "Optional expensive fields Fellow can include in note list responses.",
  {
    event_attendees: s.boolean("Whether Fellow should include note event attendee emails."),
    content_markdown: s.boolean("Whether Fellow should include note markdown content."),
  },
  { optional: ["event_attendees", "content_markdown"] },
);

const noteFiltersSchema = s.object(
  "Filters accepted by Fellow when listing notes.",
  {
    event_guid: nullableNonEmptyString("Return notes for a specific event GUID."),
    created_at_start: nullableNonEmptyString("Return notes created at or after this datetime."),
    created_at_end: nullableNonEmptyString("Return notes created at or before this datetime."),
    updated_at_start: nullableNonEmptyString("Return notes updated at or after this datetime."),
    updated_at_end: nullableNonEmptyString("Return notes updated at or before this datetime."),
    channel_id: nullableNonEmptyString("Return notes from a specific Fellow channel ID."),
    title: nullableNonEmptyString("Return notes matching this title filter."),
    event_attendees: s.nullable(
      s.array("Event attendee emails used to filter Fellow notes.", s.nonEmptyString("An attendee email."), {
        minItems: 1,
      }),
    ),
  },
  {
    optional: [
      "event_guid",
      "created_at_start",
      "created_at_end",
      "updated_at_start",
      "updated_at_end",
      "channel_id",
      "title",
      "event_attendees",
    ],
  },
);

const actionItemFiltersSchema = s.object(
  "Filters accepted by Fellow when listing action items.",
  {
    completed: s.nullableBoolean("Whether to return completed action items."),
    archived: s.nullableBoolean("Whether to return archived action items."),
    ai_detected: s.nullableBoolean("Whether to return AI-detected action items."),
    ai_suggestion_accepted_by_user: s.nullableBoolean(
      "Whether to return action items whose AI suggestion was accepted.",
    ),
    scope: s.nullable(
      s.stringEnum("The Fellow action item scope filter.", ["assigned_to_me", "assigned_to_others", "all"]),
    ),
  },
  { optional: ["completed", "archived", "ai_detected", "ai_suggestion_accepted_by_user", "scope"] },
);

const actionItemOrderBySchema = s.nullable(
  s.stringEnum("The Fellow action item sort order.", ["created_at_desc", "created_at_asc", "due_date"]),
);

const listNotesInputSchema = s.object(
  "Input for listing Fellow notes with optional filters and cursor pagination.",
  {
    pagination: s.nullable(paginationSchema),
    include: s.nullable(noteIncludeSchema),
    filters: s.nullable(noteFiltersSchema),
  },
  { optional: ["pagination", "include", "filters"] },
);

const listActionItemsInputSchema = s.object(
  "Input for listing Fellow action items with optional filters, ordering, and cursor pagination.",
  {
    pagination: s.nullable(paginationSchema),
    include: s.nullable(s.unknownObject("Optional Fellow action item include options.")),
    order_by: actionItemOrderBySchema,
    filters: s.nullable(actionItemFiltersSchema),
  },
  { optional: ["pagination", "include", "order_by", "filters"] },
);

const paginatedNotesOutputSchema = s.object("Fellow notes list response.", {
  notes: s.looseRequiredObject("Paginated Fellow notes.", {
    page_info: pageInfoSchema,
    data: s.array("Fellow note records.", upstreamRecordSchema),
  }),
});

const paginatedActionItemsOutputSchema = s.object("Fellow action items list response.", {
  action_items: s.looseRequiredObject("Paginated Fellow action items.", {
    page_info: pageInfoSchema,
    data: s.array("Fellow action item records.", upstreamRecordSchema),
  }),
});

const noteOutputSchema = s.object("Fellow note response.", {
  note: upstreamRecordSchema,
});

const actionItemOutputSchema = s.object("Fellow action item response.", {
  action_item: upstreamRecordSchema,
});

export const fellowActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Fellow user and workspace associated with the current API key.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: s.object("Fellow authenticated user response.", {
      user: userInfoSchema,
      workspace: workspaceInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_notes",
    description: "List Fellow meeting notes with optional filters, includes, and pagination.",
    inputSchema: listNotesInputSchema,
    outputSchema: paginatedNotesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_note",
    description: "Retrieve one Fellow meeting note by ID.",
    inputSchema: s.object("Input for retrieving a Fellow note.", {
      note_id: s.nonEmptyString("The Fellow note ID."),
    }),
    outputSchema: noteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_action_items",
    description: "List Fellow action items with optional filters, ordering, and pagination.",
    inputSchema: listActionItemsInputSchema,
    outputSchema: paginatedActionItemsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_action_item",
    description: "Retrieve one Fellow action item by ID.",
    inputSchema: s.object("Input for retrieving a Fellow action item.", {
      action_item_id: s.nonEmptyString("The Fellow action item ID."),
    }),
    outputSchema: actionItemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "mark_action_item_complete",
    description: "Mark a Fellow action item complete or incomplete.",
    inputSchema: s.object("Input for marking a Fellow action item complete or incomplete.", {
      action_item_id: s.nonEmptyString("The Fellow action item ID."),
      completed: s.boolean("Whether the Fellow action item should be marked complete."),
    }),
    outputSchema: actionItemOutputSchema,
  }),
  defineProviderAction(service, {
    name: "archive_action_item",
    description: "Archive a Fellow action item by marking it as won't do.",
    inputSchema: s.object("Input for archiving a Fellow action item.", {
      action_item_id: s.nonEmptyString("The Fellow action item ID."),
    }),
    outputSchema: actionItemOutputSchema,
  }),
];
