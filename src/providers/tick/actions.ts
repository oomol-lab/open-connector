import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tick";

const positiveId = (description: string) => s.integer(description, { minimum: 1 });
const pageInput = {
  page: s.integer("The one-based result page to return.", { minimum: 1 }),
};

const clientSchema = s.looseRequiredObject("A Tick client.", {
  id: s.optional(positiveId("The client ID.")),
  name: s.optional(s.string("The client name.")),
  archive: s.optional(s.boolean("Whether the client is archived.")),
  url: s.optional(s.string("The API URL for the client.")),
  updated_at: s.optional(s.string("When the client was last updated.")),
});

const projectSchema = s.looseRequiredObject("A Tick project.", {
  id: s.optional(positiveId("The project ID.")),
  name: s.optional(s.string("The project name.")),
  budget: s.optional(s.number("The project budget in hours.")),
  date_closed: s.optional(s.nullableString("The date the project was closed, or null if open.")),
  notifications: s.optional(s.boolean("Whether budget notifications are enabled.")),
  billable: s.optional(s.boolean("Whether the project is billable.")),
  recurring: s.optional(s.boolean("Whether the project recurs.")),
  client_id: s.optional(positiveId("The associated client ID.")),
  owner_id: s.optional(positiveId("The project owner user ID.")),
  url: s.optional(s.string("The API URL for the project.")),
  created_at: s.optional(s.string("When the project was created.")),
  updated_at: s.optional(s.string("When the project was last updated.")),
});

const taskSchema = s.looseRequiredObject("A Tick task.", {
  id: s.optional(s.anyOf("The task ID.", [s.string("The task ID as text."), positiveId("The numeric task ID.")])),
  name: s.optional(s.string("The task name.")),
  budget: s.optional(s.number("The task budget in hours.")),
  position: s.optional(s.integer("The task position within its project.")),
  project_id: s.optional(positiveId("The associated project ID.")),
  date_closed: s.optional(s.nullableString("The date the task was closed, or null if open.")),
  billable: s.optional(s.boolean("Whether time on the task is billable.")),
  url: s.optional(s.string("The API URL for the task.")),
  created_at: s.optional(s.string("When the task was created.")),
  updated_at: s.optional(s.string("When the task was last updated.")),
});

const userSchema = s.looseRequiredObject("A Tick subscription user.", {
  id: s.optional(positiveId("The user ID.")),
  first_name: s.optional(s.string("The user's first name.")),
  last_name: s.optional(s.string("The user's last name.")),
  email: s.optional(s.string("The user's email address.")),
  timezone: s.optional(s.string("The user's time zone.")),
  updated_at: s.optional(s.string("When the user was last updated.")),
});

const entrySchema = s.looseRequiredObject("A Tick time entry.", {
  id: s.optional(
    s.anyOf("The time entry ID.", [s.string("The entry ID as text."), positiveId("The numeric entry ID.")]),
  ),
  date: s.optional(s.string("The work date in YYYY-MM-DD format.")),
  hours: s.optional(s.number("The number of hours recorded.")),
  notes: s.optional(s.string("Notes recorded with the time entry.")),
  task_id: s.optional(positiveId("The associated task ID.")),
  user_id: s.optional(positiveId("The associated user ID.")),
  billed: s.optional(s.boolean("Whether the time entry has been billed.")),
  url: s.optional(s.string("The API URL for the time entry.")),
  created_at: s.optional(s.string("When the time entry was created.")),
  updated_at: s.optional(s.string("When the time entry was last updated.")),
});

const listClientsAction = defineProviderAction(service, {
  name: "list_clients",
  operationType: "read",
  description: "List Tick clients with open projects, or include every client.",
  inputSchema: s.object(
    "The client list options.",
    { ...pageInput, includeAll: s.boolean("Whether to include clients without open projects.") },
    { optional: ["page", "includeAll"] },
  ),
  outputSchema: s.object("The Tick client list response.", {
    clients: s.array("The returned clients.", clientSchema),
  }),
});

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  operationType: "read",
  description: "List open or closed Tick projects.",
  inputSchema: s.object(
    "The project list options.",
    {
      ...pageInput,
      closed: s.boolean("Whether to list closed projects instead of open projects."),
    },
    { optional: ["page", "closed"] },
  ),
  outputSchema: s.object("The Tick project list response.", {
    projects: s.array("The returned projects.", projectSchema),
  }),
});

