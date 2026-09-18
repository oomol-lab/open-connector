import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dart";

const taskIdSchema = s.string("The 12-character alphanumeric Dart task ID.", {
  minLength: 12,
  maxLength: 12,
  pattern: "^[a-zA-Z0-9]{12}$",
});
const prioritySchema = s.stringEnum("The Dart task priority.", ["Critical", "High", "Medium", "Low"]);
const nullablePrioritySchema = s.nullable(prioritySchema);
const nullableStringArraySchema = (description: string, itemDescription: string) =>
  s.nullable(s.array(description, s.string(itemDescription)));
const sizeSchema = s.anyOf("The task size as a workspace label or integer estimate.", [
  s.string("A workspace-defined task size label."),
  s.integer("An integer task size estimate."),
]);
const nullableSizeSchema = s.nullable(sizeSchema);
const customPropertyValueSchema = s.anyOf("A documented Dart custom property value.", [
  s.nullable(s.string("A text, date, select, status, user, or time-tracking value.")),
  s.nullable(s.number("A numeric custom property value.")),
  s.boolean("A checkbox custom property value."),
  s.array(
    "A date range, multiselect, or multi-user custom property value.",
    s.nullable(s.string("One custom property array value.")),
  ),
]);
const customPropertiesSchema = s.nullable(
  s.record("Custom properties keyed by the exact case-sensitive workspace property name.", customPropertyValueSchema),
);
const taskRelationshipsSchema = s.nullable(
  s.object(
    "Relationships between this task and other Dart tasks.",
    {
      subtaskIds: s.array("Task IDs that are subtasks of this task.", taskIdSchema),
      blockerIds: s.array("Task IDs that block this task.", taskIdSchema),
      blockingIds: s.array("Task IDs that this task blocks.", taskIdSchema),
      duplicateIds: s.array("Task IDs that duplicate this task.", taskIdSchema),
      relatedIds: s.array("Task IDs related to this task.", taskIdSchema),
    },
    {
      optional: ["subtaskIds", "blockerIds", "blockingIds", "duplicateIds", "relatedIds"],
    },
  ),
);

const taskMutationFields = {
  title: s.string("The short task title."),
  parentId: s.nullable(taskIdSchema),
  dartboard: s.string("The full title of the destination dartboard."),
  type: s.string("The workspace task type title."),
  status: s.string("The workspace task status title."),
  description: s.string("The task description, which may contain Markdown."),
  assignees: nullableStringArraySchema(
    "The names or emails assigned in multi-assignee workspaces.",
    "A Dart assignee name or email.",
  ),
  assignee: s.nullable(s.string("The name or email assigned in single-assignee workspaces.")),
  reviewers: nullableStringArraySchema(
    "The names or emails assigned as reviewers in multi-reviewer workspaces.",
    "A Dart reviewer name or email.",
  ),
  reviewer: s.nullable(s.string("The name or email assigned in single-reviewer workspaces.")),
  tags: s.array("The tags applied to the task.", s.string("A Dart tag.")),
  priority: nullablePrioritySchema,
  startAt: s.nullable(s.date("The task start date in YYYY-MM-DD format.")),
  dueAt: s.nullable(s.date("The task due date in YYYY-MM-DD format.")),
  size: nullableSizeSchema,
  customProperties: customPropertiesSchema,
  taskRelationships: taskRelationshipsSchema,
};

const createTaskItemSchema = s.object(
  "The task details wrapped by the official Dart create request.",
  taskMutationFields,
  {
    optional: [
      "parentId",
      "dartboard",
      "type",
      "status",
      "description",
      "assignees",
      "assignee",
      "reviewers",
      "reviewer",
      "tags",
      "priority",
      "startAt",
      "dueAt",
      "size",
      "customProperties",
      "taskRelationships",
    ],
  },
);

const updateTaskItemSchema = s.object(
  "The task ID and fields included in the official Dart update request.",
  { id: taskIdSchema, ...taskMutationFields },
  {
    optional: [
      "title",
      "parentId",
      "dartboard",
      "type",
      "status",
      "description",
      "assignees",
      "assignee",
      "reviewers",
      "reviewer",
      "tags",
      "priority",
      "startAt",
      "dueAt",
      "size",
      "customProperties",
      "taskRelationships",
    ],
  },
);

const userSchema = s.looseRequiredObject(
  "A Dart workspace user.",
  {
    name: s.string("The user's display name."),
    email: s.string("The user's email address."),
  },
  { optional: ["email"] },
);

