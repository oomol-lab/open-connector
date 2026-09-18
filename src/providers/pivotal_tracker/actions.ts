import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "pivotal_tracker" as const;

const idSchema = s.positiveInteger("The numeric Pivotal Tracker ID.");
const projectIdSchema = s.positiveInteger("The numeric Pivotal Tracker project ID.");
const storyIdSchema = s.positiveInteger("The numeric Pivotal Tracker story ID.");
const limitSchema = s.positiveInteger("Maximum number of records to return.");
const offsetSchema = s.nonNegativeInteger("Number of records to skip before returning results.");
const fieldsSchema = s.string("Optional Tracker fields selector.", {
  minLength: 1,
  pattern: "\\S",
});
const filterSchema = s.string("Tracker story filter query such as label:plans.", {
  minLength: 1,
  pattern: "\\S",
});
const storyNameSchema = s.string("Story name.", { minLength: 1, pattern: "\\S" });
const textSchema = s.string("Comment text.", { minLength: 1, pattern: "\\S" });
const storyTypeSchema = s.stringEnum("Tracker story type.", ["feature", "bug", "chore", "release"]);
const storyStateSchema = s.stringEnum("Tracker story state.", [
  "unscheduled",
  "unstarted",
  "started",
  "finished",
  "delivered",
  "accepted",
  "rejected",
]);
const numberArraySchema = s.array("Numeric Tracker IDs.", s.positiveInteger("One numeric Tracker ID."), {
  minItems: 1,
});
const labelNamesSchema = s.array(
  "Label names to apply to the story.",
  s.string("One label name.", { minLength: 1, pattern: "\\S" }),
  { minItems: 1 },
);

const userSchema = s.looseObject("The Pivotal Tracker user returned by the API.", {
  kind: s.string("Resource kind returned by Tracker."),
  id: idSchema,
  name: s.string("User display name."),
  username: s.string("Tracker username."),
  email: s.string("User email address."),
  initials: s.string("User initials."),
});
const projectSchema = s.looseObject("The Pivotal Tracker project returned by the API.", {
  kind: s.string("Resource kind returned by Tracker."),
  id: idSchema,
  name: s.string("Project name."),
  version: s.integer("Project version returned by Tracker."),
  iteration_length: s.integer("Iteration length in weeks."),
  week_start_day: s.string("Project week start day."),
  point_scale: s.string("Project point scale."),
  account_id: s.positiveInteger("Account ID that owns the project."),
});
const storySchema = s.looseObject("The Pivotal Tracker story returned by the API.", {
  kind: s.string("Resource kind returned by Tracker."),
  id: idSchema,
  project_id: projectIdSchema,
  name: s.string("Story name."),
  story_type: s.string("Story type returned by Tracker."),
  current_state: s.string("Current story state returned by Tracker."),
  url: s.string("Browser URL for the story."),
  created_at: s.string("Timestamp when the story was created."),
  updated_at: s.string("Timestamp when the story was last updated."),
});
const commentSchema = s.looseObject("The Pivotal Tracker story comment returned by the API.", {
  kind: s.string("Resource kind returned by Tracker."),
  id: idSchema,
  story_id: storyIdSchema,
  person_id: s.positiveInteger("ID of the person who created the comment."),
  text: s.string("Comment text."),
  created_at: s.string("Timestamp when the comment was created."),
  updated_at: s.string("Timestamp when the comment was last updated."),
});

const getCurrentUserAction = defineProviderAction(service, {
  name: "get_current_user",
  operationType: "read",
  description: "Get the Pivotal Tracker user associated with the API token.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting the current Tracker user.", {}),
  outputSchema: s.object("The response returned when getting the current Tracker user.", {
    user: userSchema,
  }),
});

const listProjectsAction = defineProviderAction(service, {
  name: "list_projects",
  operationType: "read",
  description: "List Pivotal Tracker projects visible to the API token.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Tracker projects.",
    {
      limit: limitSchema,
      offset: offsetSchema,
      fields: fieldsSchema,
    },
    { optional: ["limit", "offset", "fields"] },
  ),
  outputSchema: s.object("The response returned when listing Tracker projects.", {
    projects: s.array("Projects returned by Tracker.", projectSchema),
  }),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  operationType: "read",
  description: "Get one Pivotal Tracker project by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Tracker project.",
    {
      projectId: projectIdSchema,
      fields: fieldsSchema,
    },
    { optional: ["fields"] },
  ),
  outputSchema: s.object("The response returned when getting a Tracker project.", {
    project: projectSchema,
  }),
});

