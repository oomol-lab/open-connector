import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bitrise";

function nonEmptyString(description: string): JsonSchema {
  return s.string(description, {
    minLength: 1,
  });
}

const appSlugSchema = nonEmptyString("Bitrise app slug.");
const buildSlugSchema = nonEmptyString("Bitrise build slug.");
const nextSchema = nonEmptyString("Pagination cursor returned by Bitrise in paging.next.");
const limitSchema = s.integer("Maximum number of items to return. Bitrise allows up to 50.", {
  minimum: 1,
  maximum: 50,
});

const appSortBySchema = s.stringEnum("Application sort order.", ["last_build_at", "created_at"]);
const buildSortBySchema = s.stringEnum("Build sort order.", ["running_first", "created_at"]);
const triggerEventTypeSchema = s.stringEnum("Build trigger event type filter.", ["push", "pull-request", "tag"]);

const pagingSchema = s.looseObject("Bitrise pagination metadata.", {
  next: s.string("Cursor to pass as the next input parameter when another page exists."),
  page_item_limit: s.integer("Maximum number of items in this page."),
  total_item_count: s.integer("Total number of items across all pages."),
});

const appSchema = s.looseObject("Bitrise app returned by the API.", {
  slug: s.string("Bitrise app slug."),
  title: s.string("Bitrise app title."),
  project_type: s.string("Bitrise project type."),
  repo_owner: s.string("Repository owner name."),
  repo_slug: s.string("Repository slug."),
  repo_url: s.string("Repository URL."),
  provider: s.string("Git provider connected to the app."),
  is_disabled: s.boolean("Whether the app is disabled."),
  is_public: s.boolean("Whether the app is public."),
});

const buildSchema = s.looseObject("Bitrise build returned by the API.", {
  slug: s.string("Bitrise build slug."),
  build_number: s.integer("Bitrise build number."),
  branch: s.string("Git branch for the build."),
  tag: s.string("Git tag for the build."),
  commit_hash: s.string("Git commit hash for the build."),
  commit_message: s.string("Git commit message for the build."),
  status: s.integer("Numeric Bitrise build status."),
  status_text: s.string("Human-readable Bitrise build status."),
  triggered_workflow: s.string("Workflow triggered for the build."),
  triggered_at: s.string("Timestamp when Bitrise triggered the build."),
  finished_at: s.string("Timestamp when Bitrise finished the build."),
});

const triggerResultSchema = s.looseObject("Single Bitrise trigger result.", {
  build_number: s.integer("Build number created by Bitrise."),
  build_slug: s.string("Build slug created by Bitrise."),
  build_url: s.string("URL for the triggered build."),
  message: s.string("Bitrise trigger result message."),
  status: s.string("Bitrise trigger result status."),
  triggered_pipeline: s.string("Pipeline triggered by Bitrise."),
  triggered_workflow: s.string("Workflow triggered by Bitrise."),
});

const triggerSchema = s.looseObject("Bitrise build trigger response.", {
  message: s.string("Bitrise trigger response message."),
  results: s.array("Build or pipeline trigger results.", triggerResultSchema),
  service: s.string("Bitrise response service identifier."),
  slug: s.string("Bitrise trigger response slug."),
  status: s.string("Bitrise trigger response status."),
  build_number: s.integer("Deprecated build number returned by Bitrise."),
  build_slug: s.string("Deprecated build slug returned by Bitrise."),
  build_url: s.string("Deprecated build URL returned by Bitrise."),
  triggered_workflow: s.string("Deprecated triggered workflow returned by Bitrise."),
});

const environmentSchema = s.object(
  "Environment variable to pass to the triggered Bitrise build.",
  {
    key: nonEmptyString("Environment variable name."),
    value: s.string("Environment variable value."),
    isExpand: s.boolean("Whether Bitrise should expand this environment variable."),
  },
  {
    optional: ["isExpand"],
  },
);

const listAppsInputSchema = s.object(
  "Input parameters for listing Bitrise apps.",
  {
    sortBy: appSortBySchema,
    next: nextSchema,
    limit: limitSchema,
    title: nonEmptyString("Filter apps by title."),
    projectType: nonEmptyString("Filter apps by project type, such as ios or android."),
  },
  {
    optional: ["sortBy", "next", "limit", "title", "projectType"],
  },
);

