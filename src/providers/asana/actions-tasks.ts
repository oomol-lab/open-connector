import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  gidField,
  includeFieldsSchema,
  jobSchema,
  nextCursorSchema,
  paginationFields,
  successOutputSchema,
  taskSchema,
} from "./schemas.ts";

const service = "asana";

const completedSinceSchema = s.anyOf(
  'Only include tasks incomplete or completed since this timestamp, or use the literal "now".',
  [s.literal("now"), s.dateTime("A completion timestamp.")],
);

const customFieldsSchema = s.record(
  "Custom field values keyed by Asana custom field gid.",
  s.unknown("An Asana custom field value."),
);

const nullableGidSchema = (description: string): JsonSchema => s.nullable(gidField(description));
const nullableDateSchema = (description: string): JsonSchema => s.nullable(s.date(description));
const nullableDateTimeSchema = (description: string): JsonSchema => s.nullable(s.dateTime(description));

const taskMutationFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The task name."),
  notes: s.string("Plain-text task notes. Cannot be combined with htmlNotes."),
  htmlNotes: s.string("HTML task notes. Cannot be combined with notes."),
  assignee: nullableGidSchema('The task assignee gid, email, "me", or null to unassign.'),
  assigneeSectionId: nullableGidSchema("The assignee-section gid, or null to clear it."),
  completed: s.boolean("Whether the task is completed."),
  dueOn: nullableDateSchema("The task due date, or null to clear it."),
  dueAt: nullableDateTimeSchema("The task due date-time, or null to clear it."),
  startOn: nullableDateSchema("The task start date, or null to clear it."),
  startAt: nullableDateTimeSchema("The task start date-time, or null to clear it."),
  approvalStatus: s.stringEnum("The approval state for an approval task.", [
    "pending",
    "approved",
    "rejected",
    "changes_requested",
  ]),
  resourceSubtype: s.stringEnum("The task subtype.", ["default_task", "milestone", "approval", "custom"]),
  customFields: customFieldsSchema,
  liked: s.boolean("Whether the authenticated user likes the task."),
};

const taskUpdateOnlyFields: Record<string, JsonSchema> = {
  customTypeId: nullableGidSchema("The custom task type gid, or null to clear it."),
  customTypeStatusOptionId: nullableGidSchema("The custom task type status option gid, or null to clear it."),
};

const taskCreateOnlyFields: Record<string, JsonSchema> = {
  projectId: gidField("Legacy single project gid to add the new task to."),
  projectIds: s.stringArray("Project gids to add the new task to.", {
    minItems: 1,
    itemDescription: "An Asana project gid.",
  }),
  workspaceId: gidField("The workspace gid for a task created without a project."),
  parentId: gidField("The parent task gid for a new subtask."),
  followerIds: s.stringArray("Users who should follow the new task.", {
    minItems: 1,
    itemDescription: 'A user gid, email, or the special identifier "me".',
  }),
  tagIds: s.stringArray("Tag gids to add to the new task.", {
    minItems: 1,
    itemDescription: "An Asana tag gid.",
  }),
};

function addTaskMutationExclusions(schema: JsonSchema): JsonSchema {
  schema.allOf = [
    { not: { required: ["notes", "htmlNotes"] } },
    { not: { required: ["dueOn", "dueAt"] } },
    { not: { required: ["startOn", "startAt"] } },
  ];
  return schema;
}

const createTaskInputSchema = addTaskMutationExclusions(
  s.object(
    "The input payload for this action.",
    {
      ...taskMutationFields,
      ...taskCreateOnlyFields,
      includeFields: includeFieldsSchema,
    },
    { required: ["name"] },
  ),
);
createTaskInputSchema.anyOf = [
  { required: ["projectId"] },
  { required: ["projectIds"] },
  { required: ["workspaceId"] },
  { required: ["parentId"] },
];

