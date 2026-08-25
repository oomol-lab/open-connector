import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "toggl";

const workspaceId = s.positiveInteger("The Toggl Track workspace ID.");
const projectId = s.positiveInteger("The Toggl Track project ID.");
const taskId = s.positiveInteger("The Toggl Track task ID.");
const tagId = s.positiveInteger("The Toggl Track tag ID.");
const timeEntryId = s.positiveInteger("The Toggl Track time entry ID.");
const userId = s.positiveInteger("The Toggl Track user ID.");
const rawObject = s.looseObject("A Toggl Track object returned by the API.");
const isoDateTime = s.dateTime("An ISO 8601 date-time string with an explicit UTC offset.");
const dateOrDateTime = s.union([s.date("An ISO 8601 date string."), isoDateTime], {
  description: "An ISO 8601 date or date-time string.",
});
const page = s.positiveInteger("The 1-based page number to request.");
const perPage = s.integer("The maximum number of items to return per page.", { minimum: 1, maximum: 200 });

const noInput = s.object("Input parameters for this Toggl Track action.", {});
const workspaceLookup = s.object("Input parameters for getting a Toggl Track workspace.", { workspaceId });
const projectLookup = s.object("Input parameters for getting a Toggl Track project.", { workspaceId, projectId });
const taskLookup = s.object("Input parameters for getting a Toggl Track task.", { workspaceId, projectId, taskId });
const tagLookup = s.object("Input parameters for a Toggl Track tag.", { workspaceId, tagId });
const timeEntryLookup = s.object("Input parameters for a Toggl Track time entry.", { workspaceId, timeEntryId });

const projectFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The project name."),
  active: s.boolean("Whether the project should be active."),
  billable: s.boolean("Whether the project should be billable."),
  clientId: s.positiveInteger("The client ID to associate with the project."),
  clientName: s.nonEmptyString("The client name to associate with the project."),
  color: s.nonEmptyString("The hex color string used for the project."),
  currency: s.nonEmptyString("The currency code stored on the project."),
  isPrivate: s.boolean("Whether the project should be private."),
  isShared: s.boolean("Whether the project should be shared."),
  rate: s.number("The hourly rate stored on the project."),
  rateChangeMode: s.nonEmptyString("The rate change mode stored on the project."),
  startDate: s.date("The project start date in YYYY-MM-DD format."),
  endDate: s.date("The project end date in YYYY-MM-DD format."),
  estimatedHours: s.nonNegativeInteger("The estimated project duration in hours."),
  template: s.boolean("Whether the project should be marked as a template."),
  templateId: s.positiveInteger("The template ID used when creating a project from a template."),
};

const taskFields: Record<string, JsonSchema> = {
  name: s.nonEmptyString("The task name."),
  active: s.boolean("Whether the task should be active."),
  estimatedSeconds: s.nonNegativeInteger("The estimated task duration in seconds."),
  externalReference: s.nonEmptyString("The external reference stored on the task."),
  userId,
};

const timeEntryFields: Record<string, JsonSchema> = {
  billable: s.boolean("Whether the time entry should be billable."),
  createdWith: s.nonEmptyString("The client identifier stored on the time entry."),
  description: s.string("The time entry description."),
  duration: s.nonNegativeInteger("The time entry duration in seconds."),
  projectId,
  start: isoDateTime,
  startDate: s.date("The date part used together with start when creating the time entry."),
  stop: isoDateTime,
  tagIds: s.array("The tag IDs attached to the time entry.", tagId, { minItems: 1 }),
  tags: s.stringArray("The tag names attached to the time entry.", { minItems: 1 }),
  taskId,
  userId,
};

const optionalProjectFields = Object.keys(projectFields);
const optionalTaskFields = Object.keys(taskFields);
const optionalTimeEntryFields = Object.keys(timeEntryFields);