const listTasksAction = defineProviderAction(service, {
  name: "list_tasks",
  operationType: "read",
  description: "List open or closed Tick tasks, optionally within one project.",
  inputSchema: s.object(
    "The task list options.",
    {
      ...pageInput,
      projectId: positiveId("The project whose tasks should be returned."),
      closed: s.boolean("Whether to list closed tasks instead of open tasks."),
    },
    { optional: ["page", "projectId", "closed"] },
  ),
  outputSchema: s.object("The Tick task list response.", {
    tasks: s.array("The returned tasks.", taskSchema),
  }),
});

const listUsersAction = defineProviderAction(service, {
  name: "list_users",
  operationType: "read",
  description: "List active or deleted users visible to the Tick API token.",
  inputSchema: s.object(
    "The user list options.",
    {
      ...pageInput,
      deleted: s.boolean("Whether to list deleted users with time entries instead of active users."),
    },
    { optional: ["page", "deleted"] },
  ),
  outputSchema: s.object("The Tick user list response.", {
    users: s.array("The returned users.", userSchema),
  }),
});

const listEntriesAction = defineProviderAction(service, {
  name: "list_entries",
  operationType: "read",
  description: "List Tick time entries by date range or update timestamp.",
  inputSchema: s.object(
    "The time entry filters. Provide both startDate and endDate, or provide updatedAt.",
    {
      ...pageInput,
      startDate: s.string("The inclusive start date in YYYY-MM-DD format.", { format: "date" }),
      endDate: s.string("The inclusive end date in YYYY-MM-DD format.", { format: "date" }),
      updatedAt: s.string("Return entries created or modified after this ISO 8601 timestamp.", {
        format: "date-time",
      }),
      billable: s.boolean("Filter entries by whether their tasks are billable."),
      billed: s.boolean("Filter entries by whether they have been billed."),
      projectId: positiveId("Filter entries by project ID."),
      taskId: positiveId("Filter entries by task ID."),
      userId: positiveId("Filter entries by user ID."),
    },
    {
      optional: ["page", "startDate", "endDate", "updatedAt", "billable", "billed", "projectId", "taskId", "userId"],
    },
  ),
  outputSchema: s.object("The Tick time entry list response.", {
    entries: s.array("The returned time entries.", entrySchema),
  }),
});

const getEntryAction = defineProviderAction(service, {
  name: "get_entry",
  operationType: "read",
  description: "Retrieve one Tick time entry by ID.",
  inputSchema: s.object("The time entry lookup input.", {
    entryId: positiveId("The time entry ID."),
  }),
  outputSchema: s.object("The Tick time entry response.", { entry: entrySchema }),
});

const createEntryAction = defineProviderAction(service, {
  name: "create_entry",
  operationType: "write",
  description: "Create a Tick time entry.",
  inputSchema: s.object(
    "The new time entry fields.",
    {
      date: s.string("The work date in YYYY-MM-DD format.", { format: "date" }),
      hours: s.number("The positive number of hours to record.", { exclusiveMinimum: 0 }),
      taskId: positiveId("The task receiving the time entry."),
      notes: s.string("Notes to record with the time entry."),
      userId: positiveId("The user receiving the entry; ignored for non-administrators."),
    },
    { optional: ["notes", "userId"] },
  ),
  outputSchema: s.object("The created Tick time entry response.", { entry: entrySchema }),
});

const updateEntryAction = defineProviderAction(service, {
  name: "update_entry",
  operationType: "write",
  description: "Update fields on an existing Tick time entry.",
  inputSchema: s.object(
    "The time entry ID and replacement fields.",
    {
      entryId: positiveId("The time entry ID."),
      date: s.string("The replacement work date in YYYY-MM-DD format.", { format: "date" }),
      hours: s.number("The replacement positive number of hours.", { exclusiveMinimum: 0 }),
      taskId: positiveId("The replacement task ID."),
      notes: s.string("The replacement notes."),
      userId: positiveId("The replacement user ID; ignored for non-administrators."),
      billed: s.boolean("Whether the entry has been billed."),
    },
    { optional: ["date", "hours", "taskId", "notes", "userId", "billed"] },
  ),
  outputSchema: s.object("The updated Tick time entry response.", { entry: entrySchema }),
});

const deleteEntryAction = defineProviderAction(service, {
  name: "delete_entry",
  operationType: "destructive",
  description: "Permanently delete a Tick time entry.",
  inputSchema: s.object("The time entry deletion input.", {
    entryId: positiveId("The time entry ID."),
  }),
  outputSchema: s.object("The Tick time entry deletion response.", {
    deleted: s.boolean("Whether Tick accepted the deletion."),
  }),
});

export const tickActions: ProviderActionDefinition[] = [
  listClientsAction,
  listProjectsAction,
  listTasksAction,
  listUsersAction,
  listEntriesAction,
  getEntryAction,
  createEntryAction,
  updateEntryAction,
  deleteEntryAction,
];