const workspaceConfigSchema = s.looseRequiredObject(
  "The Dart workspace configuration.",
  {
    today: s.date("The current workspace date."),
    user: userSchema,
    dartboards: s.array("The available dartboard titles.", s.string("A dartboard title.")),
    folders: s.array("The available folder titles.", s.string("A folder title.")),
    types: s.array("The available task type titles.", s.string("A task type title.")),
    statuses: s.array("The available task statuses.", s.string("A task status title.")),
    assignees: s.array("The users available for assignment.", userSchema),
    tags: s.array("The available task tags.", s.string("A task tag.")),
    priorities: s.array("The available task priorities.", s.string("A task priority.")),
    sizes: s.anyOf("The workspace size configuration.", [
      s.string("A single workspace size configuration label."),
      s.array(
        "The available workspace size values.",
        s.anyOf("A workspace size value.", [
          s.string("A workspace size label."),
          s.integer("A workspace size integer."),
        ]),
      ),
    ]),
    skills: s.array("The available Dart skill titles.", s.string("A Dart skill title.")),
    customProperties: s.array(
      "The workspace custom property definitions.",
      s.looseRequiredObject(
        "A Dart custom property definition.",
        {
          name: s.string("The custom property name."),
          type: s.string("The custom property type."),
        },
        { optional: [] },
      ),
    ),
  },
  { optional: [] },
);

const taskCommonFields = {
  id: taskIdSchema,
  htmlUrl: s.string("The string that opens the task in the Dart web UI."),
  title: s.string("The task title."),
  parentId: s.nullable(taskIdSchema),
  dartboard: s.string("The full dartboard title."),
  type: s.string("The task type title."),
  status: s.string("The task status title."),
  assignees: nullableStringArraySchema(
    "The assigned user names or emails in a multi-assignee workspace.",
    "An assigned Dart user name or email.",
  ),
  assignee: s.nullable(s.string("The assigned user name or email.")),
  reviewers: nullableStringArraySchema(
    "The reviewer names or emails in a multi-reviewer workspace.",
    "A Dart reviewer name or email.",
  ),
  reviewer: s.nullable(s.string("The reviewer name or email.")),
  tags: s.array("The task tags.", s.string("A Dart task tag.")),
  priority: nullablePrioritySchema,
  startAt: s.nullable(s.string("The task start date.")),
  dueAt: s.nullable(s.string("The task due date.")),
  size: nullableSizeSchema,
  timeTracking: s.string("The tracked task duration in hh:mm:ss format."),
  customProperties: customPropertiesSchema,
  createdBy: s.nullable(s.string("The user that created the task.")),
  createdAt: s.dateTime("The task creation timestamp."),
  updatedBy: s.nullable(s.string("The user that last updated the task.")),
  updatedAt: s.dateTime("The task update timestamp."),
  completedAt: s.nullable(s.dateTime("The task completion timestamp.")),
};

const conciseTaskSchema = s.looseRequiredObject(
  "A concise task returned by the Dart list endpoint.",
  taskCommonFields,
  {
    optional: [
      "assignees",
      "assignee",
      "reviewers",
      "reviewer",
      "tags",
      "priority",
      "startAt",
      "dueAt",
      "size",
      "timeTracking",
      "customProperties",
      "createdBy",
      "updatedBy",
    ],
  },
);

const attachmentSchema = s.looseRequiredObject(
  "A Dart task attachment.",
  {
    name: s.string("The attachment name."),
    url: s.url("The attachment URL."),
    kind: s.string("The attachment MIME type."),
  },
  { optional: [] },
);

const taskSchema = s.looseRequiredObject(
  "A complete Dart task.",
  {
    ...taskCommonFields,
    description: s.string("The Markdown task description."),
    attachments: s.array("The task attachments.", attachmentSchema),
    taskRelationships: taskRelationshipsSchema,
  },
  {
    optional: [
      "assignees",
      "assignee",
      "reviewers",
      "reviewer",
      "tags",
      "priority",
      "startAt",
      "dueAt",
      "size",
      "timeTracking",
      "customProperties",
      "taskRelationships",
      "createdBy",
      "updatedBy",
    ],
  },
);

const wrappedTaskSchema = s.requiredObject("The official Dart task response wrapper.", {
  item: taskSchema,
});

const listMetaSchema = s.looseObject("Metadata describing applied Dart list defaults.", {
  defaultsApplied: s.boolean("Whether Dart applied default filters or ordering."),
  appliedDefaultFilters: s.record(
    "The default filters Dart applied automatically.",
    s.string("An applied default filter value."),
  ),
  appliedDefaultSorts: s.array(
    "The default ordering fields Dart applied automatically.",
    s.string("An applied ordering field."),
  ),
  instructions: s.string("Instructions for overriding or disabling defaults."),
});