const updateTaskInputSchema = addTaskMutationExclusions(
  s.object(
    "The input payload for this action.",
    {
      taskId: gidField("The Asana task gid."),
      ...taskMutationFields,
      ...taskUpdateOnlyFields,
      includeFields: includeFieldsSchema,
    },
    { required: ["taskId"] },
  ),
);
updateTaskInputSchema.anyOf = [...Object.keys(taskMutationFields), ...Object.keys(taskUpdateOnlyFields)].map(
  (field) => ({
    required: [field],
  }),
);

const taskOutputSchema = s.object("The output payload for this action.", {
  task: taskSchema,
});

const jobOutputSchema = s.object("The output payload for this action.", {
  job: jobSchema,
});

const tasksOutputSchema = s.object("The output payload for this action.", {
  tasks: s.array("The Asana tasks.", taskSchema),
  nextCursor: nextCursorSchema,
});

const searchTasksOutputSchema = s.object("The output payload for this action.", {
  tasks: s.array("The matching Asana tasks.", taskSchema),
});

function paginatedListInput(idField: string, idDescription: string, completedSince = false): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      [idField]: gidField(idDescription),
      ...(completedSince ? { completedSince: completedSinceSchema } : {}),
      ...paginationFields,
      includeFields: includeFieldsSchema,
    },
    { required: [idField] },
  );
}

function taskIdInput(description: string): JsonSchema {
  return s.object(
    `${description} The input payload for this action.`,
    {
      taskId: gidField("The Asana task gid."),
      includeFields: includeFieldsSchema,
    },
    { required: ["taskId"] },
  );
}

const taskIdOnlyInputSchema = s.object(
  "The input payload for this action.",
  { taskId: gidField("The Asana task gid.") },
  { required: ["taskId"] },
);

function taskAssociationInput(field: string, description: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      taskId: gidField("The Asana task gid."),
      [field]: gidField(description),
    },
    { required: ["taskId", field] },
  );
}

function taskIdArrayInput(field: string, description: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      taskId: gidField("The Asana task gid."),
      [field]: s.stringArray(description, {
        minItems: 1,
        itemDescription: "An Asana task gid.",
      }),
    },
    { required: ["taskId", field] },
  );
}

const nullableSearchDate = (description: string): JsonSchema => s.nullable(s.date(description));
const searchCustomFieldFilterSchema = s.object(
  "A filter for one task custom field.",
  {
    customFieldId: gidField("The custom field gid."),
    isSet: s.boolean("Whether the custom field must have a value."),
    value: s.anyOf("An exact text, number, enum option gid, or date value.", [
      s.string("An exact text, enum option gid, or ISO 8601 date."),
      s.number("An exact numeric value."),
    ]),
    startsWith: s.string("A text prefix to match."),
    endsWith: s.string("A text suffix to match."),
    contains: s.string("A text fragment to match."),
    lessThan: s.number("An exclusive numeric upper bound."),
    greaterThan: s.number("An exclusive numeric lower bound."),
    before: s.date("An exclusive custom-field date upper bound."),
    after: s.date("An exclusive custom-field date lower bound."),
  },
  { required: ["customFieldId"] },
);
searchCustomFieldFilterSchema.anyOf = [
  "isSet",
  "value",
  "startsWith",
  "endsWith",
  "contains",
  "lessThan",
  "greaterThan",
  "before",
  "after",
].map((field) => ({ required: [field] }));

const customTaskTypeFilterSchema = s.object(
  "Filter custom tasks by one custom task type status option.",
  {
    customTypeId: gidField("The custom task type gid."),
    statusOptionId: gidField("The custom task type status option gid."),
  },
  { required: ["customTypeId", "statusOptionId"] },
);

