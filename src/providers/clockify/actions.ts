import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "clockify";

const workspaceId = s.nonEmptyString("The Clockify workspace ID.");
const projectId = s.nonEmptyString("The Clockify project ID.");
const taskId = s.nonEmptyString("The Clockify task ID.");
const userId = s.nonEmptyString("The Clockify user ID.");
const page = s.positiveInteger("The 1-based page number to request.");
const pageSize = s.positiveInteger("The number of records to return per page.");
const isoDateTime = s.dateTime("An ISO 8601 date-time string with an explicit UTC offset.");
const isoDuration = s.nonEmptyString("An ISO 8601 duration string.");

const paginationSchema = s.object(
  "Pagination metadata derived from the Clockify request and response.",
  {
    page: s.positiveInteger("The page number requested from Clockify."),
    page_size: s.positiveInteger("The page size requested from Clockify."),
    last_page: s.nullableBoolean("Whether Clockify marked the current page as the last page."),
  },
  { optional: ["page", "page_size", "last_page"] },
);

const workspaceSchema = s.looseObject("A Clockify workspace object.");
const userSchema = s.looseObject("A Clockify user object.");
const projectSchema = s.looseObject("A Clockify project object.");
const taskSchema = s.looseObject("A Clockify task object.");
const timeEntrySchema = s.looseObject("A Clockify time entry object.");

const rateInputSchema = s.object(
  "A Clockify rate configuration.",
  {
    amount: s.nonNegativeInteger("The rate amount in the smallest currency unit."),
    currency: s.nonEmptyString("The ISO currency code for the rate."),
    since: isoDateTime,
  },
  { optional: ["currency", "since"] },
);

const projectEstimateInputSchema = s.object("The project estimate configuration sent to Clockify.", {
  type: s.nonEmptyString("The estimate type accepted by Clockify."),
  estimate: isoDuration,
});

const customFieldValueSchema = s.object("A custom field value sent to Clockify.", {
  customFieldId: s.nonEmptyString("The Clockify custom field ID."),
  value: s.union(
    [
      s.string("A string custom field value."),
      s.integer("An integer custom field value."),
      s.number("A numeric custom field value."),
      s.boolean("A boolean custom field value."),
    ],
    { description: "The value assigned to the custom field." },
  ),
});

const listWorkspacesInputSchema = s.object(
  "The input payload for listing Clockify workspaces.",
  {
    roles: s.stringArray("Optional workspace roles used to filter the Clockify response.", { minItems: 1 }),
  },
  { optional: ["roles"] },
);

const getWorkspaceInputSchema = s.object(
  "The input payload for retrieving a single Clockify workspace.",
  {
    workspaceId,
  },
  { required: ["workspaceId"] },
);

const listProjectsInputSchema = s.object(
  "The input payload for listing Clockify projects.",
  {
    workspaceId,
    name: s.nonEmptyString("Filter projects by a partial project name."),
    page,
    users: s.nonEmptyString("A comma-separated list of user IDs used to filter projects."),
    clients: s.nonEmptyString("A comma-separated list of client IDs used to filter projects."),
    archived: s.boolean("Whether to return archived projects."),
    billable: s.boolean("Whether to return billable projects."),
    hydrated: s.boolean("Whether to request hydrated project objects."),
    "page-size": pageSize,
    "sort-order": s.stringEnum("The project sort order accepted by Clockify.", ["ASCENDING", "DESCENDING"]),
    "is-template": s.boolean("Whether to return project templates."),
    "sort-column": s.nonEmptyString("The project sort column accepted by Clockify."),
    "user-status": s.nonEmptyString("The user membership status filter accepted by Clockify."),
    "client-status": s.nonEmptyString("The client status filter accepted by Clockify."),
    "contains-users": s.boolean("Whether to return only projects that already have users assigned."),
    "contains-client": s.boolean("Whether to return only projects that already have a client assigned."),
  },
  {
    optional: [
      "name",
      "page",
      "users",
      "clients",
      "archived",
      "billable",
      "hydrated",
      "page-size",
      "sort-order",
      "is-template",
      "sort-column",
      "user-status",
      "client-status",
      "contains-users",
      "contains-client",
    ],
  },
);