const paginatedTasksSchema = s.looseRequiredObject(
  "The official paginated Dart task list response.",
  {
    count: s.integer("The total number of matching tasks."),
    next: s.nullable(s.url("The URL for the next result page.")),
    previous: s.nullable(s.url("The URL for the previous result page.")),
    results: s.array("The tasks in this result page.", conciseTaskSchema),
    meta: s.nullable(listMetaSchema),
  },
  { optional: ["next", "previous", "meta"] },
);

const orderingSchema = s.stringEnum("A documented Dart task ordering field.", [
  "-completed_at",
  "-created_at",
  "-dartboard__order",
  "-order",
  "-title",
  "-updated_at",
  "completed_at",
  "created_at",
  "dartboard__order",
  "order",
  "title",
  "updated_at",
]);

const listTasksInputSchema = s.object(
  "Filters and pagination for listing Dart tasks.",
  {
    title: s.string("Filter tasks by title."),
    ids: s.string("Filter by comma-separated task IDs."),
    dartboard: s.string("Filter by dartboard title."),
    dartboard_id: s.string("Filter by dartboard ID."),
    status: s.string("Filter by status title."),
    status_id: s.string("Filter by status ID."),
    assignee: s.string("Filter by assignee name or email."),
    assignee_id: s.string("Filter by assignee ID."),
    reviewer: s.string("Filter by reviewer name or email."),
    reviewer_id: s.string("Filter by reviewer ID."),
    tag: s.string("Filter by tag title."),
    tag_id: s.string("Filter by tag ID."),
    priority: s.string("Filter by priority title."),
    type: s.string("Filter by task type title."),
    type_id: s.string("Filter by task type ID."),
    parent_id: s.string("Filter by parent task ID."),
    is_completed: s.boolean("Filter by completion state."),
    in_trash: s.boolean("Filter by whether tasks are in trash."),
    start_at_after: s.dateTime("Filter tasks starting after this timestamp."),
    start_at_before: s.dateTime("Filter tasks starting before this timestamp."),
    due_at_after: s.dateTime("Filter tasks due after this timestamp."),
    due_at_before: s.dateTime("Filter tasks due before this timestamp."),
    created_at_after: s.dateTime("Filter tasks created after this timestamp."),
    created_at_before: s.dateTime("Filter tasks created before this timestamp."),
    updated_at_after: s.dateTime("Filter tasks updated after this timestamp."),
    updated_at_before: s.dateTime("Filter tasks updated before this timestamp."),
    no_defaults: s.boolean("Whether Dart should skip its default filters and ordering."),
    o: s.array("The ordered Dart sort fields.", orderingSchema),
    limit: s.positiveInteger("The maximum number of tasks to return."),
    offset: s.nonNegativeInteger("The result offset."),
  },
  {
    optional: [
      "title",
      "ids",
      "dartboard",
      "dartboard_id",
      "status",
      "status_id",
      "assignee",
      "assignee_id",
      "reviewer",
      "reviewer_id",
      "tag",
      "tag_id",
      "priority",
      "type",
      "type_id",
      "parent_id",
      "is_completed",
      "in_trash",
      "start_at_after",
      "start_at_before",
      "due_at_after",
      "due_at_before",
      "created_at_after",
      "created_at_before",
      "updated_at_after",
      "updated_at_before",
      "no_defaults",
      "o",
      "limit",
      "offset",
    ],
  },
);

export type DartActionName = "get_config" | "list_tasks" | "get_task" | "create_task" | "update_task" | "delete_task";

export const dartActions: ProviderActionDefinition<DartActionName>[] = [
  defineProviderAction(service, {
    name: "get_config",
    operationType: "read",
    description: "Retrieve the authenticated Dart workspace configuration and valid task values.",
    requiredScopes: [],
    inputSchema: s.object("No parameters are required to retrieve Dart configuration.", {}),
    outputSchema: workspaceConfigSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description: "List Dart tasks with documented filters, ordering, and pagination.",
    requiredScopes: [],
    inputSchema: listTasksInputSchema,
    outputSchema: paginatedTasksSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    operationType: "read",
    description: "Retrieve a Dart task by its ID.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Dart task lookup request.", { id: taskIdSchema }),
    outputSchema: wrappedTaskSchema,
  }),
  defineProviderAction(service, {
    name: "create_task",
    operationType: "write",
    description: "Create a Dart task using the official item wrapper.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The official Dart create task request.", {
      item: createTaskItemSchema,
    }),
    outputSchema: wrappedTaskSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    operationType: "write",
    description: "Update a Dart task using its item ID and the official item wrapper.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The official Dart update task request.", {
      item: updateTaskItemSchema,
    }),
    outputSchema: wrappedTaskSchema,
  }),
  defineProviderAction(service, {
    name: "delete_task",
    operationType: "destructive",
    description: "Move a Dart task to trash and return the updated task.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The Dart task delete request.", { id: taskIdSchema }),
    outputSchema: wrappedTaskSchema,
  }),
];
