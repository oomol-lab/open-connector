import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "paymo";

const idSchema = s.positiveInteger("The Paymo numeric resource identifier.");
const whereSchema = s.nonEmptyString("The Paymo where filter expression to forward to the listing endpoint.");
const includeSchema = s.nonEmptyString("The Paymo include expression for adding related content to the response.");
const partialIncludeSchema = s.nonEmptyString(
  "The Paymo partial_include expression for adding lightweight related content.",
);
const rawRecordSchema = s.looseObject("A raw Paymo resource object returned by the API.");
const clientWriteSchema = s.looseObject(
  "The Paymo client fields to create or update, such as name, email, phone, website, or address fields.",
);
const projectWriteSchema = s.looseObject(
  "The Paymo project fields to create or update, such as name, client_id, description, or workflow_id.",
);
const taskWriteSchema = s.looseObject(
  "The Paymo task fields to create or update, such as name, description, project_id, tasklist_id, users, complete, due_date, status_id, or priority.",
);

const emptyInputSchema = s.object("This action does not require input.", {});

const listInputSchema = s.object(
  "Optional Paymo list query parameters.",
  {
    where: whereSchema,
    include: includeSchema,
    partial_include: partialIncludeSchema,
  },
  { optional: ["where", "include", "partial_include"] },
);

const getInputSchema = s.object(
  "Input parameters for reading one Paymo resource.",
  {
    id: idSchema,
    include: includeSchema,
    partial_include: partialIncludeSchema,
  },
  { optional: ["include", "partial_include"] },
);

const deleteOutputSchema = s.object("The Paymo delete action result.", {
  deleted: s.boolean("Whether the Paymo resource deletion request completed successfully."),
});

const accountAction = defineProviderAction(service, {
  name: "get_current_user",
  description: "Get the Paymo user associated with the current API key.",
  requiredScopes: [],
  inputSchema: emptyInputSchema,
  outputSchema: s.object("The current Paymo user response.", {
    user: rawRecordSchema,
  }),
});

const listClientsAction = defineProviderAction(service, {
  name: "list_clients",
  description: "List Paymo clients with optional where and include query parameters.",
  requiredScopes: [],
  inputSchema: listInputSchema,
  outputSchema: s.object("The Paymo clients list response.", {
    clients: s.array("The Paymo clients returned for this request.", rawRecordSchema),
  }),
});

const getClientAction = defineProviderAction(service, {
  name: "get_client",
  description: "Get one Paymo client by ID.",
  requiredScopes: [],
  inputSchema: getInputSchema,
  outputSchema: s.object("The Paymo client detail response.", {
    client: rawRecordSchema,
  }),
});

const createClientAction = defineProviderAction(service, {
  name: "create_client",
  description: "Create one Paymo client from a JSON client payload.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for creating one Paymo client.", {
    data: clientWriteSchema,
  }),
  outputSchema: s.object("The Paymo client create response.", {
    client: rawRecordSchema,
  }),
});

const updateClientAction = defineProviderAction(service, {
  name: "update_client",
  description: "Update one Paymo client by ID from a JSON client payload.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for updating one Paymo client.", {
    id: idSchema,
    data: clientWriteSchema,
  }),
  outputSchema: s.object("The Paymo client update response.", {
    client: rawRecordSchema,
  }),
});

const deleteClientAction = defineProviderAction(service, {
  name: "delete_client",
  description: "Delete one Paymo client by ID.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for deleting one Paymo client.", {
    id: idSchema,
  }),
  outputSchema: deleteOutputSchema,
});

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  description: "List Paymo projects with optional where and include query parameters.",
  requiredScopes: [],
  inputSchema: listInputSchema,
  outputSchema: s.object("The Paymo projects list response.", {
    projects: s.array("The Paymo projects returned for this request.", rawRecordSchema),
  }),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  description: "Get one Paymo project by ID.",
  requiredScopes: [],
  inputSchema: getInputSchema,
  outputSchema: s.object("The Paymo project detail response.", {
    project: rawRecordSchema,
  }),
});

const createProjectAction = defineProviderAction(service, {
  name: "create_project",
  description: "Create one Paymo project from a JSON project payload.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for creating one Paymo project.", {
    data: projectWriteSchema,
  }),
  outputSchema: s.object("The Paymo project create response.", {
    project: rawRecordSchema,
  }),
});

const updateProjectAction = defineProviderAction(service, {
  name: "update_project",
  description: "Update one Paymo project by ID from a JSON project payload.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for updating one Paymo project.", {
    id: idSchema,
    data: projectWriteSchema,
  }),
  outputSchema: s.object("The Paymo project update response.", {
    project: rawRecordSchema,
  }),
});

const deleteProjectAction = defineProviderAction(service, {
  name: "delete_project",
  description: "Delete one Paymo project by ID.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for deleting one Paymo project.", {
    id: idSchema,
  }),
  outputSchema: deleteOutputSchema,
});

const listTasksAction = defineProviderAction(service, {
  name: "list_tasks",
  description: "List Paymo tasks with optional where and include query parameters.",
  requiredScopes: [],
  inputSchema: listInputSchema,
  outputSchema: s.object("The Paymo tasks list response.", {
    tasks: s.array("The Paymo tasks returned for this request.", rawRecordSchema),
  }),
});

const getTaskAction = defineProviderAction(service, {
  name: "get_task",
  description: "Get one Paymo task by ID.",
  requiredScopes: [],
  inputSchema: getInputSchema,
  outputSchema: s.object("The Paymo task detail response.", {
    task: rawRecordSchema,
  }),
});

const createTaskAction = defineProviderAction(service, {
  name: "create_task",
  description: "Create one Paymo task from a JSON task payload.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for creating one Paymo task.", {
    data: taskWriteSchema,
  }),
  outputSchema: s.object("The Paymo task create response.", {
    task: rawRecordSchema,
  }),
});

const updateTaskAction = defineProviderAction(service, {
  name: "update_task",
  description: "Update one Paymo task by ID from a JSON task payload.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for updating one Paymo task.", {
    id: idSchema,
    data: taskWriteSchema,
  }),
  outputSchema: s.object("The Paymo task update response.", {
    task: rawRecordSchema,
  }),
});

const deleteTaskAction = defineProviderAction(service, {
  name: "delete_task",
  description: "Delete one Paymo task by ID.",
  requiredScopes: [],
  inputSchema: s.object("Input parameters for deleting one Paymo task.", {
    id: idSchema,
  }),
  outputSchema: deleteOutputSchema,
});

export const paymoActions: ActionDefinition[] = [
  accountAction,
  listClientsAction,
  getClientAction,
  createClientAction,
  updateClientAction,
  deleteClientAction,
  listProjectsAction,
  getProjectAction,
  createProjectAction,
  updateProjectAction,
  deleteProjectAction,
  listTasksAction,
  getTaskAction,
  createTaskAction,
  updateTaskAction,
  deleteTaskAction,
];
