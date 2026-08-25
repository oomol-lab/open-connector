import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "harvest";

const isoDateField = s.date("An ISO 8601 date string in YYYY-MM-DD format.");
const isoDateTimeField = s.dateTime("An ISO 8601 date-time string with an explicit UTC offset.");
const timeStringField = s.nonEmptyString("A time string accepted by Harvest, for example 8:00am or 5:30pm.");

const clientIdField = s.positiveInteger("The Harvest client ID.");
const projectIdField = s.positiveInteger("The Harvest project ID.");
const taskIdField = s.positiveInteger("The Harvest task ID.");
const taskAssignmentIdField = s.positiveInteger("The Harvest task assignment ID.");
const timeEntryIdField = s.positiveInteger("The Harvest time entry ID.");
const userIdField = s.positiveInteger("The Harvest user ID.");
const pageField = s.positiveInteger("The page number to request.");
const perPageField = s.integer("The maximum number of records to return per page.", { minimum: 1, maximum: 2000 });

const linksSchema = s.looseRequiredObject(
  "Pagination links returned by Harvest.",
  {
    first: s.nullableString("The URL for the first page of results."),
    next: s.nullableString("The URL for the next page of results."),
    previous: s.nullableString("The URL for the previous page of results."),
    last: s.nullableString("The URL for the last page of results."),
  },
  { optional: ["first", "next", "previous", "last"] },
);

const paginationSchema = s.object(
  "Pagination metadata returned by Harvest.",
  {
    per_page: s.positiveInteger("The number of records returned per page."),
    total_pages: s.positiveInteger("The total number of pages available."),
    total_entries: s.nonNegativeInteger("The total number of matching records."),
    next_page: s.nullableInteger("The next page number when another page is available.", { minimum: 1 }),
    previous_page: s.nullableInteger("The previous page number when a prior page is available.", { minimum: 1 }),
    page: s.positiveInteger("The current page number."),
    links: linksSchema,
  },
  { optional: ["links"] },
);

const userSummarySchema = s.looseObject("A compact Harvest user record.", {
  id: userIdField,
  first_name: s.string("The first name of the user."),
  last_name: s.string("The last name of the user."),
  email: s.string("The email address of the user."),
});

const clientSummarySchema = s.looseObject("A compact Harvest client record.", {
  id: clientIdField,
  name: s.string("The client name."),
  currency: s.string("The currency code associated with the client."),
});

const taskSummarySchema = s.looseObject("A compact Harvest task record.", {
  id: taskIdField,
  name: s.string("The task name."),
});

const projectSummarySchema = s.looseObject("A compact Harvest project record.", {
  id: projectIdField,
  name: s.string("The project name."),
  code: s.nullableString("The project code."),
});

const userSchema = s.looseObject("A Harvest user record.", {
  id: userIdField,
  first_name: s.string("The first name of the user."),
  last_name: s.string("The last name of the user."),
  email: s.string("The email address of the user."),
  timezone: s.string("The timezone configured for the user."),
  is_admin: s.boolean("Whether the user is an administrator."),
  is_active: s.boolean("Whether the user is active."),
});

const clientSchema = s.looseObject("A Harvest client record.", {
  id: clientIdField,
  name: s.string("The client name."),
  is_active: s.boolean("Whether the client is active."),
  address: s.nullableString("The address configured for the client."),
  currency: s.string("The currency code associated with the client."),
});

const projectSchema = s.looseObject("A Harvest project record.", {
  id: projectIdField,
  name: s.string("The project name."),
  code: s.nullableString("The project code."),
  is_active: s.boolean("Whether the project is active."),
  is_billable: s.boolean("Whether the project is billable."),
  budget: s.nullableNumber("The project budget when budgeting by time."),
  client: clientSummarySchema,
});

const taskSchema = s.looseObject("A Harvest task record.", {
  id: taskIdField,
  name: s.string("The task name."),
  billable_by_default: s.boolean("Whether the task is billable by default."),
  default_hourly_rate: s.nullableNumber("The default hourly rate used when the task is added to a project."),
  is_default: s.boolean("Whether the task is added to future projects by default."),
  is_active: s.boolean("Whether the task is active."),
});

const taskAssignmentSchema = s.looseObject("A Harvest project task assignment record.", {
  id: taskAssignmentIdField,
  billable: s.boolean("Whether the task assignment is billable."),
  is_active: s.boolean("Whether the task assignment is active."),
  hourly_rate: s.nullableNumber("The hourly rate used when the project bills by task."),
  budget: s.nullableNumber("The budget used when the project budgets by task."),
  project: projectSummarySchema,
  task: taskSummarySchema,
});

