import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nozbe_teams";

const idSchema = s.string("The 16-character Nozbe resource ID.", {
  minLength: 16,
  maxLength: 16,
  pattern: "^[a-zA-Z0-9]{16}$",
});
const projectIdSchema = s.oneOf(
  [
    idSchema,
    s.literal("task_me", { description: "The personal Single Tasks project identifier." }),
    s.literal("", { description: "An empty project assignment accepted by Nozbe." }),
  ],
  { description: "The Nozbe project ID or the personal task list identifier." },
);
const responsibleIdSchema = s.oneOf(
  [idSchema, s.literal("author", { description: "Assign the task to its author." })],
  { description: "The responsible Nozbe user ID or the special author value." },
);
const timestampSchema = s.nonNegativeInteger("A Unix timestamp in milliseconds.");
const nullableTimestampSchema = s.nullable(timestampSchema);
const nullableDurationSchema = s.nullable(
  s.nonNegativeInteger("A non-negative duration value in Nozbe's integer format."),
);
const listLimitSchema = s.integer("The maximum number of resources to return.", {
  minimum: 1,
  maximum: 10000,
});
const listOffsetSchema = s.nonNegativeInteger("The number of resources to skip.");
const sortBySchema = s.string(
  "Comma-separated fields used for sorting. Prefix a field with '-' for descending order.",
  { pattern: "^[-a-z_,]*$" },
);

const projectColors = [
  "elwis",
  "felus",
  "fluffy",
  "luna",
  "maja",
  "pedro",
  "rufus",
  "toto",
  "aquamarine",
  "aubergine",
  "blue",
  "brown",
  "burntsienna",
  "darkgreen",
  "deeppurple",
  "dustpink",
  "green",
  "heather",
  "indigo",
  "karmin",
  "lightblue",
  "lightpink",
  "mauve",
  "midnight",
  "navy",
  "ocean",
  "ocher",
  "olive",
  "orange",
  "pink",
  "purple",
  "red",
  "sand",
  "stone",
  "taupe",
  "teal",
  "ultramarine",
  "yellow",
];
const projectColorInputSchema = s.nullable(s.stringEnum("The predefined Nozbe project color.", projectColors));

const teamSchema = s.looseObject("A Nozbe team resource.", {
  id: idSchema,
  name: s.string("The team name."),
  is_personal: s.boolean("Whether this is a personal team."),
  color: s.string("The team avatar color."),
  avatar_url: s.nullable(s.string("The team avatar URL.")),
  limits: s.nullable(s.string("The serialized team limit information.")),
  plan_info: s.nullable(s.string("The serialized team plan information.")),
  sidebar_position: s.number("The team's sidebar position."),
  ai_credits_used: s.number("The number of AI credits used by the team."),
});

const projectSchema = s.looseObject("A Nozbe project resource.", {
  id: idSchema,
  name: s.string("The project name."),
  team_id: idSchema,
  author_id: idSchema,
  created_at: timestampSchema,
  ended_at: nullableTimestampSchema,
  last_event_at: timestampSchema,
  last_seen_event_at: nullableTimestampSchema,
  is_open: s.boolean("Whether the project is open."),
  is_favorite: s.boolean("Whether the project is marked as a favorite."),
  is_single_actions: s.boolean("Whether the project contains single actions."),
  is_template: s.boolean("Whether the project is a template."),
  color: s.nullable(s.string("The project's predefined color.")),
  team_color: s.nullable(s.string("The team's color for the project.")),
  description: s.nullable(s.string("The project description.")),
  extra: s.nullable(s.string("Additional serialized project metadata.")),
  preferences: s.nullable(s.string("Serialized project preferences.")),
  sidebar_position: s.nullable(s.number("The project's sidebar position.")),
  shared_team_id: s.nullable(idSchema),
});

