import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "buildkite";

const readUserPermission = ["read_user"];
const readOrganizationsPermission = ["read_organizations"];
const readPipelinesPermission = ["read_pipelines"];
const readBuildsPermission = ["read_builds"];
const writeBuildsPermission = ["write_builds"];

const orgSlugField = s.nonEmptyString("The Buildkite organization slug.");
const pipelineSlugField = s.nonEmptyString("The Buildkite pipeline slug.");
const buildNumberField = s.positiveInteger("The pipeline-local Buildkite build number.");
const pageField = s.positiveInteger("The page of results to return.");
const perPageField = s.integer({
  minimum: 1,
  maximum: 100,
  description: "How many results to return per page.",
});
const branchFilterField = s.nonEmptyString("Only return builds for this branch.");
const commitFilterField = s.nonEmptyString("Only return builds for this full commit SHA.");
const createdFromField = s.nonEmptyString("Only return builds created on or after this ISO 8601 timestamp.");
const createdToField = s.nonEmptyString("Only return builds created before this ISO 8601 timestamp.");
const finishedFromField = s.nonEmptyString("Only return builds finished on or after this ISO 8601 timestamp.");
const includeRetriedJobsField = s.boolean("Whether retried job executions should be included in each build.");
const includeTestEngineField = s.boolean(
  "Whether Buildkite Test Engine data should be included in the build response.",
);
const buildStateFilterField = s.stringEnum(
  [
    "creating",
    "scheduled",
    "running",
    "passed",
    "failing",
    "failed",
    "blocked",
    "canceling",
    "canceled",
    "skipped",
    "not_run",
    "finished",
  ],
  {
    description: "Only return builds in this Buildkite state.",
  },
);
const repositoryFilterField = s.nonEmptyString(
  "Only return pipelines whose repository URL contains this case-insensitive value.",
);
const nameFilterField = s.nonEmptyString("Only return pipelines whose name contains this case-insensitive value.");
const commitField = s.nonEmptyString("The ref, SHA, or tag to build.");
const branchField = s.nonEmptyString("The branch the build commit belongs to.");
const stringRecordSchema = s.record(s.string("Environment variable value."), {
  description: "A JSON object whose values are strings.",
});
const stringArrayField = s.stringArray("A non-empty list of strings.", {
  minItems: 1,
  itemDescription: "A non-empty string value.",
});

const paginationLinksSchema = s.object(
  "Pagination links parsed from the Buildkite Link response header.",
  {
    next: s.nullableString("URL of the next page returned in the Buildkite Link header, or null."),
    prev: s.nullableString("URL of the previous page returned in the Buildkite Link header, or null."),
    first: s.nullableString("URL of the first page returned in the Buildkite Link header, or null."),
    last: s.nullableString("URL of the last page returned in the Buildkite Link header, or null."),
  },
  {
    required: ["next", "prev", "first", "last"],
  },
);

const accessTokenSchema = s.object(
  "The current Buildkite API access token.",
  {
    uuid: s.nonEmptyString("Unique identifier of the API access token."),
    scopes: s.stringArray("Granted scopes for the current API access token."),
    description: s.string("Description configured for the current API access token, when present."),
    created_at: s.string("Timestamp when the current API access token was created, when present."),
    user: s.looseObject("Summary of the user account that owns the token."),
  },
  {
    required: ["uuid", "scopes"],
    additionalProperties: true,
  },
);

const userSchema = s.object(
  "Buildkite user.",
  {
    id: s.nonEmptyString("Unique identifier of the Buildkite user."),
    graphql_id: s.string("GraphQL identifier of the Buildkite user."),
    name: s.nonEmptyString("Display name of the Buildkite user."),
    email: s.email("Email address of the Buildkite user."),
    avatar_url: s.url("Avatar URL of the Buildkite user, when present."),
    created_at: s.dateTime("Timestamp when the user account was created."),
  },
  {
    required: ["id", "name", "email", "created_at"],
    additionalProperties: true,
  },
);