const listAppsOutputSchema = s.object(
  "Bitrise apps list.",
  {
    apps: s.array("Apps returned by Bitrise.", appSchema),
    paging: pagingSchema,
  },
  {
    optional: ["paging"],
  },
);

const listBuildsInputSchema = s.object(
  "Input parameters for listing Bitrise builds.",
  {
    appSlug: appSlugSchema,
    sortBy: buildSortBySchema,
    branch: nonEmptyString("Filter builds by branch."),
    workflow: nonEmptyString("Filter builds by workflow name."),
    commitMessage: nonEmptyString("Filter builds by commit message."),
    triggerEventType: triggerEventTypeSchema,
    pullRequestId: s.integer("Filter builds by pull request ID.", { minimum: 1 }),
    buildNumber: s.integer("Filter builds by build number.", { minimum: 1 }),
    after: s.integer("Return builds triggered after this Unix timestamp."),
    before: s.integer("Return builds triggered before this Unix timestamp."),
    status: s.integer(
      "Filter builds by status: 0 not finished, 1 successful, 2 failed, 3 aborted with failure, 4 aborted with success.",
      { minimum: 0, maximum: 4 },
    ),
    isPipelineBuild: s.boolean("Whether to return pipeline builds."),
    next: nextSchema,
    limit: limitSchema,
  },
  {
    optional: [
      "sortBy",
      "branch",
      "workflow",
      "commitMessage",
      "triggerEventType",
      "pullRequestId",
      "buildNumber",
      "after",
      "before",
      "status",
      "isPipelineBuild",
      "next",
      "limit",
    ],
  },
);

const listBuildsOutputSchema = s.object(
  "Bitrise builds list.",
  {
    builds: s.array("Builds returned by Bitrise.", buildSchema),
    paging: pagingSchema,
  },
  {
    optional: ["paging"],
  },
);

const getBuildInputSchema = s.object("Input parameters for retrieving one Bitrise build.", {
  appSlug: appSlugSchema,
  buildSlug: buildSlugSchema,
});

const getBuildOutputSchema = s.object("Single Bitrise build.", {
  build: buildSchema,
});

const triggerBuildInputSchema = s.object(
  "Input parameters for triggering a Bitrise build or pipeline.",
  {
    appSlug: appSlugSchema,
    branch: nonEmptyString("Git branch to build."),
    workflowId: nonEmptyString("Bitrise workflow ID to trigger."),
    pipelineId: nonEmptyString("Bitrise pipeline ID to trigger."),
    commitHash: nonEmptyString("Git commit hash to build."),
    tag: nonEmptyString("Git tag to build."),
    branchDest: nonEmptyString("Destination branch for pull request builds."),
    pullRequestId: s.integer("Pull request ID for pull request builds.", { minimum: 1 }),
    skipGitStatusReport: s.boolean("Whether Bitrise should skip posting Git status updates."),
    machineTypeId: nonEmptyString("Machine type ID to run the build on."),
    stack: nonEmptyString("Stack identifier to run the build on."),
    priority: s.integer("Build priority."),
    environments: s.array("Environment variables for the triggered build.", environmentSchema, {
      minItems: 1,
    }),
  },
  {
    optional: [
      "branch",
      "workflowId",
      "pipelineId",
      "commitHash",
      "tag",
      "branchDest",
      "pullRequestId",
      "skipGitStatusReport",
      "machineTypeId",
      "stack",
      "priority",
      "environments",
    ],
  },
);

const triggerBuildOutputSchema = s.object("Triggered Bitrise build metadata.", {
  trigger: triggerSchema,
});

export const bitriseActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_apps",
    description: "List Bitrise apps available to the authenticated account.",
    requiredScopes: [],
    inputSchema: listAppsInputSchema,
    outputSchema: listAppsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_builds",
    description: "List builds for a Bitrise app with optional filters and pagination.",
    requiredScopes: [],
    inputSchema: listBuildsInputSchema,
    outputSchema: listBuildsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_build",
    description: "Retrieve one Bitrise build by app slug and build slug.",
    requiredScopes: [],
    inputSchema: getBuildInputSchema,
    outputSchema: getBuildOutputSchema,
  }),
  defineProviderAction(service, {
    name: "trigger_build",
    description: "Trigger a Bitrise build or pipeline for an app.",
    requiredScopes: [],
    inputSchema: triggerBuildInputSchema,
    outputSchema: triggerBuildOutputSchema,
  }),
];

export type BitriseActionName = "list_apps" | "list_builds" | "get_build" | "trigger_build";