const getProjectInputSchema = s.object(
  "The input payload for retrieving a single Clockify project.",
  {
    workspaceId,
    projectId,
    hydrated: s.boolean("Whether to request a hydrated project object."),
  },
  { optional: ["hydrated"] },
);

const createProjectInputSchema = s.object(
  "The input payload for creating a Clockify project.",
  {
    workspaceId,
    name: s.nonEmptyString("The project name to create."),
    note: s.string("The project note."),
    color: s.string("The project color in hexadecimal notation."),
    isPublic: s.boolean("Whether the created project should be public."),
    billable: s.boolean("Whether the created project should be billable."),
    clientId: s.nonEmptyString("The client ID associated with the project."),
    estimate: projectEstimateInputSchema,
    hourlyRate: s.object("The hourly rate configuration sent to Clockify.", {
      amount: s.nonNegativeInteger("The hourly rate amount in the smallest currency unit."),
      currency: s.nonEmptyString("The ISO currency code for the hourly rate."),
    }),
  },
  { optional: ["note", "color", "isPublic", "billable", "clientId", "estimate", "hourlyRate"] },
);

const updateProjectInputSchema = withAnyOf(
  s.object(
    "The input payload for updating a Clockify project.",
    {
      workspaceId,
      projectId,
      name: s.nonEmptyString("The updated project name."),
      note: s.string("The updated project note."),
      color: s.string("The updated project color."),
      isPublic: s.boolean("Whether the updated project should be public."),
      archived: s.boolean("Whether the updated project should be archived."),
      billable: s.boolean("Whether the updated project should be billable."),
      clientId: s.nonEmptyString("The updated client ID."),
      costRate: rateInputSchema,
      hourlyRate: rateInputSchema,
    },
    {
      optional: ["name", "note", "color", "isPublic", "archived", "billable", "clientId", "costRate", "hourlyRate"],
    },
  ),
  [["name"], ["note"], ["color"], ["isPublic"], ["archived"], ["billable"], ["clientId"], ["costRate"], ["hourlyRate"]],
);

const deleteProjectInputSchema = s.object(
  "The input payload for deleting a Clockify project.",
  {
    workspaceId,
    projectId,
  },
  { required: ["workspaceId", "projectId"] },
);

const listTasksInputSchema = s.object(
  "The input payload for listing Clockify tasks.",
  {
    workspaceId,
    projectId,
    name: s.nonEmptyString("Filter tasks by a partial task name."),
    page,
    "is-active": s.boolean("Whether to return only active tasks."),
    "page-size": pageSize,
    "sort-order": s.stringEnum("The task sort order accepted by Clockify.", ["ASCENDING", "DESCENDING"]),
    "sort-column": s.nonEmptyString("The task sort column accepted by Clockify."),
    "strict-name-search": s.boolean("Whether to use strict task name matching."),
  },
  { optional: ["name", "page", "is-active", "page-size", "sort-order", "sort-column", "strict-name-search"] },
);

const createTaskInputSchema = s.object(
  "The input payload for creating a Clockify task.",
  {
    workspaceId,
    projectId,
    name: s.nonEmptyString("The task name to create."),
    status: s.stringEnum("The initial task status accepted by Clockify.", ["ACTIVE", "DONE"]),
    billable: s.boolean("Whether the created task should be billable."),
    estimate: isoDuration,
    assigneeIds: s.stringArray("The assignee IDs for the created task.", { minItems: 1 }),
  },
  { optional: ["status", "billable", "estimate", "assigneeIds"] },
);

const listTimeEntriesInputSchema = s.object(
  "The input payload for listing Clockify time entries.",
  {
    workspaceId,
    userId,
    start: isoDateTime,
    end: isoDateTime,
    page,
    tags: s.nonEmptyString("A comma-separated list of tag IDs used to filter time entries."),
    task: taskId,
    project: projectId,
    hydrated: s.boolean("Whether to request hydrated time entry objects."),
    "page-size": pageSize,
    description: s.nonEmptyString("Only return entries whose description matches this text."),
    "in-progress": s.boolean("Whether to return only in-progress time entries."),
  },
  {
    optional: [
      "start",
      "end",
      "page",
      "tags",
      "task",
      "project",
      "hydrated",
      "page-size",
      "description",
      "in-progress",
    ],
  },
);

