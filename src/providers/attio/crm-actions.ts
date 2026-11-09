import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const limitSchema = s.integer("Maximum number of results to return.", { minimum: 1 });
const offsetSchema = s.integer("Number of results to skip.", { minimum: 0 });
const cursorSchema = s.string("Pagination cursor from the previous response.");
const archivedSchema = s.boolean("Whether to include archived results.");
const objectSchema = s.string("Object UUID or API slug.", { minLength: 1 });
const listSchema = s.string("List UUID or API slug.", { minLength: 1 });
const recordIdSchema = s.uuid("Record UUID.");
const entryIdSchema = s.uuid("List entry UUID.");
const attributeSchema = s.string("Attribute UUID or API slug.", { minLength: 1 });
const filterSchema = s.looseObject("Attio filter. Cannot be combined with filterViewId.");
const filterViewSchema = s.uuid("Saved view whose filters are applied; sorting and pagination remain independent.");

const sortsSchema = s.array(
  "Attio sort definitions, by attribute or path.",
  s.looseObject("Sort definition with direction, attribute or path, and optional field."),
);

const entryValuesSchema = s.looseObject(
  "Entry attribute values keyed by attribute slug or ID, using Attio value shapes.",
);

const modeSchema = s.stringEnum("How to update multiselect values; defaults to append_multiselect.", [
  "append_multiselect",
  "overwrite_multiselect",
]);

const contentSchema = s.string("Text content.");

const noteFormatSchema = s.stringEnum("Note content format; defaults to plaintext when writing content.", [
  "plaintext",
  "markdown",
]);

const titleSchema = s.string("Plaintext note title.");
const createdAtSchema = s.string("Creation timestamp for backdating; cannot be before 1970 or in the future.");
const deadlineSchema = s.nullable(s.string("Task deadline in ISO 8601 format; null removes the deadline."));
const completedSchema = s.boolean("Whether the task is completed.");

const linkedRecordsSchema = s.anyOf(
  "Records linked by email/domain strings, or objects containing target_object and target_record_id or a matching attribute. Empty array clears links.",
  [
    s.array("Email addresses or company domains.", s.string("Email address or company domain.")),
    s.array(
      "Record references.",
      s.object(
        "Record ID or matching attribute reference.",
        { target_object: objectSchema },
        { additionalProperties: true, minProperties: 2, required: ["target_object"] },
      ),
    ),
  ],
);

const assigneesSchema = s.array(
  "Workspace members assigned to the task. Empty array clears assignments.",
  s.anyOf("Assignee identified by actor ID or workspace member email.", [
    s.object(
      "Workspace member actor.",
      {
        referenced_actor_type: s.stringEnum("Actor type.", ["workspace-member"]),
        referenced_actor_id: s.uuid("Workspace member UUID."),
      },
      { optional: [] },
    ),
    s.object(
      "Workspace member email reference.",
      {
        workspace_member_email_address: s.string("Workspace member email address.", {
          format: "email",
        }),
      },
      { optional: [] },
    ),
  ]),
);

const rawResourceSchema = s.looseObject("Attio resource, including provider-specific fields.");

const cursorPageSchema = s.nullable(
  s.object(
    "Cursor pagination returned by Attio.",
    {
      next_cursor: s.nullable(s.string("Cursor for the next page, or null at the end.")),
    },
    { optional: [] },
  ),
);

const deleteOutputSchema = s.object(
  "Deletion acknowledgement.",
  {
    deleted: s.boolean("Whether deletion succeeded."),
  },
  { optional: [] },
);

const requestAsSchema = s.anyOf("Search context; defaults to the workspace. Optionally restrict to a member.", [
  s.object("Workspace search.", { type: s.stringEnum("Search actor type.", ["workspace"]) }, { optional: [] }),
  s.object(
    "Member search by ID.",
    {
      type: s.stringEnum("Search actor type.", ["workspace-member"]),
      workspace_member_id: s.uuid("Workspace member UUID."),
    },
    { optional: [] },
  ),
  s.object(
    "Member search by email.",
    {
      type: s.stringEnum("Search actor type.", ["workspace-member"]),
      email_address: s.string("Member email address.", { format: "email" }),
    },
    { optional: [] },
  ),
]);