const taskSchema = s.looseObject("A Nozbe task resource.", {
  id: idSchema,
  name: s.string("The task name."),
  project_id: s.string("The task's project identifier."),
  project_section_id: s.nullable(idSchema),
  author_id: idSchema,
  responsible_id: s.nullable(s.string("The user responsible for the task.")),
  recurrence_id: s.nullable(idSchema),
  created_at: timestampSchema,
  last_modified: timestampSchema,
  due_at: nullableTimestampSchema,
  ended_at: nullableTimestampSchema,
  last_activity_at: timestampSchema,
  last_seen_activity_at: nullableTimestampSchema,
  last_reviewed_at: nullableTimestampSchema,
  review_triggered_at: nullableTimestampSchema,
  review_reason: s.nullable(s.string("The reason the task needs review.")),
  is_followed: s.boolean("Whether the current user follows the task."),
  is_abandoned: s.boolean("Whether the task is abandoned."),
  is_all_day: s.boolean("Whether the task is an all-day task."),
  project_position: s.number("The task's position in its project."),
  priority_position: s.nullable(s.number("The task's priority position.")),
  missed_repeats: s.nonNegativeInteger("The number of missed task recurrences."),
  time_needed: nullableDurationSchema,
  time_spent: nullableDurationSchema,
  type: s.nullable(s.string("The task type.")),
  extra: s.nullable(s.string("Additional serialized task metadata.")),
});

const commentSchema = s.looseObject("A Nozbe task comment resource.", {
  id: idSchema,
  body: s.string("The comment body."),
  task_id: idSchema,
  author_id: idSchema,
  created_at: timestampSchema,
  edited_at: nullableTimestampSchema,
  is_deleted: s.boolean("Whether the comment is marked as deleted."),
  is_pinned: s.boolean("Whether the comment is pinned."),
  is_team: s.boolean("Whether the comment is visible to the team."),
  extra: s.nullable(s.string("Additional serialized comment metadata.")),
  reactions: s.nullable(s.string("Serialized reactions attached to the comment.")),
});

const listTeamsAction = defineProviderAction(service, {
  name: "list_teams",
  operationType: "read",
  description: "List teams accessible with the connected Nozbe API token.",
  requiredScopes: [],
  inputSchema: s.object(
    "The query parameters for listing Nozbe teams.",
    {
      limit: listLimitSchema,
      offset: listOffsetSchema,
      sortBy: sortBySchema,
    },
    { optional: ["limit", "offset", "sortBy"] },
  ),
  outputSchema: s.array("The teams returned by Nozbe.", teamSchema),
});

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  operationType: "read",
  description: "List Nozbe projects with pagination, sorting, and team filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The query parameters for listing Nozbe projects.",
    {
      limit: listLimitSchema,
      offset: listOffsetSchema,
      sortBy: sortBySchema,
      team_id: idSchema,
      is_single_actions: s.boolean("Whether to return only Single Tasks projects."),
    },
    { optional: ["limit", "offset", "sortBy", "team_id", "is_single_actions"] },
  ),
  outputSchema: s.array("The projects returned by Nozbe.", projectSchema),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  operationType: "read",
  description: "Get a Nozbe project by ID.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input for getting a Nozbe project.", { id: idSchema }),
  outputSchema: projectSchema,
});

const createProjectAction = defineProviderAction(service, {
  name: "create_project",
  operationType: "write",
  description: "Create a Nozbe project in a team.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for creating a Nozbe project.",
    {
      name: s.string("The project name.", { maxLength: 255 }),
      team_id: idSchema,
      is_open: s.boolean("Whether the new project is open."),
      is_favorite: s.boolean("Whether the project is marked as a favorite."),
      is_single_actions: s.boolean("Whether the project contains single actions."),
      is_template: s.boolean("Whether the project is a template."),
      color: projectColorInputSchema,
      description: s.nullable(s.string("The project description.")),
      extra: s.nullable(s.string("Additional serialized project metadata.")),
      preferences: s.nullable(s.string("Serialized project preferences.")),
      sidebar_position: s.nullable(s.number("The project's sidebar position.")),
    },
    {
      optional: [
        "is_favorite",
        "is_single_actions",
        "is_template",
        "color",
        "description",
        "extra",
        "preferences",
        "sidebar_position",
      ],
    },
  ),
  outputSchema: projectSchema,
});

