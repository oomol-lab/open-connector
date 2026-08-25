import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "codemagic";

const looseObjectSchema = s.looseObject("A Codemagic object returned by the API.");
const nullableStringField = s.nullableString("A string value or null when the field is not set.");
const dateTimeField = s.string("Timestamp in ISO 8601 format.");
const nullableDateTimeField = s.nullableString("Timestamp in ISO 8601 format, or null when the field is not set.");
const pageField = s.positiveInteger("The page number to fetch.");
const pageSizeField = s.integer("The maximum number of results to return per page.", {
  minimum: 1,
  maximum: 100,
});
const cursorField = s.string("Cursor returned by the previous response to continue listing results.");
const teamIdField = s.nonEmptyString("The Codemagic team ID.");
const appIdField = s.nonEmptyString("The Codemagic application ID.");
const buildIdField = s.nonEmptyString("The Codemagic build ID.");

const permissionListSchema = s.stringArray("Permissions granted for a single team.", {
  itemDescription: "A granted Codemagic permission.",
});
const permissionMapSchema = s.record("Permissions keyed by team ID.", permissionListSchema);

const userSchema = s.looseObject("Authenticated Codemagic user.", {
  id: s.string("The authenticated Codemagic user ID."),
  avatar_url: nullableStringField,
  permissions: permissionMapSchema,
});

const teamSchema = s.looseObject("Codemagic team.", {
  id: s.string("The Codemagic team ID."),
  name: s.string("Display name of the team."),
  icon_url: nullableStringField,
});

const repositorySchema = s.looseObject("Repository metadata for the Codemagic application.", {
  provider: s.string("Repository provider reported by Codemagic, when available."),
  url: s.string("Repository URL, when available."),
  default_branch: s.string("Default repository branch, when available."),
});

const appSchema = s.looseObject("Codemagic application.", {
  id: s.string("The Codemagic application ID."),
  name: s.string("Application name."),
  icon_url: nullableStringField,
  last_build_id: nullableStringField,
  archived: s.nullableBoolean("Whether the application is archived."),
  repository: repositorySchema,
  settings_source: s.string("Where the application settings are sourced from, when available."),
  project_type: nullableStringField,
});

const buildStatusField = s.string("Build status reported by Codemagic, such as queued, building, or finished.");
const artifactSchema = s.looseObject("Artifact metadata returned by Codemagic.");
const releaseNoteSchema = s.looseObject("Release note metadata returned by Codemagic.");
const workflowSchema = s.looseObject("Workflow metadata returned by Codemagic.", {
  id: s.string("Workflow identifier, when available."),
  name: s.string("Workflow name, when available."),
});
const commitSchema = s.looseObject("Commit metadata returned by Codemagic.", {
  hash: s.string("Commit SHA, when available."),
  author: s.string("Commit author, when available."),
  message: s.string("Commit message, when available."),
});
const pullRequestSchema = s.looseObject("Pull request metadata returned by Codemagic.");

const buildSchema = s.looseObject("Codemagic build.", {
  id: s.string("The Codemagic build ID."),
  app_id: s.string("The application ID that owns the build."),
  workflow: workflowSchema,
  status: buildStatusField,
  index: s.integer("Build sequence number."),
  labels: s.stringArray("Labels attached to the build.", {
    itemDescription: "A label attached to the build.",
  }),
  artifacts: s.array("Artifacts attached to the build.", artifactSchema),
  release_notes: s.array("Release notes attached to the build.", releaseNoteSchema),
  created_at: dateTimeField,
  started_at: nullableDateTimeField,
  finished_at: nullableDateTimeField,
  branch: nullableStringField,
  tag: nullableStringField,
  commit: s.nullable(commitSchema),
  pull_request: s.nullable(pullRequestSchema),
  instance_type: nullableStringField,
  remote_access_enabled: s.boolean("Whether remote access is enabled for the build."),
  config: looseObjectSchema,
  build_inputs: looseObjectSchema,
});

const userPaginationInputSchema = s.object(
  "Pagination options for authenticated-user list actions.",
  {
    page: pageField,
    page_size: pageSizeField,
  },
  { optional: ["page", "page_size"] },
);

const listUserTeamsOutputSchema = s.object("Paginated list of Codemagic teams.", {
  teams: s.array("Teams accessible to the authenticated user.", teamSchema),
  page_size: s.integer("The number of results returned per page."),
  current_page: s.integer("The current page number."),
  total_pages: s.integer("The total number of pages available."),
});

const listUserAppsOutputSchema = s.object("Paginated list of Codemagic applications for the authenticated user.", {
  apps: s.array("Applications accessible to the authenticated user.", appSchema),
  page_size: s.integer("The number of results returned per page."),
  current_page: s.integer("The current page number."),
  total_pages: s.integer("The total number of pages available."),
});

const listTeamAppsInputSchema = s.object(
  "Input for listing team applications.",
  {
    team_id: teamIdField,
    page: pageField,
    page_size: pageSizeField,
    id: s.stringArray("Optional list of application IDs to filter by.", {
      itemDescription: "A Codemagic application ID filter value.",
    }),
  },
  { optional: ["page", "page_size", "id"] },
);