export const togglActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Toggl Track user profile.",
    inputSchema: noInput,
    outputSchema: s.object({ user: rawObject }),
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List Toggl Track workspaces for the current user.",
    inputSchema: noInput,
    outputSchema: s.object({ workspaces: s.array("The Toggl Track workspaces.", rawObject) }),
  }),
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get one Toggl Track workspace.",
    inputSchema: workspaceLookup,
    outputSchema: s.object({ workspace: rawObject }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Toggl Track projects in a workspace.",
    inputSchema: s.object(
      "Input parameters for listing Toggl Track projects in a workspace.",
      {
        workspaceId,
        active: s.union([s.boolean("Whether to return only active projects."), s.literal("both")], {
          description: "Whether to return only active projects or both active and inactive projects.",
        }),
        since: s.nonNegativeInteger("A UNIX timestamp used to fetch changed projects since that moment."),
        page,
        sortField: s.nonEmptyString("The project field used for sorting the result set."),
        sortOrder: s.nonEmptyString("The sort direction used for ordering the result set."),
        perPage,
        search: s.nonEmptyString("A search string used to filter projects by name."),
      },
      { optional: ["active", "since", "page", "sortField", "sortOrder", "perPage", "search"] },
    ),
    outputSchema: s.object({ projects: s.array("The Toggl Track projects.", rawObject) }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Toggl Track project.",
    inputSchema: projectLookup,
    outputSchema: s.object({ project: rawObject }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Toggl Track project.",
    inputSchema: s.object(
      "Input parameters for creating a Toggl Track project.",
      { workspaceId, ...projectFields },
      { optional: optionalProjectFields },
    ),
    outputSchema: s.object({ project: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update a Toggl Track project.",
    inputSchema: s.object(
      "Input parameters for updating a Toggl Track project.",
      { workspaceId, projectId, ...projectFields },
      { optional: optionalProjectFields },
    ),
    outputSchema: s.object({ project: rawObject }),
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete a Toggl Track project.",
    inputSchema: projectLookup,
    outputSchema: s.object({ deleted: s.literal(true) }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Toggl Track tasks in a project.",
    inputSchema: s.object(
      "Input parameters for listing tasks in a Toggl Track project.",
      {
        workspaceId,
        projectId,
        active: s.boolean("Whether to return only active tasks."),
      },
      { optional: ["active"] },
    ),
    outputSchema: s.object({ tasks: s.array("The Toggl Track tasks.", rawObject) }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get one Toggl Track task.",
    inputSchema: taskLookup,
    outputSchema: s.object({ task: rawObject }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a Toggl Track task.",
    inputSchema: s.object(
      "Input parameters for creating a Toggl Track task.",
      { workspaceId, projectId, ...taskFields },
      { optional: optionalTaskFields.filter((key) => key !== "name") },
    ),
    outputSchema: s.object({ task: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Toggl Track task.",
    inputSchema: s.object(
      "Input parameters for updating a Toggl Track task.",
      { workspaceId, projectId, taskId, ...taskFields },
      { optional: optionalTaskFields },
    ),
    outputSchema: s.object({ task: rawObject }),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete a Toggl Track task.",
    inputSchema: taskLookup,
    outputSchema: s.object({ deleted: s.literal(true) }),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Toggl Track tags in a workspace.",
    inputSchema: s.object(
      "Input parameters for listing Toggl Track tags in a workspace.",
      {
        workspaceId,
        page,
        perPage,
        search: s.nonEmptyString("A search string used to filter tags by name."),
      },
      { optional: ["page", "perPage", "search"] },
    ),
    outputSchema: s.object({ tags: s.array("The Toggl Track tags.", rawObject) }),
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a Toggl Track tag.",
    inputSchema: s.object("Input parameters for creating a Toggl Track tag.", {
      workspaceId,
      name: s.nonEmptyString("The tag name."),
    }),
    outputSchema: s.object({ tag: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_tag",
    description: "Update a Toggl Track tag.",
    inputSchema: s.object("Input parameters for updating a Toggl Track tag.", {
      workspaceId,
      tagId,
      name: s.nonEmptyString("The updated tag name."),
    }),
    outputSchema: s.object({ tag: rawObject }),
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete a Toggl Track tag.",
    inputSchema: tagLookup,
    outputSchema: s.object({ deleted: s.literal(true) }),
  }),
  defineProviderAction(service, {
    name: "list_time_entries",
    description: "List Toggl Track time entries for the current user.",
    inputSchema: s.object(
      "Input parameters for listing Toggl Track time entries.",
      {
        since: dateOrDateTime,
        before: dateOrDateTime,
        startDate: dateOrDateTime,
        endDate: dateOrDateTime,
      },
      { optional: ["since", "before", "startDate", "endDate"] },
    ),
    outputSchema: s.object({ time_entries: s.array("The Toggl Track time entries.", rawObject) }),
  }),
  defineProviderAction(service, {
    name: "get_current_time_entry",
    description: "Get the currently running Toggl Track time entry, if any.",
    inputSchema: noInput,
    outputSchema: s.object({ time_entry: s.nullable(rawObject) }),
  }),
  defineProviderAction(service, {
    name: "get_time_entry",
    description: "Get one Toggl Track time entry.",
    inputSchema: s.object("Input parameters for getting a Toggl Track time entry.", { timeEntryId }),
    outputSchema: s.object({ time_entry: rawObject }),
  }),
  defineProviderAction(service, {
    name: "create_time_entry",
    description: "Create a Toggl Track time entry.",
    inputSchema: s.object(
      "Input parameters for creating a Toggl Track time entry.",
      { workspaceId, ...timeEntryFields },
      { optional: optionalTimeEntryFields.filter((key) => key !== "start") },
    ),
    outputSchema: s.object({ time_entry: rawObject }),
  }),
  defineProviderAction(service, {
    name: "update_time_entry",
    description: "Update a Toggl Track time entry.",
    inputSchema: s.object(
      "Input parameters for updating a Toggl Track time entry.",
      { workspaceId, timeEntryId, ...timeEntryFields },
      { optional: optionalTimeEntryFields },
    ),
    outputSchema: s.object({ time_entry: rawObject }),
  }),
  defineProviderAction(service, {
    name: "stop_time_entry",
    description: "Stop a running Toggl Track time entry.",
    inputSchema: timeEntryLookup,
    outputSchema: s.object({ time_entry: rawObject }),
  }),
  defineProviderAction(service, {
    name: "delete_time_entry",
    description: "Delete a Toggl Track time entry.",
    inputSchema: timeEntryLookup,
    outputSchema: s.object({ deleted: s.literal(true) }),
  }),
];
