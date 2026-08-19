import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "motion";

const idSchema = s.nonEmptyString("The Motion resource ID.");
const cursorSchema = s.nonEmptyString("The pagination cursor returned by a previous Motion response.");
const workspaceIdSchema = s.nonEmptyString("The Motion workspace ID.");
const prioritySchema = s.stringEnum("The Motion task priority.", ["ASAP", "HIGH", "MEDIUM", "LOW"]);
const durationSchema = s.anyOf("The task duration as minutes or a Motion duration keyword.", [
  s.positiveInteger("A positive duration in minutes."),
  s.stringEnum("A Motion duration keyword.", ["NONE", "REMINDER"]),
]);
const looseResourceSchema = s.looseObject("A Motion API resource object.");
const looseMetaSchema = s.looseObject("Motion pagination metadata.", {
  nextCursor: s.string("The cursor for the next page of results."),
  pageSize: s.integer("The number of records returned in the current page."),
});

const taskSchema = s.looseObject("A Motion task resource.", {
  id: s.string("The Motion task ID."),
  name: s.string("The task name."),
  description: s.string("The HTML task description returned by Motion."),
  duration: s.anyOf("The task duration returned by Motion.", [
    s.integer("The task duration in minutes."),
    s.string("The Motion duration keyword."),
  ]),
  dueDate: s.string("The task due date."),
  completed: s.boolean("Whether the task is completed."),
  updatedTime: s.string("The timestamp when the task was last updated."),
  priority: s.string("The Motion task priority."),
});

const taskMutationFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The task title."),
  workspaceId: workspaceIdSchema,
  dueDate: s.dateTime("The ISO 8601 due date for the task."),
  duration: durationSchema,
  status: s.nonEmptyString("The Motion task status name."),
  autoScheduled: s.nullable(s.looseObject("Motion auto-scheduling settings for the task.")),
  projectId: s.nonEmptyString("The Motion project ID."),
  description: s.string("The GitHub Flavored Markdown task description."),
  priority: prioritySchema,
  labels: s.array("The label names to add to the task.", s.nonEmptyString("A Motion label name.")),
  assigneeId: s.nonEmptyString("The Motion user ID assigned to the task."),
};

const taskMutationFieldNames = Object.keys(taskMutationFields);

const createProjectFields = {
  name: s.nonEmptyString("The project name."),
  workspaceId: workspaceIdSchema,
  description: s.string("The project description."),
  dueDate: s.dateTime("The ISO 8601 project due date."),
  status: s.nonEmptyString("The Motion project status name."),
  priority: prioritySchema,
};

const listTasksInputSchema = s.actionInput(
  {
    workspaceId: workspaceIdSchema,
    projectId: s.nonEmptyString("Only return tasks in this Motion project."),
    assigneeId: s.nonEmptyString("Only return tasks assigned to this Motion user."),
    cursor: cursorSchema,
    includeAllStatuses: s.boolean("Whether to include all statuses that exist on tasks."),
    label: s.nonEmptyString("Only return tasks with this label."),
    name: s.nonEmptyString("Only return tasks whose name contains this case-insensitive string."),
    status: s.array("Only return tasks with these status names.", s.nonEmptyString("A task status name.")),
  },
  [],
  "The input payload for listing Motion tasks. includeAllStatuses and status cannot be provided together.",
);
listTasksInputSchema.not = { required: ["includeAllStatuses", "status"] };

const updateTaskInputSchema = s.actionInput(
  {
    id: idSchema,
    ...taskMutationFields,
  },
  ["id"],
  "The input payload for updating a Motion task. At least one task update field must be provided.",
);
updateTaskInputSchema.anyOf = taskMutationFieldNames.map((fieldName) => ({ required: [fieldName] }));

export const motionActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Motion workspaces available to the API key.",
    inputSchema: s.actionInput({}, [], "The input payload for listing Motion workspaces."),
    outputSchema: s.actionOutput(
      {
        workspaces: s.array("The Motion workspaces returned by the API.", looseResourceSchema),
      },
      "The response returned when listing Motion workspaces.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Motion users visible to the API key.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
      },
      [],
      "The input payload for listing Motion users.",
    ),
    outputSchema: s.actionOutput(
      {
        users: s.array("The Motion users returned by the API.", looseResourceSchema),
      },
      "The response returned when listing Motion users.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_my_user",
    description: "Get the Motion user associated with the current API key.",
    inputSchema: s.actionInput({}, [], "The input payload for getting the current Motion user."),
    outputSchema: s.actionOutput(
      {
        user: looseResourceSchema,
      },
      "The response returned when getting the current Motion user.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Motion projects for a workspace.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        cursor: cursorSchema,
      },
      ["workspaceId"],
      "The input payload for listing Motion projects.",
    ),
    outputSchema: s.actionOutput(
      {
        meta: looseMetaSchema,
        projects: s.array("The Motion projects returned by the API.", looseResourceSchema),
      },
      "The response returned when listing Motion projects.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a Motion project by ID.",
    inputSchema: s.actionInput(
      {
        id: idSchema,
      },
      ["id"],
      "The input payload for getting a Motion project.",
    ),
    outputSchema: s.actionOutput(
      {
        project: looseResourceSchema,
      },
      "The response returned when getting a Motion project.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Motion project in a workspace.",
    inputSchema: s.actionInput(
      createProjectFields,
      ["name", "workspaceId"],
      "The input payload for creating a Motion project.",
    ),
    outputSchema: s.actionOutput(
      {
        project: looseResourceSchema,
      },
      "The response returned when creating a Motion project.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Motion tasks with optional workspace, project, assignee, status, and cursor filters.",
    inputSchema: listTasksInputSchema,
    outputSchema: s.actionOutput(
      {
        meta: looseMetaSchema,
        tasks: s.array("The Motion tasks returned by the API.", taskSchema),
      },
      "The response returned when listing Motion tasks.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get a Motion task by ID.",
    inputSchema: s.actionInput(
      {
        id: idSchema,
      },
      ["id"],
      "The input payload for getting a Motion task.",
    ),
    outputSchema: s.actionOutput(
      {
        task: taskSchema,
      },
      "The response returned when getting a Motion task.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a Motion task in a workspace.",
    inputSchema: s.actionInput(
      taskMutationFields,
      ["name", "workspaceId"],
      "The input payload for creating a Motion task.",
    ),
    outputSchema: s.actionOutput(
      {
        task: taskSchema,
      },
      "The response returned when creating a Motion task.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Motion task by ID.",
    inputSchema: updateTaskInputSchema,
    outputSchema: s.actionOutput(
      {
        task: taskSchema,
      },
      "The response returned when updating a Motion task.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete a Motion task by ID.",
    inputSchema: s.actionInput(
      {
        id: idSchema,
      },
      ["id"],
      "The input payload for deleting a Motion task.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the Motion task delete request completed successfully."),
      },
      "The response returned when deleting a Motion task.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_statuses",
    description: "List Motion statuses for a workspace.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
      },
      ["workspaceId"],
      "The input payload for listing Motion statuses.",
    ),
    outputSchema: s.actionOutput(
      {
        statuses: s.array("The Motion statuses returned by the API.", looseResourceSchema),
      },
      "The response returned when listing Motion statuses.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_schedules",
    description: "List Motion schedules for a workspace.",
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
      },
      ["workspaceId"],
      "The input payload for listing Motion schedules.",
    ),
    outputSchema: s.actionOutput(
      {
        schedules: s.array("The Motion schedules returned by the API.", looseResourceSchema),
      },
      "The response returned when listing Motion schedules.",
    ),
  }),
];