const updateProjectInputSchema = s.object(
  "The input for updating a Nozbe project.",
  {
    id: idSchema,
    name: s.string("The updated project name.", { maxLength: 255 }),
    team_id: idSchema,
    ended_at: nullableTimestampSchema,
    last_seen_event_at: nullableTimestampSchema,
    is_open: s.boolean("Whether the project is open."),
    is_favorite: s.boolean("Whether the project is marked as a favorite."),
    is_single_actions: s.boolean("Whether the project contains single actions."),
    is_template: s.boolean("Whether the project is a template."),
    color: projectColorInputSchema,
    description: s.nullable(s.string("The updated project description.")),
    extra: s.nullable(s.string("Additional serialized project metadata.")),
    preferences: s.nullable(s.string("Serialized project preferences.")),
    sidebar_position: s.nullable(s.number("The project's sidebar position.")),
  },
  {
    optional: [
      "name",
      "team_id",
      "ended_at",
      "last_seen_event_at",
      "is_open",
      "is_favorite",
      "is_single_actions",
      "is_template",
      "color",
      "description",
      "extra",
      "preferences",
      "sidebar_position",
    ],
  },
);

const updateProjectAction = defineProviderAction(service, {
  name: "update_project",
  operationType: "write",
  description: "Update writable fields on a Nozbe project.",
  requiredScopes: [],
  inputSchema: updateProjectInputSchema,
  outputSchema: projectSchema,
});

const deleteProjectAction = defineProviderAction(service, {
  name: "delete_project",
  operationType: "destructive",
  description: "Delete a Nozbe project by ID.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input for deleting a Nozbe project.", { id: idSchema }),
  outputSchema: s.requiredObject("The connector deletion acknowledgement.", {
    id: idSchema,
    deleted: s.boolean("Whether Nozbe accepted the project deletion."),
  }),
});

const listTasksAction = defineProviderAction(service, {
  name: "list_tasks",
  operationType: "read",
  description: "List Nozbe tasks with pagination, sorting, and project filtering.",
  requiredScopes: [],
  inputSchema: s.object(
    "The query parameters for listing Nozbe tasks.",
    {
      limit: listLimitSchema,
      offset: listOffsetSchema,
      sortBy: sortBySchema,
      project_id: idSchema,
    },
    { optional: ["limit", "offset", "sortBy", "project_id"] },
  ),
  outputSchema: s.array("The tasks returned by Nozbe.", taskSchema),
});

const getTaskAction = defineProviderAction(service, {
  name: "get_task",
  operationType: "read",
  description: "Get a Nozbe task by ID.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input for getting a Nozbe task.", { id: idSchema }),
  outputSchema: taskSchema,
});

const createTaskAction = defineProviderAction(service, {
  name: "create_task",
  operationType: "write",
  description: "Create a task in Nozbe.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for creating a Nozbe task.",
    {
      name: s.nonEmptyString("The task name.", {
        maxLength: 255,
      }),
      project_id: projectIdSchema,
      project_section_id: s.nullable(idSchema),
      responsible_id: s.nullable(responsibleIdSchema),
      due_at: nullableTimestampSchema,
      is_followed: s.boolean("Whether the current user follows the task."),
      is_all_day: s.boolean("Whether the task is an all-day task."),
      priority_position: s.nullable(s.number("The task's priority position.")),
      time_needed: nullableDurationSchema,
      extra: s.nullable(s.string("Additional serialized task metadata.")),
    },
    {
      optional: [
        "project_id",
        "project_section_id",
        "responsible_id",
        "due_at",
        "is_followed",
        "is_all_day",
        "priority_position",
        "time_needed",
        "extra",
      ],
    },
  ),
  outputSchema: taskSchema,
});