const timeEntrySchema = s.looseObject("A Harvest time entry record.", {
  id: timeEntryIdField,
  spent_date: isoDateField,
  user: userSummarySchema,
  client: s.nullable(clientSummarySchema),
  project: projectSummarySchema,
  task: taskSummarySchema,
  user_assignment: s.unknownObject("The user assignment summary associated with the time entry."),
  external_reference: s.nullable(s.unknownObject("The external reference attached to the time entry.")),
  invoice: s.nullable(s.unknownObject("The invoice summary attached to the time entry.")),
  hours: s.number("The number of decimal hours tracked in the time entry."),
  rounded_hours: s.number("The rounded number of hours used for billing."),
  notes: s.nullableString("Notes attached to the time entry."),
  is_locked: s.boolean("Whether the time entry is locked."),
  is_closed: s.boolean("Whether the time entry is closed."),
  is_billed: s.boolean("Whether the time entry has been billed."),
  timer_started_at: s.nullableString("When the running timer was started."),
  started_time: s.nullableString("The start time stored on the time entry."),
  ended_time: s.nullableString("The end time stored on the time entry."),
  is_running: s.boolean("Whether the time entry is currently running."),
});

const listPageFields = {
  page: pageField,
  perPage: perPageField,
};

const clientsListInputSchema = s.actionInput(
  {
    isActive: s.boolean("Whether to return only active or only inactive clients."),
    updatedSince: isoDateTimeField,
    ...listPageFields,
  },
  [],
  "Input parameters for listing Harvest clients.",
);

const projectsListInputSchema = s.actionInput(
  {
    isActive: s.boolean("Whether to return only active or only inactive projects."),
    clientId: clientIdField,
    updatedSince: isoDateTimeField,
    ...listPageFields,
  },
  [],
  "Input parameters for listing Harvest projects.",
);

const tasksListInputSchema = s.actionInput(
  {
    isActive: s.boolean("Whether to return only active or only inactive tasks."),
    updatedSince: isoDateTimeField,
    ...listPageFields,
  },
  [],
  "Input parameters for listing Harvest tasks.",
);

const taskAssignmentsListInputSchema = s.actionInput(
  {
    projectId: projectIdField,
    isActive: s.boolean("Whether to return only active or only inactive task assignments for the project."),
    updatedSince: isoDateTimeField,
    ...listPageFields,
  },
  ["projectId"],
  "Input parameters for listing Harvest task assignments for a project.",
);

const listTimeEntriesInputSchema = s.actionInput(
  {
    userId: userIdField,
    clientId: clientIdField,
    projectId: projectIdField,
    taskId: taskIdField,
    from: isoDateField,
    to: isoDateField,
    isRunning: s.boolean("Whether to return only running or stopped time entries."),
    updatedSince: isoDateTimeField,
    ...listPageFields,
  },
  [],
  "Input parameters for listing Harvest time entries.",
);

const externalReferenceField = s.unknownObject("The external reference object attached to the time entry.");

const createTimeEntryInputSchema = durationModeInput(
  s.actionInput(
    {
      userId: userIdField,
      projectId: projectIdField,
      taskId: taskIdField,
      spentDate: isoDateField,
      hours: s.number("The number of decimal hours to record when tracking by duration.", { minimum: 0 }),
      startedTime: timeStringField,
      endedTime: timeStringField,
      notes: s.string("Notes attached to the time entry."),
      externalReference: externalReferenceField,
    },
    ["projectId", "taskId", "spentDate"],
    "Input parameters for creating a Harvest time entry.",
  ),
);

const updateTimeEntryInputSchema = {
  ...durationModeInput(
    s.actionInput(
      {
        timeEntryId: timeEntryIdField,
        projectId: projectIdField,
        taskId: taskIdField,
        spentDate: isoDateField,
        hours: s.number("The number of decimal hours tracked in the time entry.", { minimum: 0 }),
        startedTime: timeStringField,
        endedTime: timeStringField,
        notes: s.string("The updated notes for the time entry."),
        externalReference: externalReferenceField,
      },
      ["timeEntryId"],
      "Input parameters for updating a Harvest time entry.",
    ),
  ),
  anyOf: ["projectId", "taskId", "spentDate", "hours", "startedTime", "endedTime", "notes", "externalReference"].map(
    (key) => ({ required: [key] }),
  ),
};

const timeEntryMutationInputSchema = s.actionInput(
  {
    timeEntryId: timeEntryIdField,
  },
  ["timeEntryId"],
  "Input parameters for mutating a Harvest time entry by ID.",
);