const organizationSchema = s.object(
  "Buildkite organization.",
  {
    id: s.nonEmptyString("Unique identifier of the Buildkite organization."),
    graphql_id: s.string("GraphQL identifier of the Buildkite organization."),
    url: s.url("Canonical API URL of the organization."),
    web_url: s.url("Buildkite web URL of the organization."),
    name: s.nonEmptyString("Display name of the organization."),
    slug: orgSlugField,
    pipelines_url: s.url("API URL for the organization's pipelines."),
    agents_url: s.url("API URL for the organization's agents."),
    emojis_url: s.url("API URL for the organization's custom emojis."),
    created_at: s.dateTime("Timestamp when the organization was created."),
  },
  {
    required: ["id", "url", "web_url", "name", "slug", "created_at"],
    additionalProperties: true,
  },
);

const pipelineSchema = s.looseObject("Buildkite pipeline.");
const buildSchema = s.looseObject("Buildkite build.");

const authorInputSchema = s.object(
  "Build author metadata.",
  {
    name: s.nonEmptyString("Name of the user to attribute the build to."),
    email: s.email("Email address of the user to attribute the build to."),
  },
  {
    required: ["name", "email"],
  },
);

const emptyInputSchema = (description: string) => s.object(description, {}, { required: [] });

const listOrganizationsOutputSchema = s.object(
  "Paginated Buildkite organization list.",
  {
    organizations: s.array("Buildkite organizations returned by the request.", organizationSchema),
    links: paginationLinksSchema,
  },
  {
    required: ["organizations", "links"],
  },
);

const listPipelinesOutputSchema = s.object(
  "Paginated Buildkite pipeline list.",
  {
    pipelines: s.array("Buildkite pipelines returned by the request.", pipelineSchema),
    links: paginationLinksSchema,
  },
  {
    required: ["pipelines", "links"],
  },
);

const listBuildsOutputSchema = s.object(
  "Paginated Buildkite build list.",
  {
    builds: s.array("Buildkite builds returned by the request.", buildSchema),
    links: paginationLinksSchema,
  },
  {
    required: ["builds", "links"],
  },
);

const paginationInputFields = {
  page: pageField,
  per_page: perPageField,
};

const buildListInputFields = {
  ...paginationInputFields,
  branch: branchFilterField,
  commit: commitFilterField,
  created_from: createdFromField,
  created_to: createdToField,
  finished_from: finishedFromField,
  state: buildStateFilterField,
  include_retried_jobs: includeRetriedJobsField,
};

