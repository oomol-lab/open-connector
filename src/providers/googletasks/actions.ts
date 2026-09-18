import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { googleTasksReadScopes, googleTasksWriteScopes } from "./scopes.ts";

const service = "googletasks";

interface GoogleTasksActionSource {
  name: GoogleTasksActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const tasklistId = s.nonEmptyString("Google Tasks task list ID. Use @default for the primary list when supported.");
const taskId = s.nonEmptyString("Google Tasks task ID.");
const pageToken = s.string("Opaque pagination token returned by a previous Google Tasks response.");
const maxResults = s.integer("Maximum number of items to return per page.", { minimum: 1, maximum: 100 });
const taskListMaxResults = s.integer("Maximum number of task lists to return per page.", {
  minimum: 1,
  maximum: 1000,
});
const rfc3339 = s.dateTime("Timestamp in RFC 3339 format.");
const taskStatus = s.stringEnum(["needsAction", "completed"], { description: "Task status." });
const taskLink = s.object(
  "A link attached to a Google Task.",
  {
    type: s.string("Type of linked resource."),
    link: s.string("Absolute URL or URI for the linked resource."),
    description: s.string("Human-readable description of the link."),
  },
  { required: ["type", "link"] },
);
const assignmentInfo = s.nullable(
  s.object("Assignment metadata returned for tasks created from Gmail, Docs, or Chat.", {
    surfaceType: s.stringEnum(["CONTEXT_TYPE_UNSPECIFIED", "GMAIL", "DOCUMENT", "SPACE"], {
      description: "Type of surface where the task was assigned.",
    }),
    linkToTask: s.string("Absolute link to the source assignment surface."),
    spaceInfo: s.object("Google Chat space information for assigned tasks.", {
      space: s.string("Google Chat space resource name."),
    }),
    driveResourceInfo: s.object("Google Drive file information for assigned tasks.", {
      driveFileId: s.string("Google Drive file ID for the source document."),
      resourceKey: s.string("Google Drive resource key for the source document."),
    }),
  }),
);
const taskProperties: Record<string, JsonSchema> = {
  id: s.string("Google Tasks task ID."),
  kind: s.string("Google Tasks resource kind."),
  etag: s.nullableString("Entity tag for the task resource."),
  title: s.nullableString("Task title."),
  notes: s.nullableString("Task notes."),
  status: s.nullable(taskStatus),
  parent: s.nullableString("Parent task ID when this task is a subtask."),
  position: s.nullableString("Lexicographic position token among sibling tasks."),
  due: s.nullableString("Task due timestamp in RFC 3339 format."),
  completed: s.nullableString("Timestamp when the task was completed, in RFC 3339 format."),
  deleted: s.boolean("Whether the task is marked as deleted."),
  hidden: s.boolean("Whether the task is hidden from the default Google Tasks view."),
  updated: s.nullableString("Last update time for the task, in RFC 3339 format."),
  selfLink: s.nullableString("API URL for the task resource."),
  webViewLink: s.nullableString("Google Tasks web URL for the task."),
  links: s.array("Links attached to the task.", taskLink),
  assignmentInfo,
};
const task = s.requiredObject("A normalized Google Tasks task.", taskProperties);
const taskWithListContext = s.requiredObject("A normalized Google Tasks task with task list context.", {
  ...taskProperties,
  tasklistId: s.string("Task list ID that contains the task."),
  tasklistTitle: s.nullableString("Task list title that contains the task."),
});
const taskList = s.requiredObject("A normalized Google Tasks task list.", {
  id: s.string("Google Tasks task list ID."),
  kind: s.string("Google Tasks resource kind."),
  etag: s.nullableString("Entity tag for the task list resource."),
  title: s.nullableString("Task list title."),
  updated: s.nullableString("Last update time for the task list, in RFC 3339 format."),
  selfLink: s.nullableString("API URL for the task list resource."),
});
const taskListSummary = s.requiredObject("Summary information for a task list included in list_all_tasks.", {
  id: s.string("Task list ID."),
  title: s.nullableString("Task list title."),
  taskCount: s.integer("Number of tasks returned for this task list."),
});
const success = s.requiredObject("Operation success result.", {
  success: s.literal(true, { description: "Whether the Google Tasks operation completed successfully." }),
});
const taskWriteFields = {
  id: s.string("Task resource ID to send in the request body."),
  etag: s.string("Entity tag to send in the request body."),
  title: s.nonEmptyString("Task title."),
  notes: s.string("Plain-text task notes."),
  status: taskStatus,
  due: rfc3339,
  completed: rfc3339,
  deleted: s.boolean("Whether the task is marked as deleted."),
};
const listTaskFilters = {
  dueMax: s.dateTime("Only return tasks due on or before this timestamp."),
  dueMin: s.dateTime("Only return tasks due on or after this timestamp."),
  completedMax: s.dateTime("Only return tasks completed on or before this timestamp."),
  completedMin: s.dateTime("Only return tasks completed on or after this timestamp."),
  updatedMin: s.dateTime("Only return tasks updated on or after this timestamp."),
  pageToken,
  maxResults,
  showCompleted: s.boolean({ description: "Whether completed tasks should be returned.", default: true }),
  showDeleted: s.boolean("Whether deleted tasks should be returned."),
  showHidden: s.boolean("Whether hidden tasks should be returned."),
  showAssigned: s.boolean("Whether assigned tasks should be returned."),
};
const listTasksInput = input({ tasklistId, ...listTaskFilters }, ["tasklistId"]);
const listAllTasksInput = input({
  dueMax: listTaskFilters.dueMax,
  dueMin: listTaskFilters.dueMin,
  completedMax: listTaskFilters.completedMax,
  completedMin: listTaskFilters.completedMin,
  updatedMin: listTaskFilters.updatedMin,
  showCompleted: listTaskFilters.showCompleted,
  showDeleted: listTaskFilters.showDeleted,
  showHidden: listTaskFilters.showHidden,
  showAssigned: listTaskFilters.showAssigned,
  maxTasksTotal: s.integer("Maximum number of tasks to return across all task lists.", {
    minimum: 1,
    maximum: 100000,
  }),
});
const taskIdInput = input({ tasklistId, taskId }, ["tasklistId", "taskId"]);
const updateTaskInput = input({ tasklistId, taskId, ...taskWriteFields }, ["tasklistId", "taskId"]);
const updateTaskFullInput = input({ tasklistId, taskId, ...taskWriteFields }, ["tasklistId", "taskId", "id", "title"]);

const actions: GoogleTasksActionSource[] = [
  action(
    "list_task_lists",
    "read",
    "List Google Tasks task lists visible to the current connection.",
    googleTasksReadScopes,
    input({
      maxResults: taskListMaxResults,
      pageToken,
    }),
    output({
      taskLists: s.array("Task lists returned by Google Tasks.", taskList),
      nextPageToken: s.nullableString("Opaque token for the next page, or null when there are no more results."),
    }),
  ),
  action(
    "get_task_list",
    "read",
    "Fetch a Google Tasks task list by ID.",
    googleTasksReadScopes,
    input({ tasklistId }, ["tasklistId"]),
    output({ taskList }),
  ),
  action(
    "create_task_list",
    "write",
    "Create a new Google Tasks task list.",
    googleTasksWriteScopes,
    input(
      {
        title: s.nonEmptyString("Title for the new task list."),
      },
      ["title"],
    ),
    output({ taskList }),
  ),
  action(
    "patch_task_list",
    "write",
    "Partially update the title of a Google Tasks task list.",
    googleTasksWriteScopes,
    input(
      {
        tasklistId,
        title: s.nonEmptyString("New task list title."),
      },
      ["tasklistId", "title"],
    ),
    output({ taskList }),
  ),
  action(
    "update_task_list",
    "write",
    "Replace the mutable fields of a Google Tasks task list.",
    googleTasksWriteScopes,
    input(
      {
        tasklistId,
        title: s.nonEmptyString("New task list title."),
      },
      ["tasklistId", "title"],
    ),
    output({ taskList }),
  ),
  action(
    "delete_task_list",
    "destructive",
    "Delete a Google Tasks task list.",
    googleTasksWriteScopes,
    input({ tasklistId }, ["tasklistId"]),
    success,
  ),
  action(
    "list_tasks",
    "read",
    "List tasks from a Google Tasks task list.",
    googleTasksReadScopes,
    listTasksInput,
    output({
      tasks: s.array("Tasks returned by Google Tasks.", task),
      nextPageToken: s.nullableString("Opaque token for the next page, or null when there are no more results."),
    }),
  ),
  action(
    "list_all_tasks",
    "read",
    "List tasks across every Google Tasks task list visible to the current connection.",
    googleTasksReadScopes,
    listAllTasksInput,
    output({
      taskLists: s.array("Task lists visited while aggregating tasks.", taskListSummary),
      tasks: s.array("Tasks returned across every visited task list.", taskWithListContext),
      totalLists: s.integer("Number of task lists included in the aggregation."),
      totalTasks: s.integer("Number of tasks returned by the aggregation."),
      truncated: s.boolean("Whether aggregation stopped early because maxTasksTotal was reached."),
    }),
  ),
  action(
    "get_task",
    "read",
    "Fetch a Google Tasks task by task list ID and task ID.",
    googleTasksReadScopes,
    taskIdInput,
    output({ task }),
  ),
  action(
    "insert_task",
    "write",
    "Create a task in a Google Tasks task list.",
    googleTasksWriteScopes,
    input(
      {
        tasklistId,
        ...taskWriteFields,
        title: s.string("Task title."),
        taskParent: s.string("Parent task ID."),
        taskPrevious: s.string("Previous sibling task ID."),
      },
      ["tasklistId"],
    ),
    output({ task }),
  ),
  action(
    "patch_task",
    "write",
    "Partially update a Google Tasks task.",
    googleTasksWriteScopes,
    updateTaskInput,
    output({ task }),
  ),
  action(
    "update_task_full",
    "write",
    "Replace the mutable fields of a Google Tasks task with a full update.",
    googleTasksWriteScopes,
    updateTaskFullInput,
    output({ task }),
  ),
  action(
    "update_task",
    "write",
    "Deprecated alias for update_task_full. Fully replace the mutable fields of a Google Tasks task.",
    googleTasksWriteScopes,
    updateTaskFullInput,
    output({ task }),
  ),
  action(
    "move_task",
    "destructive",
    "Move a Google Tasks task within a list or into another task list.",
    googleTasksWriteScopes,
    input(
      {
        tasklist: s.nonEmptyString("Source task list ID."),
        task: s.nonEmptyString("Task ID to move."),
        parent: s.string("New parent task ID."),
        previous: s.string("New previous sibling task ID."),
        destinationTasklist: s.string("Destination task list ID."),
      },
      ["tasklist", "task"],
    ),
    output({ task }),
  ),
  action("delete_task", "destructive", "Delete a Google Tasks task.", googleTasksWriteScopes, taskIdInput, success),
  action(
    "clear_tasks",
    "destructive",
    "Clear every completed task from a Google Tasks task list.",
    googleTasksWriteScopes,
    input({ tasklistId }, ["tasklistId"]),
    success,
  ),
];

export const googleTasksActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    ...source,
    providerPermissions: source.requiredScopes,
  }),
);

export type GoogleTasksActionName =
  | "list_task_lists"
  | "get_task_list"
  | "create_task_list"
  | "patch_task_list"
  | "update_task_list"
  | "delete_task_list"
  | "list_tasks"
  | "list_all_tasks"
  | "get_task"
  | "insert_task"
  | "patch_task"
  | "update_task_full"
  | "update_task"
  | "move_task"
  | "delete_task"
  | "clear_tasks";

function action(
  name: GoogleTasksActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  requiredScopes: string[],
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): GoogleTasksActionSource {
  return {
    name,
    operationType,
    description,
    requiredScopes,
    inputSchema,
    outputSchema,
  };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required);
}

function output(properties: Record<string, JsonSchema>): JsonSchema {
  return s.actionOutput(properties);
}
