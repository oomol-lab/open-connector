import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "workast";

const emptyInputSchema = s.object("No input is required.", {});
const workastObjectSchema = (description: string) => s.looseObject(description);

const spaceIdInputSchema = s.object("A Workast space identifier.", {
  spaceId: s.nonEmptyString("The unique Workast space ID."),
});

const taskIdInputSchema = s.object("A Workast task identifier.", {
  taskId: s.nonEmptyString("The unique Workast task ID."),
});

const searchSpacesInputSchema = s.object(
  "Filters and offset pagination for searching Workast spaces.",
  {
    onlyUserLists: s.boolean("Whether to return only spaces available to the current user."),
    statusIs: s.stringEnum("The Workast space status to include.", ["active", "archived"]),
    includeTemplates: s.boolean("Whether to include Workast team templates."),
    type: s.stringEnum("The Workast space type to include.", ["direct", "group"]),
    name: s.string("Filter spaces by name."),
    limit: s.integer("The maximum number of Workast spaces to return.", {
      minimum: 1,
      maximum: 200,
    }),
    skip: s.integer("The number of Workast spaces to skip.", { minimum: 0 }),
    sort: s.stringEnum("The order used for Workast space results.", ["name", "-name", "createdAt", "-createdAt"]),
  },
  {
    optional: ["onlyUserLists", "statusIs", "includeTemplates", "type", "name", "limit", "skip", "sort"],
  },
);

const getSpaceTasksInputSchema = s.object(
  "Filters and offset pagination for listing tasks in a Workast space.",
  {
    spaceId: s.nonEmptyString("The unique Workast space ID."),
    statusIs: s.string("The Workast task status to include."),
    skip: s.integer("The number of Workast tasks to skip.", { minimum: 0 }),
    limit: s.integer("The maximum number of Workast tasks to return.", {
      minimum: 1,
      maximum: 200,
    }),
    order: s.string("The Workast task sort field and direction, such as createdAt|asc."),
  },
  { optional: ["statusIs", "skip", "limit", "order"] },
);

const commonTaskWriteFields = {
  text: s.nonEmptyString("The task summary text."),
  description: s.string("The task description."),
  dueDateTimezone: s.nonEmptyString("The due date timezone from the IANA timezone database."),
  dueDateTime: s.nonEmptyString("The time portion of the task due date."),
} as const;

const createTaskInputSchema = s.object(
  "Details for creating a task in a Workast space.",
  {
    spaceId: s.nonEmptyString("The unique Workast space ID where the task is created."),
    ...commonTaskWriteFields,
    startDate: s.date("The task start date in YYYY-MM-DD format."),
    dueDate: s.date("The task due date in YYYY-MM-DD format."),
    assignedTo: s.array("Workast user IDs to assign to the task.", s.nonEmptyString("One Workast user ID."), {
      minItems: 1,
    }),
    listPosition: s.integer("The task position within its Workast list."),
  },
  {
    optional: ["description", "startDate", "dueDate", "dueDateTimezone", "dueDateTime", "assignedTo", "listPosition"],
  },
);

const updateTaskInputSchema = s.object(
  "Fields to update on an existing Workast task.",
  {
    taskId: s.nonEmptyString("The unique Workast task ID."),
    ...commonTaskWriteFields,
    startDate: s.dateTime("The task start date and time in ISO 8601 format."),
    dueDate: s.dateTime("The task due date and time in ISO 8601 format."),
  },
  {
    optional: ["text", "description", "startDate", "dueDate", "dueDateTimezone", "dueDateTime"],
  },
);

const userOutputSchema = s.object("The current Workast user response.", {
  user: workastObjectSchema("The current Workast user object."),
});

const spacesOutputSchema = s.object("The Workast space search response.", {
  spaces: s.array("The matching Workast spaces.", workastObjectSchema("One Workast space.")),
});

const spaceOutputSchema = s.object("A Workast space response.", {
  space: workastObjectSchema("The Workast space object."),
});

const tasksOutputSchema = s.object("The Workast space task response.", {
  tasks: s.array("The matching Workast tasks.", workastObjectSchema("One Workast task.")),
});

const taskOutputSchema = s.object("A Workast task response.", {
  task: workastObjectSchema("The Workast task object."),
});

const getMyDetailsAction = defineProviderAction(service, {
  name: "get_my_details",
  operationType: "read",
  description: "Get the Workast user represented by the connected API token.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: userOutputSchema,
});

const searchSpacesAction = defineProviderAction(service, {
  name: "search_spaces",
  operationType: "read",
  description: "Search Workast spaces available to the connected user with filters and pagination.",
  requiredScopes: [],
  inputSchema: searchSpacesInputSchema,
  outputSchema: spacesOutputSchema,
});

const getSpaceDetailsAction = defineProviderAction(service, {
  name: "get_space_details",
  operationType: "read",
  description: "Get the details of one Workast space by ID.",
  requiredScopes: [],
  inputSchema: spaceIdInputSchema,
  outputSchema: spaceOutputSchema,
});

const getSpaceTasksAction = defineProviderAction(service, {
  name: "get_space_tasks",
  operationType: "read",
  description: "List tasks in a Workast space with status, pagination, and ordering controls.",
  requiredScopes: [],
  inputSchema: getSpaceTasksInputSchema,
  outputSchema: tasksOutputSchema,
});

const getTaskDetailsAction = defineProviderAction(service, {
  name: "get_task_details",
  operationType: "read",
  description: "Get the details of one Workast task by ID.",
  requiredScopes: [],
  inputSchema: taskIdInputSchema,
  outputSchema: taskOutputSchema,
});

const createTaskAction = defineProviderAction(service, {
  name: "create_task",
  operationType: "write",
  description: "Create a task in a Workast space with common assignment and scheduling fields.",
  requiredScopes: [],
  inputSchema: createTaskInputSchema,
  outputSchema: taskOutputSchema,
});

const updateTaskAction = defineProviderAction(service, {
  name: "update_task",
  operationType: "write",
  description: "Update one or more common fields on an existing Workast task.",
  requiredScopes: [],
  inputSchema: updateTaskInputSchema,
  outputSchema: taskOutputSchema,
});

const completeTaskAction = defineProviderAction(service, {
  name: "complete_task",
  operationType: "write",
  description: "Mark an existing Workast task as completed.",
  requiredScopes: [],
  inputSchema: taskIdInputSchema,
  outputSchema: taskOutputSchema,
});

export const workastActions: ActionDefinition[] = [
  getMyDetailsAction,
  searchSpacesAction,
  getSpaceDetailsAction,
  getSpaceTasksAction,
  getTaskDetailsAction,
  createTaskAction,
  updateTaskAction,
  completeTaskAction,
];
