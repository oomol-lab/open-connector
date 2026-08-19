import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "label_studio";

const projectIdSchema = s.integer("The Label Studio project ID.");
const taskIdSchema = s.integer("The Label Studio task ID.");

const paginationInputSchema = {
  page: s.positiveInteger("The page number within the paginated result set."),
  pageSize: s.positiveInteger("The number of results to return per page."),
};
const paginationOutputSchema = {
  count: s.integer("The total number of matching records when returned by Label Studio."),
  next: s.nullableString("The URL of the next page when returned by Label Studio."),
  previous: s.nullableString("The URL of the previous page when returned by Label Studio."),
};
const userSchema = s.looseObject("A Label Studio user object.", {
  id: s.integer("The user ID."),
  username: s.string("The user name."),
  email: s.string("The user email address."),
});
const projectSchema = s.looseObject("A Label Studio project object.", {
  id: projectIdSchema,
  title: s.string("The project title."),
  description: s.nullableString("The project description."),
  label_config: s.nullableString("The project labeling configuration XML."),
});
const taskSchema = s.looseObject("A Label Studio task object.", {
  id: taskIdSchema,
  project: projectIdSchema,
  data: s.looseObject("The task data object."),
  meta: s.nullable(s.looseObject("The task metadata object.")),
});
const projectFilterSchema = {
  archived: s.boolean("Whether to return projects that belong to archived workspaces."),
  filter: s.stringEnum("The pinned project filter.", ["all", "pinned_only", "exclude_pinned"]),
  ids: s.string("Comma-separated project IDs to include."),
  include: s.string("Comma-separated count fields to include in the response."),
  membersLimit: s.positiveInteger("The maximum number of project members to return."),
  ordering: s.string("The project ordering expression."),
  search: s.string("A search term for project title and description."),
  state: s.string("The project state to filter by."),
  title: s.string("A case-insensitive project title substring to filter by."),
  workspace: s.integer("The workspace ID to filter by."),
};
const taskFilterSchema = {
  fields: s.stringEnum("The task field detail mode.", ["task_only", "all"]),
  include: s.string("Comma-separated task fields to include."),
  onlyAnnotated: s.boolean("Whether to return only tasks that have annotations."),
  project: projectIdSchema,
  query: s.string("A JSON-encoded Label Studio Data Manager query."),
  resolveUri: s.boolean("Whether to resolve task data URIs using cloud storage."),
  review: s.boolean("Whether to return tasks for review."),
  selectedItems: s.string("A JSON string of selected task IDs for review workflow."),
  view: s.integer("The Label Studio view ID."),
};

export const labelStudioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the Label Studio user associated with the connected API key.",
    inputSchema: s.object("The input payload for reading the current Label Studio user.", {}),
    outputSchema: s.object("The current Label Studio user response.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Label Studio projects visible to the connected API key.",
    followUpActions: ["label_studio.get_project", "label_studio.list_tasks"],
    inputSchema: s.object(
      "The input payload for listing Label Studio projects.",
      {
        ...paginationInputSchema,
        ...projectFilterSchema,
      },
      {
        optional: [
          "page",
          "pageSize",
          "archived",
          "filter",
          "ids",
          "include",
          "membersLimit",
          "ordering",
          "search",
          "state",
          "title",
          "workspace",
        ],
      },
    ),
    outputSchema: s.object("The Label Studio project list response.", {
      ...paginationOutputSchema,
      projects: s.array("Projects returned by Label Studio.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve one Label Studio project by ID.",
    followUpActions: ["label_studio.list_tasks"],
    inputSchema: s.object(
      "The input payload for reading one Label Studio project.",
      {
        projectId: projectIdSchema,
        membersLimit: s.positiveInteger("The maximum number of project members to return."),
      },
      { optional: ["membersLimit"] },
    ),
    outputSchema: s.object("The Label Studio project response.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Label Studio project with a title and optional labeling configuration.",
    followUpActions: ["label_studio.get_project", "label_studio.create_task"],
    inputSchema: s.object(
      "The input payload for creating a Label Studio project.",
      {
        title: s.string("The project title.", { minLength: 1 }),
        labelConfig: s.string("The Label Studio labeling configuration XML.", { minLength: 1 }),
        description: s.nullableString("The project description."),
        workspace: s.integer("The workspace ID for the new project."),
        color: s.nullableString("The project color value."),
      },
      { optional: ["labelConfig", "description", "workspace", "color"] },
    ),
    outputSchema: s.object("The Label Studio project creation response.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Label Studio tasks, optionally filtered by project and Data Manager query.",
    followUpActions: ["label_studio.create_task"],
    inputSchema: s.object(
      "The input payload for listing Label Studio tasks.",
      {
        ...paginationInputSchema,
        ...taskFilterSchema,
      },
      {
        optional: [
          "page",
          "pageSize",
          "fields",
          "include",
          "onlyAnnotated",
          "project",
          "query",
          "resolveUri",
          "review",
          "selectedItems",
          "view",
        ],
      },
    ),
    outputSchema: s.object("The Label Studio task list response.", {
      ...paginationOutputSchema,
      tasks: s.array("Tasks returned by Label Studio.", taskSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create one Label Studio task from JSON task data.",
    inputSchema: s.object(
      "The input payload for creating a Label Studio task.",
      {
        project: projectIdSchema,
        data: s.looseObject("The task data object formatted for the project label config."),
        meta: s.nullable(s.looseObject("Task metadata passed to ML backends.")),
      },
      { optional: ["project", "meta"] },
    ),
    outputSchema: s.object("The Label Studio task creation response.", {
      task: taskSchema,
    }),
  }),
];