export const attioCrmActions: ActionDefinition[] = [
  defineProviderAction("attio", {
    name: "search_records",
    description: "Search records across selected objects by name, email, domain, phone or social handle.",
    operationType: "read",
    requiredScopes: ["record_permission:read", "object_configuration:read"],
    inputSchema: s.object(
      "Input for search_records.",
      {
        query: s.string("Search text; an empty string returns default results.", {
          maxLength: 256,
        }),
        objects: s.array("Objects to search.", objectSchema, { minItems: 1 }),
        requestAs: requestAsSchema,
        limit: s.integer("Maximum search results, from 1 to 25.", { minimum: 1, maximum: 25 }),
      },
      { optional: ["requestAs", "limit"] },
    ),
    outputSchema: s.object(
      "Result of search_records.",
      {
        records: s.array("Returned records.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "list_select_options",
    description:
      "List available options for an object, list or activity attribute. Requires the selected target configuration read scope.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for list_select_options.",
      {
        target: s.stringEnum("Attribute owner type.", ["objects", "lists", "activities"]),
        identifier: s.string("Object, list or activity UUID or slug.", { minLength: 1 }),
        attribute: attributeSchema,
        showArchived: archivedSchema,
      },
      { optional: ["showArchived"] },
    ),
    outputSchema: s.object(
      "Result of list_select_options.",
      {
        options: s.array("Returned options.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "list_statuses",
    description:
      "List available statuses for an object or list attribute. Requires the selected target configuration read scope.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for list_statuses.",
      {
        target: s.stringEnum("Attribute owner type.", ["objects", "lists"]),
        identifier: s.string("Object or list UUID or slug.", { minLength: 1 }),
        attribute: attributeSchema,
        showArchived: archivedSchema,
      },
      { optional: ["showArchived"] },
    ),
    outputSchema: s.object(
      "Result of list_statuses.",
      {
        statuses: s.array("Returned statuses.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "list_object_views",
    description: "List saved views and their filters for an Attio object.",
    operationType: "read",
    requiredScopes: ["object_configuration:read"],
    inputSchema: s.object(
      "Input for list_object_views.",
      {
        object: objectSchema,
        showArchived: archivedSchema,
        limit: s.integer("Maximum number of views, from 1 to 1000.", { minimum: 1, maximum: 1000 }),
        cursor: cursorSchema,
      },
      { optional: ["showArchived", "limit", "cursor"] },
    ),
    outputSchema: s.object(
      "Result of list_object_views.",
      {
        views: s.array("Returned views.", rawResourceSchema),
        pagination: cursorPageSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "list_list_views",
    description: "List saved views and their filters for an Attio list.",
    operationType: "read",
    requiredScopes: ["list_configuration:read"],
    inputSchema: s.object(
      "Input for list_list_views.",
      {
        list: listSchema,
        showArchived: archivedSchema,
        limit: s.integer("Maximum number of views, from 1 to 1000.", { minimum: 1, maximum: 1000 }),
        cursor: cursorSchema,
      },
      { optional: ["showArchived", "limit", "cursor"] },
    ),
    outputSchema: s.object(
      "Result of list_list_views.",
      {
        views: s.array("Returned views.", rawResourceSchema),
        pagination: cursorPageSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "list_lists",
    description: "List all lists in the workspace.",
    operationType: "read",
    requiredScopes: ["list_configuration:read"],
    inputSchema: s.object("Input for list_lists.", {}, { optional: [] }),
    outputSchema: s.object(
      "Result of list_lists.",
      {
        lists: s.array("Returned lists.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "get_list",
    description: "Get a list by ID or slug.",
    operationType: "read",
    requiredScopes: ["list_configuration:read"],
    inputSchema: s.object("Input for get_list.", { list: listSchema }, { optional: [] }),
    outputSchema: s.object("Result of get_list.", { list: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "list_record_entries",
    description: "List the list entries belonging to a record.",
    operationType: "read",
    requiredScopes: ["record_permission:read", "object_configuration:read", "list_entry:read"],
    inputSchema: s.object(
      "Input for list_record_entries.",
      {
        object: objectSchema,
        recordId: recordIdSchema,
        limit: s.integer("Maximum results, up to 1000.", { minimum: 1, maximum: 1000 }),
        offset: offsetSchema,
      },
      { optional: ["limit", "offset"] },
    ),
    outputSchema: s.object(
      "Result of list_record_entries.",
      {
        entries: s.array("Returned entries.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "list_entries",
    description: "Query entries in a list with filters, sorting and offset pagination.",
    operationType: "read",
    requiredScopes: ["list_entry:read", "list_configuration:read"],
    inputSchema: s.object(
      "Input for list_entries.",
      {
        list: listSchema,
        filter: filterSchema,
        filterViewId: filterViewSchema,
        sorts: sortsSchema,
        limit: limitSchema,
        offset: offsetSchema,
      },
      {
        optional: ["filter", "filterViewId", "sorts", "limit", "offset"],
        not: { required: ["filter", "filterViewId"] },
      },
    ),
    outputSchema: s.object(
      "Result of list_entries.",
      {
        entries: s.array("Returned entries.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "get_entry",
    description: "Get a list entry and its attribute values.",
    operationType: "read",
    requiredScopes: ["list_entry:read", "list_configuration:read"],
    inputSchema: s.object("Input for get_entry.", { list: listSchema, entryId: entryIdSchema }, { optional: [] }),
    outputSchema: s.object("Result of get_entry.", { entry: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "create_entry",
    description: "Create a list entry.",
    operationType: "write",
    requiredScopes: ["list_entry:read-write", "list_configuration:read"],
    inputSchema: s.object(
      "Input for create_entry.",
      {
        list: listSchema,
        parentObject: objectSchema,
        parentRecordId: recordIdSchema,
        entryValues: entryValuesSchema,
      },
      { optional: ["entryValues"] },
    ),
    outputSchema: s.object("Result of create_entry.", { entry: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "upsert_entry",
    description:
      "Create or update a list entry by its parent record; supplied multiselect values overwrite existing values.",
    operationType: "write",
    requiredScopes: ["list_entry:read-write", "list_configuration:read"],
    inputSchema: s.object(
      "Input for upsert_entry.",
      {
        list: listSchema,
        parentObject: objectSchema,
        parentRecordId: recordIdSchema,
        entryValues: entryValuesSchema,
      },
      { optional: ["entryValues"] },
    ),
    outputSchema: s.object("Result of upsert_entry.", { entry: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "update_entry",
    description: "Update list entry values, appending or overwriting multiselect values.",
    operationType: "write",
    requiredScopes: ["list_entry:read-write", "list_configuration:read"],
    inputSchema: s.object(
      "Input for update_entry.",
      {
        list: listSchema,
        entryId: entryIdSchema,
        entryValues: entryValuesSchema,
        mode: modeSchema,
      },
      { optional: ["mode"] },
    ),
    outputSchema: s.object("Result of update_entry.", { entry: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "delete_entry",
    description: "Remove a list entry without deleting its parent record.",
    operationType: "destructive",
    requiredScopes: ["list_entry:read-write", "list_configuration:read"],
    inputSchema: s.object("Input for delete_entry.", { list: listSchema, entryId: entryIdSchema }, { optional: [] }),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction("attio", {
    name: "list_notes",
    description: "List notes, optionally filtered by parent record.",
    operationType: "read",
    requiredScopes: ["note:read", "record_permission:read", "object_configuration:read"],
    inputSchema: s.object(
      "Input for list_notes.",
      {
        parentObject: objectSchema,
        parentRecordId: recordIdSchema,
        limit: s.integer("Maximum notes, up to 50.", { minimum: 1, maximum: 50 }),
        offset: offsetSchema,
      },
      { optional: ["parentObject", "parentRecordId", "limit", "offset"] },
    ),
    outputSchema: s.object(
      "Result of list_notes.",
      {
        notes: s.array("Returned notes.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "create_note",
    description: "Create a plaintext or Markdown note on a record.",
    operationType: "write",
    requiredScopes: ["note:read-write", "record_permission:read", "object_configuration:read"],
    inputSchema: s.object(
      "Input for create_note.",
      {
        parentObject: objectSchema,
        parentRecordId: recordIdSchema,
        title: titleSchema,
        content: contentSchema,
        format: noteFormatSchema,
        createdAt: createdAtSchema,
        meetingId: s.nullable(s.uuid("Optional meeting UUID; null means no meeting.")),
      },
      { optional: ["format", "createdAt", "meetingId"] },
    ),
    outputSchema: s.object("Result of create_note.", { note: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "get_note",
    description: "Get a note.",
    operationType: "read",
    requiredScopes: ["note:read", "record_permission:read", "object_configuration:read"],
    inputSchema: s.object("Input for get_note.", { noteId: s.uuid("Note UUID.") }, { optional: [] }),
    outputSchema: s.object("Result of get_note.", { note: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "delete_note",
    description: "Delete a note.",
    operationType: "destructive",
    requiredScopes: ["note:read-write"],
    inputSchema: s.object("Input for delete_note.", { noteId: s.uuid("Note UUID.") }, { optional: [] }),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction("attio", {
    name: "update_note",
    description: "Update note title or content; content is replaced when supplied.",
    operationType: "write",
    requiredScopes: ["note:read-write", "record_permission:read", "object_configuration:read"],
    inputSchema: s.object(
      "Input for update_note.",
      {
        noteId: s.uuid("Note UUID."),
        title: titleSchema,
        content: contentSchema,
        format: noteFormatSchema,
      },
      {
        optional: ["title", "content", "format"],
        minProperties: 2,
      },
    ),
    outputSchema: s.object("Result of update_note.", { note: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "list_tasks",
    description: "List tasks filtered by completion, assignee or linked record.",
    operationType: "read",
    requiredScopes: ["task:read", "record_permission:read", "object_configuration:read", "user_management:read"],
    inputSchema: s.object(
      "Input for list_tasks.",
      {
        limit: limitSchema,
        offset: offsetSchema,
        sort: s.stringEnum("Task sort order.", [
          "created_at:asc",
          "created_at:desc",
          "completed_at:asc",
          "completed_at:desc",
        ]),
        linkedObject: objectSchema,
        linkedRecordId: recordIdSchema,
        assignee: s.nullable(s.string("Member ID or email; null or an empty string finds unassigned tasks.")),
        isCompleted: completedSchema,
      },
      {
        optional: ["limit", "offset", "sort", "linkedObject", "linkedRecordId", "assignee", "isCompleted"],
        dependentRequired: { linkedObject: ["linkedRecordId"], linkedRecordId: ["linkedObject"] },
      },
    ),
    outputSchema: s.object(
      "Result of list_tasks.",
      {
        tasks: s.array("Returned tasks.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "create_task",
    description: "Create a follow-up task. Defaults to incomplete, without deadline, linked records or assignees.",
    operationType: "write",
    requiredScopes: ["task:read-write", "record_permission:read", "object_configuration:read", "user_management:read"],
    inputSchema: s.object(
      "Input for create_task.",
      {
        content: s.string("Plaintext task content, at most 2000 characters.", { maxLength: 2000 }),
        deadlineAt: deadlineSchema,
        isCompleted: completedSchema,
        linkedRecords: linkedRecordsSchema,
        assignees: assigneesSchema,
      },
      { optional: ["deadlineAt", "isCompleted", "linkedRecords", "assignees"] },
    ),
    outputSchema: s.object("Result of create_task.", { task: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "get_task",
    description: "Get a task.",
    operationType: "read",
    requiredScopes: ["task:read", "record_permission:read", "object_configuration:read", "user_management:read"],
    inputSchema: s.object("Input for get_task.", { taskId: s.uuid("Task UUID.") }, { optional: [] }),
    outputSchema: s.object("Result of get_task.", { task: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "delete_task",
    description: "Delete a task.",
    operationType: "destructive",
    requiredScopes: ["task:read-write"],
    inputSchema: s.object("Input for delete_task.", { taskId: s.uuid("Task UUID.") }, { optional: [] }),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction("attio", {
    name: "update_task",
    description:
      "Update task completion, deadline, linked records or assignees. Attio does not support editing task content.",
    operationType: "write",
    requiredScopes: ["task:read-write", "record_permission:read", "object_configuration:read", "user_management:read"],
    inputSchema: s.object(
      "Input for update_task.",
      {
        taskId: s.uuid("Task UUID."),
        deadlineAt: deadlineSchema,
        isCompleted: completedSchema,
        linkedRecords: linkedRecordsSchema,
        assignees: assigneesSchema,
      },
      { optional: ["deadlineAt", "isCompleted", "linkedRecords", "assignees"], minProperties: 2 },
    ),
    outputSchema: s.object("Result of update_task.", { task: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "list_workspace_members",
    description: "List workspace members to resolve task assignees and comment authors.",
    operationType: "read",
    requiredScopes: ["user_management:read"],
    inputSchema: s.object("Input for list_workspace_members.", {}, { optional: [] }),
    outputSchema: s.object(
      "Result of list_workspace_members.",
      {
        members: s.array("Returned members.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "get_workspace_member",
    description: "Get a workspace member.",
    operationType: "read",
    requiredScopes: ["user_management:read"],
    inputSchema: s.object(
      "Input for get_workspace_member.",
      {
        memberId: s.uuid("Workspace member UUID."),
      },
      { optional: [] },
    ),
    outputSchema: s.object("Result of get_workspace_member.", { member: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "list_threads",
    description: "List discussion threads, optionally filtered by record or list entry.",
    operationType: "read",
    requiredScopes: ["comment:read"],
    inputSchema: s.object(
      "Input for list_threads.",
      {
        object: objectSchema,
        recordId: recordIdSchema,
        list: listSchema,
        entryId: entryIdSchema,
        limit: s.integer("Maximum threads, up to 50.", { minimum: 1, maximum: 50 }),
        offset: offsetSchema,
      },
      {
        optional: ["object", "recordId", "list", "entryId", "limit", "offset"],
        dependentRequired: {
          object: ["recordId"],
          recordId: ["object"],
          list: ["entryId"],
          entryId: ["list"],
        },
      },
    ),
    outputSchema: s.object(
      "Result of list_threads.",
      {
        threads: s.array("Returned threads.", rawResourceSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "get_thread",
    description: "Get a thread and paginate its comments.",
    operationType: "read",
    requiredScopes: ["comment:read"],
    inputSchema: s.object(
      "Input for get_thread.",
      {
        threadId: s.uuid("Thread UUID."),
        limit: s.integer("Maximum comments, up to 250.", { minimum: 1, maximum: 250 }),
        cursor: cursorSchema,
        createdAfter: s.nullable(
          s.string("Only return comments created after this timestamp; null applies no time filter."),
        ),
      },
      { optional: ["limit", "cursor", "createdAfter"] },
    ),
    outputSchema: s.object(
      "Result of get_thread.",
      {
        thread: rawResourceSchema,
        pagination: cursorPageSchema,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("attio", {
    name: "create_comment",
    description:
      "Create a plaintext comment on a record or entry, or reply to a thread. Requires an explicit workspace member author.",
    operationType: "write",
    requiredScopes: ["comment:read-write"],
    inputSchema: s.object(
      "Input for create_comment.",
      {
        content: contentSchema,
        authorId: s.uuid("Workspace member UUID to attribute the comment to."),
        createdAt: createdAtSchema,
        threadId: s.uuid("Thread UUID to reply to."),
        record: s.object(
          "Record to comment on.",
          {
            object: objectSchema,
            record_id: recordIdSchema,
          },
          { optional: [] },
        ),
        entry: s.object("Entry to comment on.", { list: listSchema, entry_id: entryIdSchema }, { optional: [] }),
      },
      {
        optional: ["createdAt", "threadId", "record", "entry"],
        oneOf: [{ required: ["threadId"] }, { required: ["record"] }, { required: ["entry"] }],
      },
    ),
    outputSchema: s.object("Result of create_comment.", { comment: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "get_comment",
    description: "Get a comment.",
    operationType: "read",
    requiredScopes: ["comment:read"],
    inputSchema: s.object("Input for get_comment.", { commentId: s.uuid("Comment UUID.") }, { optional: [] }),
    outputSchema: s.object("Result of get_comment.", { comment: rawResourceSchema }, { optional: [] }),
  }),
  defineProviderAction("attio", {
    name: "delete_comment",
    description: "Delete a comment.",
    operationType: "destructive",
    requiredScopes: ["comment:read-write"],
    inputSchema: s.object("Input for delete_comment.", { commentId: s.uuid("Comment UUID.") }, { optional: [] }),
    outputSchema: deleteOutputSchema,
  }),
] as const;