const searchTaskInputSchema = s.object(
  "The input payload for this action.",
  {
    workspaceId: gidField("The workspace gid."),
    limit: s.integer("Maximum number of unstable search results to return.", { minimum: 1, maximum: 100 }),
    text: s.string("Text contained in the task name or description."),
    resourceSubtype: s.stringEnum("The task subtype.", ["default_task", "milestone", "approval", "custom"]),
    assigneeIds: s.stringArray("Assignees to include.", { minItems: 1 }),
    excludedAssigneeIds: s.stringArray("Assignees to exclude.", { minItems: 1 }),
    portfolioIds: s.stringArray("Portfolios whose projects contain the task.", { minItems: 1 }),
    projectIds: s.stringArray("Projects to include with OR semantics.", { minItems: 1 }),
    excludedProjectIds: s.stringArray("Projects to exclude.", { minItems: 1 }),
    allProjectIds: s.stringArray("Projects all of which must contain the task.", { minItems: 1 }),
    sectionIds: s.stringArray("Sections to include with OR semantics.", { minItems: 1 }),
    excludedSectionIds: s.stringArray("Sections to exclude.", { minItems: 1 }),
    allSectionIds: s.stringArray("Sections all of which must contain the task.", { minItems: 1 }),
    tagIds: s.stringArray("Tags to include with OR semantics.", { minItems: 1 }),
    excludedTagIds: s.stringArray("Tags to exclude.", { minItems: 1 }),
    allTagIds: s.stringArray("Tags all of which must be on the task.", { minItems: 1 }),
    teamIds: s.stringArray("Teams whose projects contain the task.", { minItems: 1 }),
    followerIds: s.stringArray("Followers to include.", { minItems: 1 }),
    excludedFollowerIds: s.stringArray("Followers to exclude.", { minItems: 1 }),
    creatorIds: s.stringArray("Task creators to include.", { minItems: 1 }),
    excludedCreatorIds: s.stringArray("Task creators to exclude.", { minItems: 1 }),
    assignedByIds: s.stringArray("Assigners to include.", { minItems: 1 }),
    excludedAssignedByIds: s.stringArray("Assigners to exclude.", { minItems: 1 }),
    excludedLikerIds: s.stringArray("Users whose likes exclude a task.", { minItems: 1 }),
    excludedCommenterIds: s.stringArray("Users whose comments exclude a task.", { minItems: 1 }),
    dueOn: nullableSearchDate("An exact due date, or null for tasks without one."),
    dueOnBefore: s.date("Return tasks due before this date."),
    dueOnAfter: s.date("Return tasks due after this date."),
    dueAtBefore: s.dateTime("Return tasks due before this timestamp."),
    dueAtAfter: s.dateTime("Return tasks due after this timestamp."),
    startOn: nullableSearchDate("An exact start date, or null for tasks without one."),
    startOnBefore: s.date("Return tasks starting before this date."),
    startOnAfter: s.date("Return tasks starting after this date."),
    createdOn: nullableSearchDate("An exact creation date, or null when unset."),
    createdOnBefore: s.date("Return tasks created before this date."),
    createdOnAfter: s.date("Return tasks created after this date."),
    createdAtBefore: s.dateTime("Return tasks created before this timestamp."),
    createdAtAfter: s.dateTime("Return tasks created after this timestamp."),
    completedOn: nullableSearchDate("An exact completion date, or null for incomplete tasks."),
    completedOnBefore: s.date("Return tasks completed before this date."),
    completedOnAfter: s.date("Return tasks completed after this date."),
    completedAtBefore: s.dateTime("Return tasks completed before this timestamp."),
    completedAtAfter: s.dateTime("Return tasks completed after this timestamp."),
    modifiedOn: nullableSearchDate("An exact modification date, or null when unset."),
    modifiedOnBefore: s.date("Return tasks modified before this date."),
    modifiedOnAfter: s.date("Return tasks modified after this date."),
    modifiedAtBefore: s.dateTime("Return tasks modified before this timestamp."),
    modifiedAtAfter: s.dateTime("Return tasks modified after this timestamp."),
    isBlocking: s.boolean("Filter to incomplete tasks with dependents."),
    isBlocked: s.boolean("Filter to tasks with incomplete dependencies."),
    hasAttachment: s.boolean("Filter by whether tasks have attachments."),
    completed: s.boolean("Filter by completion state."),
    isSubtask: s.boolean("Filter by whether tasks are subtasks."),
    sortBy: s.stringEnum("The result sort field.", [
      "due_date",
      "created_at",
      "completed_at",
      "likes",
      "modified_at",
      "relevance",
    ]),
    sortAscending: s.boolean("Whether results are sorted ascending."),
    customFieldFilters: s.array("Custom field filters.", searchCustomFieldFilterSchema, { minItems: 1 }),
    customTypeFilter: customTaskTypeFilterSchema,
    includeFields: includeFieldsSchema,
  },
  { required: ["workspaceId"] },
);

