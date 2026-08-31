import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "shortcut";

const trimmedString = (description: string, options: { minLength?: number } = {}) =>
  s.string(description, {
    minLength: options.minLength,
  });

const nullableTrimmedString = (description: string) => s.nullable(trimmedString(description));
const positiveInteger = (description: string) => s.positiveInteger(description);
const nullableInteger = (description: string) => s.nullable(s.integer(description));
const memberIdSchema = trimmedString("The Shortcut member UUID.", { minLength: 1 });
const memberIdArraySchema = s.array(
  "The Shortcut member UUIDs.",
  s.string("One Shortcut member UUID.", {
    minLength: 1,
  }),
);
const projectIdSchema = positiveInteger("The Shortcut project ID.");
const workflowIdSchema = positiveInteger("The Shortcut workflow ID.");
const workflowStateIdSchema = positiveInteger("The Shortcut workflow state ID.");
const epicIdSchema = positiveInteger("The Shortcut epic ID.");
const storyIdSchema = positiveInteger("The Shortcut story ID.");
const orgIdSchema = positiveInteger("The Shortcut organization ID.");
const dueDateSchema = s.date("The Shortcut due date in YYYY-MM-DD format.");
const isoDateTimeSchema = s.dateTime("The Shortcut ISO 8601 timestamp.");
const storyTypeSchema = s.stringEnum("The Shortcut story type.", ["feature", "bug", "chore"]);
const searchDetailSchema = s.stringEnum("The amount of detail to return for each search result.", ["full", "slim"]);
const searchEntityTypeSchema = s.stringEnum("The Shortcut entity type to include in the search.", [
  "story",
  "epic",
  "iteration",
  "objective",
]);

const shortcutIconSchema = s.looseObject("A Shortcut icon object.", {
  id: s.integer("The Shortcut icon ID."),
  url: s.string("The Shortcut icon URL."),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  entity_type: s.string("The Shortcut icon entity type."),
});

const shortcutMemberProfileSchema = s.looseObject("A Shortcut member profile.", {
  id: trimmedString("The Shortcut profile UUID.", { minLength: 1 }),
  name: s.string("The member name shown by Shortcut."),
  mention_name: s.nullable(s.string("The Shortcut mention name.")),
  email_address: s.nullable(s.string("The member email address.")),
  deactivated: s.boolean("Whether the member profile is deactivated."),
  two_factor_auth_activated: s.boolean("Whether two-factor authentication is enabled for the member."),
  is_owner: s.boolean("Whether the member profile is an organization owner."),
  disabled: s.boolean("Whether the member profile is disabled."),
  entity_type: s.string("The Shortcut profile entity type."),
  gravatar_hash: s.nullable(s.string("The member gravatar hash.")),
  icon: s.nullable(shortcutIconSchema),
});

const shortcutMemberSchema = s.looseObject("A Shortcut member.", {
  id: trimmedString("The Shortcut member UUID.", { minLength: 1 }),
  role: s.nullable(s.string("The Shortcut workspace role.")),
  disabled: s.boolean("Whether the member is disabled in the workspace."),
  global_id: s.nullable(s.string("The Shortcut global member identifier.")),
  entity_type: s.string("The Shortcut member entity type."),
  group_ids: s.array("The Shortcut group UUIDs for this member.", s.string("One group UUID.")),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  state: s.unknown("The Shortcut member state payload."),
  profile: shortcutMemberProfileSchema,
});