const listTeamAppsOutputSchema = s.object("Paginated list of Codemagic applications for a team.", {
  apps: s.array("Applications that belong to the specified team.", appSchema),
  page_size: s.integer("The number of results returned per page."),
  current_page: s.integer("The current page number."),
  total_pages: s.integer("The total number of pages available."),
});

const buildStatusFilterField = s.stringEnum(
  ["queued", "building", "finished", "failed", "canceled", "timeout", "skipped"],
  {
    description: "Only return builds with this status.",
  },
);
const labelFilterField = s.stringArray("Only return builds that match these labels.", {
  itemDescription: "A build label filter value.",
});

const listTeamBuildsInputSchema = s.object(
  "Input for listing team builds.",
  {
    team_id: teamIdField,
    app_id: s.nonEmptyString("Only return builds for this application ID."),
    status: buildStatusFilterField,
    workflow_id: s.nonEmptyString("Only return builds for this workflow ID."),
    branch: s.nonEmptyString("Only return builds for this branch."),
    tag: s.nonEmptyString("Only return builds for this tag."),
    label: labelFilterField,
    cursor: cursorField,
    page_size: pageSizeField,
  },
  { optional: ["app_id", "status", "workflow_id", "branch", "tag", "label", "cursor", "page_size"] },
);

const listTeamBuildsOutputSchema = s.object("Cursor-paginated list of Codemagic builds.", {
  builds: s.array("Builds returned for the specified team.", buildSchema),
  page_size: s.integer("The number of results returned per page."),
  cursor: s.nullableString("Cursor for the next page, or null when there are no more results."),
});

const environmentOverrideSchema = s.object(
  "Environment overrides applied when starting a build.",
  {
    variables: s.record(
      "Environment variable overrides keyed by variable name.",
      s.union([s.string(), s.number(), s.boolean()]),
    ),
    groups: s.stringArray("Variable groups to inject into the build.", {
      itemDescription: "A Codemagic variable group name.",
    }),
    softwareVersions: s.record("Software version overrides keyed by tool name.", s.string()),
  },
  { optional: ["variables", "groups", "softwareVersions"] },
);

const createBuildInputSchema = s.object(
  "Input for starting a new Codemagic build. Either branch or tag must be provided.",
  {
    appId: appIdField,
    workflowId: s.nonEmptyString("The workflow identifier as specified in the YAML file."),
    branch: s.nonEmptyString("Git branch name to build. Either branch or tag is required."),
    tag: s.nonEmptyString("Git tag name to build. Either branch or tag is required."),
    labels: s.stringArray("Labels to attach to the build.", {
      itemDescription: "A build label to attach.",
    }),
    environment: environmentOverrideSchema,
    instanceType: s.nonEmptyString("Build machine type, such as mac_mini_m2 or linux_standard."),
  },
  { optional: ["branch", "tag", "labels", "environment", "instanceType"] },
);

const createBuildOutputSchema = s.object("Response returned after a build is created.", {
  buildId: s.string("The newly created Codemagic build ID."),
});

const cancelBuildInputSchema = s.object(
  "Input for canceling a Codemagic build.",
  {
    build_id: buildIdField,
  },
  { required: ["build_id"] },
);

const cancelBuildOutputSchema = s.object("Acknowledgement returned after a cancel request.", {
  ok: s.boolean("Whether the cancel request was accepted."),
  build_id: s.string("The build ID that was targeted."),
  already_finished: s.boolean("Whether Codemagic reported that the build had already finished."),
});

export const codemagicActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated Codemagic user and their available team permissions.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "list_user_teams",
    description: "List the Codemagic teams accessible to the authenticated user.",
    inputSchema: userPaginationInputSchema,
    outputSchema: listUserTeamsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_user_apps",
    description: "List the Codemagic applications accessible to the authenticated user.",
    inputSchema: userPaginationInputSchema,
    outputSchema: listUserAppsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_team_apps",
    description: "List the applications that belong to a specific Codemagic team.",
    inputSchema: listTeamAppsInputSchema,
    outputSchema: listTeamAppsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_team_builds",
    description: "List builds for a specific Codemagic team with optional filters.",
    inputSchema: listTeamBuildsInputSchema,
    outputSchema: listTeamBuildsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_build",
    description: "Get detailed information about a single Codemagic build.",
    inputSchema: s.object(
      "Input for fetching a single build.",
      {
        build_id: buildIdField,
      },
      { required: ["build_id"] },
    ),
    outputSchema: buildSchema,
  }),
  defineProviderAction(service, {
    name: "create_build",
    description: "Start a new Codemagic build for the specified app and workflow.",
    inputSchema: createBuildInputSchema,
    outputSchema: createBuildOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_build",
    description: "Cancel a Codemagic build by its build ID.",
    inputSchema: cancelBuildInputSchema,
    outputSchema: cancelBuildOutputSchema,
  }),
];