const listProjectStoriesAction = defineProviderAction(service, {
  name: "list_project_stories",
  operationType: "read",
  description: "List stories in a Pivotal Tracker project with optional filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Tracker project stories.",
    {
      projectId: projectIdSchema,
      filter: filterSchema,
      withState: storyStateSchema,
      withStoryType: storyTypeSchema,
      limit: limitSchema,
      offset: offsetSchema,
      fields: fieldsSchema,
    },
    { optional: ["filter", "withState", "withStoryType", "limit", "offset", "fields"] },
  ),
  outputSchema: s.object("The response returned when listing Tracker stories.", {
    stories: s.array("Stories returned by Tracker.", storySchema),
  }),
});

const getStoryAction = defineProviderAction(service, {
  name: "get_story",
  operationType: "read",
  description: "Get one Pivotal Tracker story by project ID and story ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting a Tracker story.",
    {
      projectId: projectIdSchema,
      storyId: storyIdSchema,
      fields: fieldsSchema,
    },
    { optional: ["fields"] },
  ),
  outputSchema: s.object("The response returned when getting a Tracker story.", {
    story: storySchema,
  }),
});

const createStoryAction = defineProviderAction(service, {
  name: "create_story",
  operationType: "write",
  description: "Create a Pivotal Tracker story in a project.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a Tracker story.",
    {
      projectId: projectIdSchema,
      name: storyNameSchema,
      storyType: storyTypeSchema,
      currentState: storyStateSchema,
      description: s.string("Story description.", { minLength: 1 }),
      estimate: s.number("Story estimate."),
      requestedById: s.positiveInteger("ID of the requester person."),
      ownerIds: numberArraySchema,
      labelNames: labelNamesSchema,
    },
    {
      optional: ["storyType", "currentState", "description", "estimate", "requestedById", "ownerIds", "labelNames"],
    },
  ),
  outputSchema: s.object("The response returned when creating a Tracker story.", {
    story: storySchema,
  }),
});

const updateStoryStateAction = defineProviderAction(service, {
  name: "update_story_state",
  operationType: "write",
  description: "Update the current state of a Pivotal Tracker story.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for updating a Tracker story state.", {
    projectId: projectIdSchema,
    storyId: storyIdSchema,
    currentState: storyStateSchema,
  }),
  outputSchema: s.object("The response returned when updating a Tracker story state.", {
    story: storySchema,
  }),
});

const listStoryCommentsAction = defineProviderAction(service, {
  name: "list_story_comments",
  operationType: "read",
  description: "List text comments on a Pivotal Tracker story.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Tracker story comments.",
    {
      projectId: projectIdSchema,
      storyId: storyIdSchema,
      limit: limitSchema,
      offset: offsetSchema,
      fields: fieldsSchema,
    },
    { optional: ["limit", "offset", "fields"] },
  ),
  outputSchema: s.object("The response returned when listing Tracker story comments.", {
    comments: s.array("Comments returned by Tracker.", commentSchema),
  }),
});

const createStoryCommentAction = defineProviderAction(service, {
  name: "create_story_comment",
  operationType: "write",
  description: "Create a text comment on a Pivotal Tracker story.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for creating a Tracker story comment.", {
    projectId: projectIdSchema,
    storyId: storyIdSchema,
    text: textSchema,
  }),
  outputSchema: s.object("The response returned when creating a Tracker story comment.", {
    comment: commentSchema,
  }),
});

export const pivotalTrackerActions: ProviderActionDefinition[] = [
  getCurrentUserAction,
  listProjectsAction,
  getProjectAction,
  listProjectStoriesAction,
  getStoryAction,
  createStoryAction,
  updateStoryStateAction,
  listStoryCommentsAction,
  createStoryCommentAction,
];