const createTimeEntryInputSchema = s.object(
  "The input payload for creating a Clockify time entry.",
  {
    workspaceId,
    userId,
    start: isoDateTime,
    end: isoDateTime,
    tagIds: s.stringArray("The tag IDs attached to the time entry.", { minItems: 1 }),
    taskId,
    billable: s.boolean("Whether the time entry should be billable."),
    projectId,
    description: s.string("The time entry description."),
    customFieldValues: s.array("The custom field values attached to the time entry.", customFieldValueSchema, {
      minItems: 1,
    }),
  },
  { optional: ["end", "tagIds", "taskId", "billable", "projectId", "description", "customFieldValues"] },
);

export const clockifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the currently authenticated Clockify user.",
    followUpActions: ["clockify.list_workspaces", "clockify.list_time_entries"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current Clockify user lookup result.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List the Clockify workspaces available to the authenticated user.",
    inputSchema: listWorkspacesInputSchema,
    outputSchema: s.object("The Clockify workspace list.", {
      workspaces: s.array("The workspaces returned by Clockify.", workspaceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get a single Clockify workspace by ID.",
    followUpActions: ["clockify.list_projects"],
    inputSchema: getWorkspaceInputSchema,
    outputSchema: s.object("The Clockify workspace lookup result.", {
      workspace: workspaceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Clockify projects in a workspace.",
    inputSchema: listProjectsInputSchema,
    outputSchema: paginatedOutput(
      "The Clockify project list.",
      "projects",
      "The projects returned by Clockify.",
      projectSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a single Clockify project by ID.",
    followUpActions: ["clockify.update_project", "clockify.delete_project", "clockify.list_tasks"],
    inputSchema: getProjectInputSchema,
    outputSchema: s.object("The Clockify project lookup result.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a new Clockify project in a workspace.",
    followUpActions: ["clockify.get_project"],
    inputSchema: createProjectInputSchema,
    outputSchema: s.object("The newly created Clockify project.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update an existing Clockify project.",
    inputSchema: updateProjectInputSchema,
    outputSchema: s.object("The updated Clockify project.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete a Clockify project by ID.",
    inputSchema: deleteProjectInputSchema,
    outputSchema: s.object("The Clockify project deletion result.", {
      deleted: s.boolean("Whether Clockify deleted the requested project."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Clockify tasks for a project.",
    inputSchema: listTasksInputSchema,
    outputSchema: paginatedOutput("The Clockify task list.", "tasks", "The tasks returned by Clockify.", taskSchema),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a new Clockify task inside a project.",
    inputSchema: createTaskInputSchema,
    outputSchema: s.object("The newly created Clockify task.", {
      task: taskSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_time_entries",
    description: "List Clockify time entries for a user in a workspace.",
    inputSchema: listTimeEntriesInputSchema,
    outputSchema: paginatedOutput(
      "The Clockify time entry list.",
      "time_entries",
      "The time entries returned by Clockify.",
      timeEntrySchema,
    ),
  }),
  defineProviderAction(service, {
    name: "create_time_entry",
    description: "Create a new Clockify time entry for a user.",
    followUpActions: ["clockify.list_time_entries"],
    inputSchema: createTimeEntryInputSchema,
    outputSchema: s.object("The newly created Clockify time entry.", {
      time_entry: timeEntrySchema,
    }),
  }),
];

function paginatedOutput(
  description: string,
  key: string,
  itemDescription: string,
  itemSchema: JsonSchema,
): JsonSchema {
  return s.object(description, {
    [key]: s.array(itemDescription, itemSchema),
    pagination: s.nullable(paginationSchema),
  });
}

function withAnyOf(schema: JsonSchema, requiredSets: string[][]): JsonSchema {
  return {
    ...schema,
    anyOf: requiredSets.map((required) => ({ required })),
  };
}