export const harvestActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current authenticated Harvest user.",
    inputSchema: s.actionInput({}, [], "The input payload for this action."),
    outputSchema: s.actionOutput({ user: userSchema }, "The authenticated Harvest user response."),
    followUpActions: ["harvest.list_projects"],
  }),
  defineProviderAction(service, {
    name: "list_clients",
    description: "List clients available in the connected Harvest account.",
    inputSchema: clientsListInputSchema,
    outputSchema: s.actionOutput(
      {
        clients: s.array("The clients returned by Harvest.", clientSchema),
        pagination: paginationSchema,
      },
      "A paginated Harvest client list.",
    ),
    followUpActions: ["harvest.get_client", "harvest.list_projects"],
  }),
  defineProviderAction(service, {
    name: "get_client",
    description: "Get a single Harvest client by ID.",
    inputSchema: s.actionInput({ clientId: clientIdField }, ["clientId"], "Input parameters for retrieving a client."),
    outputSchema: s.actionOutput({ client: clientSchema }, "A single Harvest client response."),
    followUpActions: ["harvest.list_projects"],
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List projects available in the connected Harvest account.",
    inputSchema: projectsListInputSchema,
    outputSchema: s.actionOutput(
      {
        projects: s.array("The projects returned by Harvest.", projectSchema),
        pagination: paginationSchema,
      },
      "A paginated Harvest project list.",
    ),
    followUpActions: ["harvest.get_project", "harvest.list_project_task_assignments"],
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a single Harvest project by ID.",
    inputSchema: s.actionInput(
      { projectId: projectIdField },
      ["projectId"],
      "Input parameters for retrieving a project.",
    ),
    outputSchema: s.actionOutput({ project: projectSchema }, "A single Harvest project response."),
    followUpActions: ["harvest.list_project_task_assignments"],
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List tasks available in the connected Harvest account.",
    inputSchema: tasksListInputSchema,
    outputSchema: s.actionOutput(
      {
        tasks: s.array("The tasks returned by Harvest.", taskSchema),
        pagination: paginationSchema,
      },
      "A paginated Harvest task list.",
    ),
    followUpActions: ["harvest.get_task", "harvest.list_time_entries"],
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get a single Harvest task by ID.",
    inputSchema: s.actionInput({ taskId: taskIdField }, ["taskId"], "Input parameters for retrieving a task."),
    outputSchema: s.actionOutput({ task: taskSchema }, "A single Harvest task response."),
  }),
  defineProviderAction(service, {
    name: "list_project_task_assignments",
    description: "List task assignments for a specific Harvest project.",
    inputSchema: taskAssignmentsListInputSchema,
    outputSchema: s.actionOutput(
      {
        task_assignments: s.array("The project task assignments returned by Harvest.", taskAssignmentSchema),
        pagination: paginationSchema,
      },
      "A paginated Harvest project task assignment list.",
    ),
    followUpActions: ["harvest.create_time_entry"],
  }),
  defineProviderAction(service, {
    name: "list_time_entries",
    description: "List Harvest time entries with optional resource and date filters.",
    inputSchema: listTimeEntriesInputSchema,
    outputSchema: s.actionOutput(
      {
        time_entries: s.array("The time entries returned by Harvest.", timeEntrySchema),
        pagination: paginationSchema,
      },
      "A paginated Harvest time entry list.",
    ),
    followUpActions: ["harvest.get_time_entry", "harvest.create_time_entry"],
  }),
  defineProviderAction(service, {
    name: "get_time_entry",
    description: "Get a single Harvest time entry by ID.",
    inputSchema: timeEntryMutationInputSchema,
    outputSchema: s.actionOutput({ time_entry: timeEntrySchema }, "A single Harvest time entry response."),
    followUpActions: ["harvest.update_time_entry"],
  }),
  defineProviderAction(service, {
    name: "create_time_entry",
    description: "Create a new Harvest time entry.",
    inputSchema: createTimeEntryInputSchema,
    outputSchema: s.actionOutput({ time_entry: timeEntrySchema }, "A single Harvest time entry response."),
    followUpActions: ["harvest.stop_time_entry", "harvest.update_time_entry"],
  }),
  defineProviderAction(service, {
    name: "update_time_entry",
    description: "Update an existing Harvest time entry.",
    inputSchema: updateTimeEntryInputSchema,
    outputSchema: s.actionOutput({ time_entry: timeEntrySchema }, "A single Harvest time entry response."),
    followUpActions: ["harvest.stop_time_entry"],
  }),
  defineProviderAction(service, {
    name: "restart_time_entry",
    description: "Restart a stopped Harvest time entry.",
    inputSchema: timeEntryMutationInputSchema,
    outputSchema: s.actionOutput({ time_entry: timeEntrySchema }, "A single Harvest time entry response."),
    followUpActions: ["harvest.stop_time_entry"],
  }),
  defineProviderAction(service, {
    name: "stop_time_entry",
    description: "Stop a running Harvest time entry.",
    inputSchema: timeEntryMutationInputSchema,
    outputSchema: s.actionOutput({ time_entry: timeEntrySchema }, "A single Harvest time entry response."),
  }),
  defineProviderAction(service, {
    name: "delete_time_entry",
    description: "Delete a Harvest time entry by ID.",
    inputSchema: timeEntryMutationInputSchema,
    outputSchema: s.actionOutput(
      { deleted: s.boolean("Whether Harvest deleted the requested time entry.") },
      "The Harvest time entry deletion result.",
    ),
  }),
];

function durationModeInput(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    not: {
      anyOf: [{ required: ["hours", "startedTime"] }, { required: ["hours", "endedTime"] }],
    },
  };
}