const shortcutWorkflowStateSchema = s.looseObject("A Shortcut workflow state.", {
  id: positiveInteger("The Shortcut workflow state ID."),
  name: s.string("The workflow state name."),
  type: s.nullable(s.string("The Shortcut workflow state type.")),
  color: s.nullable(s.string("The Shortcut workflow state color.")),
  description: s.nullable(s.string("The Shortcut workflow state description.")),
  verb: s.nullable(s.string("The workflow state commit verb.")),
  position: s.integer("The workflow state position."),
  num_stories: s.integer("The number of stories in this workflow state."),
  num_story_templates: s.integer("The number of story templates in this workflow state."),
  entity_type: s.string("The Shortcut workflow state entity type."),
  global_id: s.nullable(s.string("The Shortcut global workflow state identifier.")),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

const shortcutWorkflowSchema = s.looseObject("A Shortcut workflow.", {
  id: workflowIdSchema,
  name: s.string("The Shortcut workflow name."),
  description: s.nullable(s.string("The Shortcut workflow description.")),
  team_id: positiveInteger("The Shortcut team ID for this workflow."),
  default_state_id: workflowStateIdSchema,
  auto_assign_owner: s.boolean("Whether Shortcut auto-assigns owners when work starts."),
  project_ids: s.array("The Shortcut project IDs in this workflow.", projectIdSchema),
  states: s.array("The workflow states in this workflow.", shortcutWorkflowStateSchema),
  entity_type: s.string("The Shortcut workflow entity type."),
  global_id: s.nullable(s.string("The Shortcut global workflow identifier.")),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

const shortcutProjectStatsSchema = s.looseObject("A Shortcut project stats object.", {
  num_points: s.integer("The total project points."),
  num_stories: s.integer("The total project stories."),
  num_related_documents: s.integer("The total related project documents."),
});

const shortcutProjectSchema = s.looseObject("A Shortcut project.", {
  id: projectIdSchema,
  name: s.string("The Shortcut project name."),
  description: s.nullable(s.string("The Shortcut project description.")),
  abbreviation: s.nullable(s.string("The Shortcut project abbreviation.")),
  color: s.nullable(s.string("The Shortcut project color.")),
  archived: s.boolean("Whether the project is archived."),
  team_id: positiveInteger("The Shortcut team ID."),
  workflow_id: workflowIdSchema,
  iteration_length: s.integer("The number of weeks per iteration."),
  start_time: s.nullable(s.string("The Shortcut project start time.")),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  entity_type: s.string("The Shortcut project entity type."),
  global_id: s.nullable(s.string("The Shortcut global project identifier.")),
  app_url: s.string("The Shortcut web URL for this project."),
  follower_ids: memberIdArraySchema,
  show_thermometer: s.boolean("Whether the Shortcut thermometer is enabled."),
  days_to_thermometer: s.integer("The number of days before the thermometer is shown."),
  stats: shortcutProjectStatsSchema,
});

const shortcutLabelSchema = s.looseObject("A Shortcut label.", {
  id: positiveInteger("The Shortcut label ID."),
  name: s.string("The Shortcut label name."),
  color: s.nullable(s.string("The Shortcut label color.")),
  description: s.nullable(s.string("The Shortcut label description.")),
  app_url: s.nullable(s.string("The Shortcut web URL for this label.")),
  archived: s.boolean("Whether the label is archived."),
  entity_type: s.string("The Shortcut label entity type."),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  external_id: s.nullable(s.string("The external ID attached to this label.")),
});

const shortcutEpicStatsSchema = s.looseObject("A Shortcut epic stats object.", {
  num_points: s.integer("The total epic points."),
  num_points_done: s.integer("The completed epic points."),
  num_points_started: s.integer("The started epic points."),
  num_points_unstarted: s.integer("The unstarted epic points."),
  num_points_backlog: s.integer("The backlog epic points."),
  num_stories_total: s.integer("The total epic stories."),
  num_stories_done: s.integer("The completed epic stories."),
  num_stories_started: s.integer("The started epic stories."),
  num_stories_unstarted: s.integer("The unstarted epic stories."),
  num_stories_backlog: s.integer("The backlog epic stories."),
  num_related_documents: s.integer("The total documents related to this epic."),
});

const shortcutEpicSchema = s.looseObject("A Shortcut epic.", {
  id: epicIdSchema,
  name: s.string("The Shortcut epic name."),
  description: s.nullable(s.string("The Shortcut epic description.")),
  app_url: s.string("The Shortcut web URL for this epic."),
  archived: s.boolean("Whether the epic is archived."),
  completed: s.boolean("Whether the epic is completed."),
  started: s.boolean("Whether the epic has started."),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  started_at: s.nullable(s.string("The Shortcut epic started timestamp.")),
  completed_at: s.nullable(s.string("The Shortcut epic completed timestamp.")),
  deadline: s.nullable(s.string("The Shortcut epic deadline.")),
  planned_start_date: s.nullable(s.string("The Shortcut epic planned start date.")),
  position: s.integer("The Shortcut epic position."),
  state: s.nullable(s.string("The Shortcut epic state string.")),
  owner_ids: memberIdArraySchema,
  follower_ids: memberIdArraySchema,
  group_ids: s.array("The Shortcut group UUIDs applied to this epic.", s.string("One group UUID.")),
  label_ids: s.array("The Shortcut label IDs applied to this epic.", positiveInteger("One label ID.")),
  project_ids: s.array("The Shortcut project IDs associated with this epic.", positiveInteger("One project ID.")),
  objective_ids: s.array("The Shortcut objective IDs associated with this epic.", positiveInteger("One objective ID.")),
  labels: s.array("The expanded labels on this epic.", shortcutLabelSchema),
  stats: shortcutEpicStatsSchema,
  requested_by_id: s.nullable(s.string("The Shortcut member UUID that requested the epic.")),
  entity_type: s.string("The Shortcut epic entity type."),
  external_id: s.nullable(s.string("The external ID attached to this epic.")),
  workflow_state_id: s.nullable(s.integer("The Shortcut epic workflow state ID.")),
});

const shortcutStoryTaskSchema = s.looseObject("A Shortcut story task.", {
  id: positiveInteger("The Shortcut task ID."),
  description: s.string("The Shortcut task description."),
  complete: s.boolean("Whether the task is complete."),
  owner_ids: memberIdArraySchema,
  created_at: s.nullable(s.string("The Shortcut task creation timestamp.")),
  updated_at: s.nullable(s.string("The Shortcut task update timestamp.")),
  external_id: s.nullable(s.string("The external ID attached to this task.")),
});

const shortcutStorySchema = s.looseObject("A Shortcut story.", {
  id: storyIdSchema,
  name: s.string("The Shortcut story name."),
  description: s.nullable(s.string("The Shortcut story description.")),
  app_url: s.string("The Shortcut web URL for this story."),
  story_type: s.nullable(s.string("The Shortcut story type.")),
  archived: s.boolean("Whether the story is archived."),
  blocked: s.boolean("Whether the story is blocked."),
  blocker: s.boolean("Whether the story blocks other stories."),
  completed: s.boolean("Whether the story is completed."),
  started: s.boolean("Whether the story has started."),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
  started_at: s.nullable(s.string("The Shortcut story started timestamp.")),
  completed_at: s.nullable(s.string("The Shortcut story completed timestamp.")),
  moved_at: s.nullable(s.string("The Shortcut story moved timestamp.")),
  due_date: s.nullable(s.string("The Shortcut story due date.")),
  estimate: nullableInteger("The Shortcut story estimate."),
  position: s.integer("The Shortcut story position."),
  workflow_id: workflowIdSchema,
  workflow_state_id: workflowStateIdSchema,
  project_id: s.nullable(projectIdSchema),
  epic_id: s.nullable(epicIdSchema),
  iteration_id: s.nullable(s.integer("The Shortcut iteration ID.")),
  owner_ids: memberIdArraySchema,
  follower_ids: memberIdArraySchema,
  requested_by_id: s.nullable(s.string("The Shortcut member UUID that requested the story.")),
  labels: s.array("The expanded labels on this story.", shortcutLabelSchema),
  tasks: s.array("The tasks attached to this story.", shortcutStoryTaskSchema),
  entity_type: s.string("The Shortcut story entity type."),
  external_id: s.nullable(s.string("The external ID attached to this story.")),
});

const shortcutCreateLabelSchema = s.object(
  "One Shortcut label to create.",
  {
    name: trimmedString("The Shortcut label name.", { minLength: 1 }),
    color: trimmedString("The Shortcut label color.", { minLength: 1 }),
    description: nullableTrimmedString("The Shortcut label description."),
    externalId: nullableTrimmedString("The external ID attached to this label."),
  },
  { optional: ["color", "description", "externalId"] },
);

const listMembersInputSchema = s.object(
  "The input payload for listing Shortcut members.",
  {
    orgId: orgIdSchema,
  },
  { optional: ["orgId"] },
);

const getMemberInputSchema = s.object(
  "The input payload for getting one Shortcut member.",
  {
    memberId: memberIdSchema,
    orgId: orgIdSchema,
  },
  { optional: ["orgId"] },
);

const listProjectsInputSchema = s.object("The input payload for listing Shortcut projects.", {});

const getProjectInputSchema = s.object("The input payload for getting one Shortcut project.", {
  projectId: projectIdSchema,
});

const listWorkflowsInputSchema = s.object("The input payload for listing Shortcut workflows.", {});

const getWorkflowInputSchema = s.object("The input payload for getting one Shortcut workflow.", {
  workflowId: workflowIdSchema,
});

const listEpicsInputSchema = s.object(
  "The input payload for listing Shortcut epics.",
  {
    includesDescription: s.boolean("Whether Shortcut should include epic descriptions."),
  },
  { optional: ["includesDescription"] },
);

const getEpicInputSchema = s.object("The input payload for getting one Shortcut epic.", {
  epicId: epicIdSchema,
});

const createEpicInputSchema = s.object(
  "The input payload for creating one Shortcut epic.",
  {
    name: trimmedString("The Shortcut epic name.", { minLength: 1 }),
    description: nullableTrimmedString("The Shortcut epic description."),
    ownerIds: memberIdArraySchema,
    followerIds: memberIdArraySchema,
    requestedById: memberIdSchema,
    groupIds: s.array(
      "The Shortcut group UUIDs to associate with the epic.",
      s.string("One group UUID.", {
        minLength: 1,
      }),
    ),
    projectIds: s.array("The Shortcut project IDs to associate with the epic.", projectIdSchema),
    labels: s.array("The new labels to create and attach to the epic.", shortcutCreateLabelSchema),
    plannedStartDate: dueDateSchema,
    deadline: dueDateSchema,
    externalId: nullableTrimmedString("The external ID attached to this epic."),
  },
  {
    optional: [
      "description",
      "ownerIds",
      "followerIds",
      "requestedById",
      "groupIds",
      "projectIds",
      "labels",
      "plannedStartDate",
      "deadline",
      "externalId",
    ],
  },
);

const updateEpicInputSchema = {
  ...s.object(
    "The input payload for updating one Shortcut epic.",
    {
      epicId: epicIdSchema,
      name: trimmedString("The Shortcut epic name.", { minLength: 1 }),
      description: nullableTrimmedString("The Shortcut epic description."),
      ownerIds: memberIdArraySchema,
      followerIds: memberIdArraySchema,
      requestedById: memberIdSchema,
      groupIds: s.array(
        "The Shortcut group UUIDs to associate with the epic.",
        s.string("One group UUID.", {
          minLength: 1,
        }),
      ),
      projectIds: s.array("The Shortcut project IDs to associate with the epic.", projectIdSchema),
      labels: s.array("The new labels to create and attach to the epic.", shortcutCreateLabelSchema),
      plannedStartDate: dueDateSchema,
      deadline: dueDateSchema,
      externalId: nullableTrimmedString("The external ID attached to this epic."),
      archived: s.boolean("Whether the Shortcut epic should be archived."),
    },
    {
      optional: [
        "name",
        "description",
        "ownerIds",
        "followerIds",
        "requestedById",
        "groupIds",
        "projectIds",
        "labels",
        "plannedStartDate",
        "deadline",
        "externalId",
        "archived",
      ],
    },
  ),
  anyOf: [
    { required: ["name"] },
    { required: ["description"] },
    { required: ["ownerIds"] },
    { required: ["followerIds"] },
    { required: ["requestedById"] },
    { required: ["groupIds"] },
    { required: ["projectIds"] },
    { required: ["labels"] },
    { required: ["plannedStartDate"] },
    { required: ["deadline"] },
    { required: ["externalId"] },
    { required: ["archived"] },
  ],
};

const listStoriesInputSchema = s.object(
  "The input payload for listing Shortcut stories in one project.",
  {
    projectId: projectIdSchema,
    includesDescription: s.boolean("Whether Shortcut should include story descriptions."),
  },
  { optional: ["includesDescription"] },
);

const getStoryInputSchema = s.object("The input payload for getting one Shortcut story.", {
  storyId: storyIdSchema,
});

const createStoryInputSchema = {
  ...s.object(
    "The input payload for creating one Shortcut story.",
    {
      name: trimmedString("The Shortcut story name.", { minLength: 1 }),
      description: nullableTrimmedString("The Shortcut story description."),
      workflowStateId: workflowStateIdSchema,
      projectId: projectIdSchema,
      storyType: storyTypeSchema,
      epicId: epicIdSchema,
      ownerIds: memberIdArraySchema,
      followerIds: memberIdArraySchema,
      requestedById: memberIdSchema,
      estimate: nullableInteger("The Shortcut story estimate."),
      dueDate: dueDateSchema,
      externalId: nullableTrimmedString("The external ID attached to this story."),
      iterationId: s.integer("The Shortcut iteration ID."),
      archived: s.boolean("Whether the Shortcut story should be archived."),
    },
    {
      optional: [
        "description",
        "workflowStateId",
        "projectId",
        "storyType",
        "epicId",
        "ownerIds",
        "followerIds",
        "requestedById",
        "estimate",
        "dueDate",
        "externalId",
        "iterationId",
        "archived",
      ],
    },
  ),
  oneOf: [{ required: ["workflowStateId"] }, { required: ["projectId"] }],
};

const updateStoryInputSchema = {
  ...s.object(
    "The input payload for updating one Shortcut story.",
    {
      storyId: storyIdSchema,
      name: trimmedString("The Shortcut story name.", { minLength: 1 }),
      description: nullableTrimmedString("The Shortcut story description."),
      workflowStateId: workflowStateIdSchema,
      projectId: projectIdSchema,
      storyType: storyTypeSchema,
      epicId: epicIdSchema,
      ownerIds: memberIdArraySchema,
      followerIds: memberIdArraySchema,
      requestedById: memberIdSchema,
      estimate: nullableInteger("The Shortcut story estimate."),
      dueDate: dueDateSchema,
      externalId: nullableTrimmedString("The external ID attached to this story."),
      iterationId: s.integer("The Shortcut iteration ID."),
      archived: s.boolean("Whether the Shortcut story should be archived."),
    },
    {
      optional: [
        "name",
        "description",
        "workflowStateId",
        "projectId",
        "storyType",
        "epicId",
        "ownerIds",
        "followerIds",
        "requestedById",
        "estimate",
        "dueDate",
        "externalId",
        "iterationId",
        "archived",
      ],
    },
  ),
  anyOf: [
    { required: ["name"] },
    { required: ["description"] },
    { required: ["workflowStateId"] },
    { required: ["projectId"] },
    { required: ["storyType"] },
    { required: ["epicId"] },
    { required: ["ownerIds"] },
    { required: ["followerIds"] },
    { required: ["requestedById"] },
    { required: ["estimate"] },
    { required: ["dueDate"] },
    { required: ["externalId"] },
    { required: ["iterationId"] },
    { required: ["archived"] },
  ],
};

const searchStoriesInputSchema = s.object(
  "The input payload for searching Shortcut stories.",
  {
    query: trimmedString("The Shortcut search query.", { minLength: 1 }),
    next: trimmedString("The Shortcut next-page token.", { minLength: 1 }),
    detail: searchDetailSchema,
    pageSize: s.integer("The number of search results to return.", {
      minimum: 1,
      maximum: 25,
    }),
    entityTypes: s.array("The Shortcut entity types to search.", searchEntityTypeSchema, {
      minItems: 1,
    }),
  },
  { optional: ["next", "detail", "pageSize", "entityTypes"] },
);

export const shortcutActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_members",
    description: "List the members available in the connected Shortcut workspace.",
    requiredScopes: [],
    inputSchema: listMembersInputSchema,
    outputSchema: s.object("The output payload for listing Shortcut members.", {
      members: s.array("The Shortcut members.", shortcutMemberSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_member",
    description: "Get one Shortcut member by member UUID.",
    requiredScopes: [],
    inputSchema: getMemberInputSchema,
    outputSchema: s.object("The output payload for getting one Shortcut member.", {
      member: shortcutMemberSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_workflows",
    description: "List the workflows available in the connected Shortcut workspace.",
    requiredScopes: [],
    inputSchema: listWorkflowsInputSchema,
    outputSchema: s.object("The output payload for listing Shortcut workflows.", {
      workflows: s.array("The Shortcut workflows.", shortcutWorkflowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_workflow",
    description: "Get one Shortcut workflow by workflow ID.",
    requiredScopes: [],
    inputSchema: getWorkflowInputSchema,
    outputSchema: s.object("The output payload for getting one Shortcut workflow.", {
      workflow: shortcutWorkflowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List the projects available in the connected Shortcut workspace.",
    requiredScopes: [],
    inputSchema: listProjectsInputSchema,
    outputSchema: s.object("The output payload for listing Shortcut projects.", {
      projects: s.array("The Shortcut projects.", shortcutProjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Shortcut project by project ID.",
    requiredScopes: [],
    inputSchema: getProjectInputSchema,
    outputSchema: s.object("The output payload for getting one Shortcut project.", {
      project: shortcutProjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_epics",
    description: "List the epics available in the connected Shortcut workspace.",
    requiredScopes: [],
    inputSchema: listEpicsInputSchema,
    outputSchema: s.object("The output payload for listing Shortcut epics.", {
      epics: s.array("The Shortcut epics.", shortcutEpicSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_epic",
    description: "Get one Shortcut epic by epic ID.",
    requiredScopes: [],
    inputSchema: getEpicInputSchema,
    outputSchema: s.object("The output payload for getting one Shortcut epic.", {
      epic: shortcutEpicSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_epic",
    description: "Create one Shortcut epic with the first-pass supported fields.",
    requiredScopes: [],
    inputSchema: createEpicInputSchema,
    outputSchema: s.object("The output payload for creating one Shortcut epic.", {
      epic: shortcutEpicSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_epic",
    description: "Update one Shortcut epic with the first-pass supported fields.",
    requiredScopes: [],
    inputSchema: updateEpicInputSchema,
    outputSchema: s.object("The output payload for updating one Shortcut epic.", {
      epic: shortcutEpicSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_stories",
    description: "List the stories in one Shortcut project.",
    requiredScopes: [],
    inputSchema: listStoriesInputSchema,
    outputSchema: s.object("The output payload for listing Shortcut stories.", {
      stories: s.array("The Shortcut stories.", shortcutStorySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_story",
    description: "Get one Shortcut story by story ID.",
    requiredScopes: [],
    inputSchema: getStoryInputSchema,
    outputSchema: s.object("The output payload for getting one Shortcut story.", {
      story: shortcutStorySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_story",
    description: "Create one Shortcut story with the first-pass supported fields.",
    requiredScopes: [],
    inputSchema: createStoryInputSchema,
    outputSchema: s.object("The output payload for creating one Shortcut story.", {
      story: shortcutStorySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_story",
    description: "Update one Shortcut story with the first-pass supported fields.",
    requiredScopes: [],
    inputSchema: updateStoryInputSchema,
    outputSchema: s.object("The output payload for updating one Shortcut story.", {
      story: shortcutStorySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_stories",
    description: "Search Shortcut stories with the official search endpoint and stable pagination.",
    requiredScopes: [],
    inputSchema: searchStoriesInputSchema,
    outputSchema: s.object("The output payload for searching Shortcut stories.", {
      stories: s.array("The Shortcut stories returned by the search.", shortcutStorySchema),
      next: s.nullable(s.string("The Shortcut next-page token when more search results exist.")),
      total: s.nullable(s.integer("The total number of matching stories when Shortcut returns it.")),
    }),
  }),
];