const updateTaskInputSchema = s.object(
  "The input for updating a Nozbe task.",
  {
    id: idSchema,
    name: s.nonEmptyString("The updated task name.", {
      maxLength: 255,
    }),
    project_id: projectIdSchema,
    project_section_id: s.nullable(idSchema),
    responsible_id: s.nullable(responsibleIdSchema),
    due_at: nullableTimestampSchema,
    ended_at: nullableTimestampSchema,
    is_followed: s.boolean("Whether the current user follows the task."),
    is_abandoned: s.boolean("Whether the task is abandoned."),
    is_all_day: s.boolean("Whether the task is an all-day task."),
    priority_position: s.nullable(s.number("The task's priority position.")),
    time_needed: nullableDurationSchema,
    time_spent: nullableDurationSchema,
    extra: s.nullable(s.string("Additional serialized task metadata.")),
  },
  {
    optional: [
      "name",
      "project_id",
      "project_section_id",
      "responsible_id",
      "due_at",
      "ended_at",
      "is_followed",
      "is_abandoned",
      "is_all_day",
      "priority_position",
      "time_needed",
      "time_spent",
      "extra",
    ],
  },
);

const updateTaskAction = defineProviderAction(service, {
  name: "update_task",
  operationType: "write",
  description: "Update writable fields on a Nozbe task.",
  requiredScopes: [],
  inputSchema: updateTaskInputSchema,
  outputSchema: taskSchema,
});

const deleteTaskAction = defineProviderAction(service, {
  name: "delete_task",
  operationType: "destructive",
  description: "Delete a Nozbe task by ID.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input for deleting a Nozbe task.", { id: idSchema }),
  outputSchema: s.requiredObject("The connector deletion acknowledgement.", {
    id: idSchema,
    deleted: s.boolean("Whether Nozbe accepted the task deletion."),
  }),
});

const listCommentsAction = defineProviderAction(service, {
  name: "list_comments",
  operationType: "read",
  description: "List Nozbe task comments with pagination, sorting, and task filtering.",
  requiredScopes: [],
  inputSchema: s.object(
    "The query parameters for listing Nozbe comments.",
    {
      limit: listLimitSchema,
      offset: listOffsetSchema,
      sortBy: sortBySchema,
      task_id: idSchema,
    },
    { optional: ["limit", "offset", "sortBy", "task_id"] },
  ),
  outputSchema: s.array("The comments returned by Nozbe.", commentSchema),
});

const getCommentAction = defineProviderAction(service, {
  name: "get_comment",
  operationType: "read",
  description: "Get a Nozbe task comment by ID.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input for getting a Nozbe comment.", { id: idSchema }),
  outputSchema: commentSchema,
});

const createCommentAction = defineProviderAction(service, {
  name: "create_comment",
  operationType: "write",
  description: "Add a comment to a Nozbe task.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input for creating a Nozbe task comment.",
    {
      body: s.string("The comment body."),
      task_id: idSchema,
      is_pinned: s.boolean("Whether the comment is pinned."),
      is_team: s.boolean("Whether the comment is visible to the team."),
      extra: s.nullable(s.string("Additional serialized comment metadata.")),
    },
    { optional: ["is_pinned", "is_team", "extra"] },
  ),
  outputSchema: commentSchema,
});

const updateCommentInputSchema = s.object(
  "The input for updating a Nozbe task comment.",
  {
    id: idSchema,
    body: s.string("The updated comment body."),
    is_pinned: s.boolean("Whether the comment is pinned."),
    is_deleted: s.boolean("Whether the comment is marked as deleted."),
    extra: s.nullable(s.string("Additional serialized comment metadata.")),
  },
  { optional: ["body", "is_pinned", "is_deleted", "extra"] },
);

const updateCommentAction = defineProviderAction(service, {
  name: "update_comment",
  operationType: "write",
  description: "Update writable fields on a Nozbe task comment.",
  requiredScopes: [],
  inputSchema: updateCommentInputSchema,
  outputSchema: commentSchema,
});

const deleteCommentAction = defineProviderAction(service, {
  name: "delete_comment",
  operationType: "destructive",
  description: "Delete a Nozbe task comment and return the updated comment resource.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The input for deleting a Nozbe task comment.", { id: idSchema }),
  outputSchema: commentSchema,
});

export const nozbeTeamsActions: ProviderActionDefinition[] = [
  listTeamsAction,
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
  listCommentsAction,
  getCommentAction,
  createCommentAction,
  updateCommentAction,
  deleteCommentAction,
];