const genericListInputSchema = s.object("The input payload for this action.", {
  assignee: s.nonEmptyString('The assignee gid, email, "me", or the literal "null".'),
  projectId: gidField("The project gid to filter by."),
  sectionId: gidField("The section gid to filter by."),
  workspaceId: gidField("The workspace gid required when assignee is used."),
  completedSince: s.dateTime("Only include tasks incomplete or completed since this timestamp."),
  modifiedSince: s.dateTime("Only include tasks modified since this timestamp."),
  ...paginationFields,
  includeFields: includeFieldsSchema,
});
genericListInputSchema.anyOf = [
  { required: ["projectId"] },
  { required: ["sectionId"] },
  { required: ["assignee", "workspaceId"] },
];

const placementFields = {
  insertBefore: nullableGidSchema("The sibling task before which to insert, or null."),
  insertAfter: nullableGidSchema("The sibling task after which to insert, or null."),
};

const addTaskProjectInputSchema = s.object(
  "The input payload for this action.",
  {
    taskId: gidField("The Asana task gid."),
    projectId: gidField("The project gid."),
    sectionId: nullableGidSchema("The section gid for project placement, or null."),
    ...placementFields,
  },
  { required: ["taskId", "projectId"] },
);
addTaskProjectInputSchema.allOf = [{ not: { required: ["insertBefore", "insertAfter"] } }];

const setTaskParentInputSchema = s.object(
  "The input payload for this action.",
  {
    taskId: gidField("The Asana task gid."),
    parentId: nullableGidSchema("The new parent task gid, or null to remove the parent."),
    ...placementFields,
    includeFields: includeFieldsSchema,
  },
  { required: ["taskId", "parentId"] },
);
setTaskParentInputSchema.allOf = [
  { not: { required: ["insertBefore", "insertAfter"] } },
  {
    if: {
      required: ["parentId"],
      properties: { parentId: { type: "null" } },
    },
    then: {
      not: {
        anyOf: [{ required: ["insertBefore"] }, { required: ["insertAfter"] }],
      },
    },
  },
];

const duplicateTaskInputSchema = s.object(
  "The input payload for this action.",
  {
    taskId: gidField("The Asana task gid."),
    name: s.string("The name of the duplicated task."),
    include: s.array(
      "Fields and associations to duplicate.",
      s.stringEnum("A duplicable task field.", [
        "assignee",
        "attachments",
        "dates",
        "dependencies",
        "followers",
        "notes",
        "parent",
        "projects",
        "subtasks",
        "tags",
      ]),
      { minItems: 1 },
    ),
    includeFields: includeFieldsSchema,
  },
  { required: ["taskId"] },
);

const followerMutationInputSchema = s.object(
  "The input payload for this action.",
  {
    taskId: gidField("The Asana task gid."),
    followerIds: s.stringArray("Users to add or remove as followers.", {
      minItems: 1,
      itemDescription: 'A user gid, email, or the special identifier "me".',
    }),
    includeFields: includeFieldsSchema,
  },
  { required: ["taskId", "followerIds"] },
);