export const buildkiteActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_access_token",
    description: "Inspect the current Buildkite API access token, including scopes and owner summary.",
    requiredScopes: [],
    providerPermissions: [],
    followUpActions: ["buildkite.get_current_user", "buildkite.list_organizations"],
    inputSchema: emptyInputSchema("The input payload for getting the current Buildkite API access token."),
    outputSchema: accessTokenSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Buildkite user account that owns the current API access token.",
    requiredScopes: readUserPermission,
    providerPermissions: readUserPermission,
    followUpActions: ["buildkite.list_organizations"],
    inputSchema: emptyInputSchema("The input payload for getting the current Buildkite user."),
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List Buildkite organizations accessible to the current API token.",
    requiredScopes: readOrganizationsPermission,
    providerPermissions: readOrganizationsPermission,
    followUpActions: ["buildkite.get_organization"],
    inputSchema: s.object("The input payload for listing Buildkite organizations.", paginationInputFields, {
      optional: ["page", "per_page"],
    }),
    outputSchema: listOrganizationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get a single Buildkite organization by slug.",
    requiredScopes: readOrganizationsPermission,
    providerPermissions: readOrganizationsPermission,
    followUpActions: ["buildkite.list_pipelines", "buildkite.list_builds_for_organization"],
    inputSchema: s.object(
      "The input payload for getting a Buildkite organization.",
      {
        org_slug: orgSlugField,
      },
      {
        required: ["org_slug"],
      },
    ),
    outputSchema: organizationSchema,
  }),
  defineProviderAction(service, {
    name: "list_pipelines",
    description: "List Buildkite pipelines for an organization.",
    requiredScopes: readPipelinesPermission,
    providerPermissions: readPipelinesPermission,
    followUpActions: ["buildkite.get_pipeline", "buildkite.list_builds_for_pipeline"],
    inputSchema: s.object(
      "The input payload for listing Buildkite pipelines.",
      {
        org_slug: orgSlugField,
        ...paginationInputFields,
        name: nameFilterField,
        repository: repositoryFilterField,
      },
      {
        required: ["org_slug"],
      },
    ),
    outputSchema: listPipelinesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_pipeline",
    description: "Get a single Buildkite pipeline by organization and pipeline slug.",
    requiredScopes: readPipelinesPermission,
    providerPermissions: readPipelinesPermission,
    inputSchema: s.object(
      "The input payload for getting a Buildkite pipeline.",
      {
        org_slug: orgSlugField,
        pipeline_slug: pipelineSlugField,
      },
      {
        required: ["org_slug", "pipeline_slug"],
      },
    ),
    outputSchema: pipelineSchema,
  }),
  defineProviderAction(service, {
    name: "list_builds_for_organization",
    description: "List builds across all pipelines in a Buildkite organization.",
    requiredScopes: readBuildsPermission,
    providerPermissions: readBuildsPermission,
    followUpActions: ["buildkite.get_build"],
    inputSchema: s.object(
      "The input payload for listing Buildkite builds for an organization.",
      {
        org_slug: orgSlugField,
        ...buildListInputFields,
      },
      {
        required: ["org_slug"],
      },
    ),
    outputSchema: listBuildsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_builds_for_pipeline",
    description: "List builds for a single Buildkite pipeline.",
    requiredScopes: readBuildsPermission,
    providerPermissions: readBuildsPermission,
    followUpActions: ["buildkite.get_build"],
    inputSchema: s.object(
      "The input payload for listing Buildkite builds for a pipeline.",
      {
        org_slug: orgSlugField,
        pipeline_slug: pipelineSlugField,
        ...buildListInputFields,
      },
      {
        required: ["org_slug", "pipeline_slug"],
      },
    ),
    outputSchema: listBuildsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_build",
    description: "Get a single Buildkite build by organization, pipeline slug, and build number.",
    requiredScopes: readBuildsPermission,
    providerPermissions: readBuildsPermission,
    inputSchema: s.object(
      "The input payload for getting a Buildkite build.",
      {
        org_slug: orgSlugField,
        pipeline_slug: pipelineSlugField,
        number: buildNumberField,
        include_retried_jobs: includeRetriedJobsField,
        include_test_engine: includeTestEngineField,
      },
      {
        required: ["org_slug", "pipeline_slug", "number"],
      },
    ),
    outputSchema: buildSchema,
  }),
  defineProviderAction(service, {
    name: "create_build",
    description: "Create a new Buildkite build for a pipeline.",
    requiredScopes: writeBuildsPermission,
    providerPermissions: writeBuildsPermission,
    inputSchema: s.object(
      "The input payload for creating a Buildkite build.",
      {
        org_slug: orgSlugField,
        pipeline_slug: pipelineSlugField,
        commit: commitField,
        branch: branchField,
        message: s.string("Custom message for the build, when provided."),
        author: authorInputSchema,
        env: stringRecordSchema,
        meta_data: s.looseObject("Metadata values to attach to the build."),
        clean_checkout: s.boolean("Whether the agent should perform a fresh checkout."),
        ignore_pipeline_branch_filters: s.boolean("Whether the build should ignore pipeline-level branch filters."),
        pull_request_id: s.positiveInteger("Pull request number for a pull request build."),
        pull_request_base_branch: s.nonEmptyString("Base branch for a pull request build."),
        pull_request_repository: s.nonEmptyString("Repository URL of the pull request build source."),
        pull_request_labels: stringArrayField,
      },
      {
        required: ["org_slug", "pipeline_slug", "commit", "branch"],
      },
    ),
    outputSchema: buildSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_build",
    description: "Cancel a Buildkite build by build number.",
    requiredScopes: writeBuildsPermission,
    providerPermissions: writeBuildsPermission,
    inputSchema: s.object(
      "The input payload for canceling a Buildkite build.",
      {
        org_slug: orgSlugField,
        pipeline_slug: pipelineSlugField,
        number: buildNumberField,
      },
      {
        required: ["org_slug", "pipeline_slug", "number"],
      },
    ),
    outputSchema: buildSchema,
  }),
  defineProviderAction(service, {
    name: "rebuild_build",
    description: "Rebuild a Buildkite build by build number.",
    requiredScopes: writeBuildsPermission,
    providerPermissions: writeBuildsPermission,
    inputSchema: s.object(
      "The input payload for rebuilding a Buildkite build.",
      {
        org_slug: orgSlugField,
        pipeline_slug: pipelineSlugField,
        number: buildNumberField,
      },
      {
        required: ["org_slug", "pipeline_slug", "number"],
      },
    ),
    outputSchema: buildSchema,
  }),
];