export const asanaTaskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List tasks matching Asana's general task filters.",
    inputSchema: genericListInputSchema,
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "list_project_tasks",
    description: "List tasks within an Asana project.",
    inputSchema: paginatedListInput("projectId", "The Asana project gid.", true),
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get a single Asana task by gid.",
    inputSchema: taskIdInput("Get a task."),
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create an Asana task in a project, workspace, or parent task.",
    inputSchema: createTaskInputSchema,
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update an existing Asana task.",
    inputSchema: updateTaskInputSchema,
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete an Asana task.",
    inputSchema: taskIdOnlyInputSchema,
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:delete"],
  }),
  defineProviderAction(service, {
    name: "duplicate_task",
    description: "Duplicate an Asana task and selected associations.",
    inputSchema: duplicateTaskInputSchema,
    outputSchema: jobOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "list_section_tasks",
    description: "List tasks in an Asana section.",
    inputSchema: paginatedListInput("sectionId", "The Asana section gid.", true),
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "list_tag_tasks",
    description: "List tasks carrying an Asana tag.",
    inputSchema: paginatedListInput("tagId", "The Asana tag gid."),
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "list_user_task_list_tasks",
    description: "List tasks in an Asana user task list.",
    inputSchema: paginatedListInput("userTaskListId", "The Asana user task list gid.", true),
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "list_subtasks",
    description: "List direct subtasks of an Asana task.",
    inputSchema: paginatedListInput("taskId", "The parent task gid."),
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "create_subtask",
    description: "Create a direct subtask under an Asana task.",
    inputSchema: addTaskMutationExclusions(
      s.object(
        "The input payload for this action.",
        {
          taskId: gidField("The parent task gid."),
          ...taskMutationFields,
          followerIds: taskCreateOnlyFields.followerIds!,
          tagIds: taskCreateOnlyFields.tagIds!,
          includeFields: includeFieldsSchema,
        },
        { required: ["taskId", "name"] },
      ),
    ),
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "set_task_parent",
    description: "Set, change, or remove an Asana task's parent.",
    inputSchema: setTaskParentInputSchema,
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "list_task_dependencies",
    description: "List tasks that an Asana task depends on.",
    inputSchema: paginatedListInput("taskId", "The Asana task gid."),
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "add_task_dependencies",
    description: "Add dependencies to an Asana task.",
    inputSchema: taskIdArrayInput("dependencyIds", "Task gids to add as dependencies."),
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "remove_task_dependencies",
    description: "Remove dependencies from an Asana task.",
    inputSchema: taskIdArrayInput("dependencyIds", "Task gids to remove as dependencies."),
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "list_task_dependents",
    description: "List tasks that depend on an Asana task.",
    inputSchema: paginatedListInput("taskId", "The Asana task gid."),
    outputSchema: tasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "add_task_dependents",
    description: "Add dependent tasks to an Asana task.",
    inputSchema: taskIdArrayInput("dependentIds", "Task gids to add as dependents."),
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "remove_task_dependents",
    description: "Remove dependent tasks from an Asana task.",
    inputSchema: taskIdArrayInput("dependentIds", "Task gids to remove as dependents."),
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "add_task_project",
    description: "Add an Asana task to a project with optional section placement.",
    inputSchema: addTaskProjectInputSchema,
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "remove_task_project",
    description: "Remove an Asana task from a project.",
    inputSchema: taskAssociationInput("projectId", "The project gid."),
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "add_task_tag",
    description: "Add a tag to an Asana task.",
    inputSchema: taskAssociationInput("tagId", "The tag gid."),
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "remove_task_tag",
    description: "Remove a tag from an Asana task.",
    inputSchema: taskAssociationInput("tagId", "The tag gid."),
    outputSchema: successOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "add_task_followers",
    description: "Add followers to an Asana task.",
    inputSchema: followerMutationInputSchema,
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "remove_task_followers",
    description: "Remove followers from an Asana task.",
    inputSchema: followerMutationInputSchema,
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:write"],
  }),
  defineProviderAction(service, {
    name: "get_task_by_custom_id",
    description: "Get an Asana task by workspace and custom ID.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        workspaceId: gidField("The workspace gid."),
        customId: s.nonEmptyString("The task custom ID."),
      },
      { required: ["workspaceId", "customId"] },
    ),
    outputSchema: taskOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
  defineProviderAction(service, {
    name: "search_workspace_tasks",
    description: "Search tasks in an Asana workspace using advanced filters.",
    inputSchema: searchTaskInputSchema,
    outputSchema: searchTasksOutputSchema,
    requiredScopes: ["tasks:read"],
  }),
];
