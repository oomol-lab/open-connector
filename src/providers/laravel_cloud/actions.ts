import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "laravel_cloud";

const relationshipSchema = s.looseObject("The relationships object returned by Laravel Cloud.");
const linksSchema = s.looseObject("The links object returned by Laravel Cloud.");
const paginationMetaSchema = s.looseObject("The pagination metadata returned by Laravel Cloud for list endpoints.");
const includedSchema = s.array(
  "The included JSON:API resources returned by Laravel Cloud.",
  s.looseObject("One included JSON:API resource."),
);

const organizationSchema = s.object("A Laravel Cloud organization.", {
  id: s.string("The organization identifier."),
  type: s.string("The JSON:API resource type."),
  name: s.nullable(s.string("The organization name.")),
  slug: s.nullable(s.string("The organization slug.")),
  raw: s.looseObject("The raw organization resource returned by Laravel Cloud."),
});

const regionSchema = s.object("A Laravel Cloud region.", {
  region: s.string("The region identifier."),
  label: s.string("The human-readable region label."),
  flag: s.string("The region flag returned by Laravel Cloud."),
  raw: s.looseObject("The raw region object returned by Laravel Cloud."),
});

const applicationSchema = s.object("A Laravel Cloud application.", {
  id: s.string("The application identifier."),
  type: s.string("The JSON:API resource type."),
  name: s.nullable(s.string("The application name.")),
  slug: s.nullable(s.string("The application slug.")),
  region: s.nullable(s.string("The application region identifier.")),
  slackChannel: s.nullable(s.string("The Slack channel configured for the application.")),
  avatarUrl: s.nullable(s.string("The application avatar URL.")),
  createdAt: s.nullable(s.string("The timestamp when the application was created.")),
  repository: s.nullable(s.looseObject("The repository summary embedded in the application attributes.")),
  relationships: s.nullable(relationshipSchema),
  raw: s.looseObject("The raw application resource returned by Laravel Cloud."),
});

const environmentSchema = s.object("A Laravel Cloud environment.", {
  id: s.string("The environment identifier."),
  type: s.string("The JSON:API resource type."),
  name: s.nullable(s.string("The environment name.")),
  slug: s.nullable(s.string("The environment slug.")),
  status: s.nullable(s.string("The environment status.")),
  vanityDomain: s.nullable(s.string("The environment vanity domain.")),
  phpMajorVersion: s.nullable(s.string("The configured PHP major version.")),
  nodeVersion: s.nullable(s.string("The configured Node.js version.")),
  buildCommand: s.nullable(s.string("The build command when configured.")),
  deployCommand: s.nullable(s.string("The deploy command when configured.")),
  usesOctane: s.nullable(s.boolean("Whether the environment uses Laravel Octane.")),
  usesPushToDeploy: s.nullable(s.boolean("Whether push-to-deploy is enabled for the environment.")),
  usesDeployHook: s.nullable(s.boolean("Whether deploy hooks are enabled for the environment.")),
  createdAt: s.nullable(s.string("The timestamp when the environment was created.")),
  relationships: s.nullable(relationshipSchema),
  links: s.nullable(linksSchema),
  raw: s.looseObject("The raw environment resource returned by Laravel Cloud."),
});

const deploymentSchema = s.object("A Laravel Cloud deployment.", {
  id: s.string("The deployment identifier."),
  type: s.string("The JSON:API resource type."),
  status: s.nullable(s.string("The deployment status.")),
  branchName: s.nullable(s.string("The deployed branch name.")),
  commitHash: s.nullable(s.string("The deployed commit hash.")),
  commitMessage: s.nullable(s.string("The deployed commit message.")),
  commitAuthor: s.nullable(s.string("The deployed commit author.")),
  failureReason: s.nullable(s.string("The deployment failure reason when available.")),
  phpMajorVersion: s.nullable(s.string("The PHP major version used for the deployment.")),
  buildCommand: s.nullable(s.string("The build command used for the deployment.")),
  nodeVersion: s.nullable(s.string("The Node.js version used for the deployment.")),
  usesOctane: s.nullable(s.boolean("Whether the deployment uses Laravel Octane.")),
  startedAt: s.nullable(s.string("The timestamp when the deployment started.")),
  finishedAt: s.nullable(s.string("The timestamp when the deployment finished.")),
  relationships: s.nullable(relationshipSchema),
  links: s.nullable(linksSchema),
  raw: s.looseObject("The raw deployment resource returned by Laravel Cloud."),
});

const applicationIncludeSchema = s.array(
  "Related application resources to include.",
  s.stringEnum("One Laravel Cloud include relationship.", ["organization", "environments", "defaultEnvironment"]),
  { minItems: 1 },
);

const environmentIncludeSchema = s.array(
  "Related environment resources to include.",
  s.stringEnum("One Laravel Cloud include relationship.", [
    "application",
    "branch",
    "deployments",
    "currentDeployment",
    "primaryDomain",
    "instances",
    "database",
    "cache",
    "buckets",
    "websocketApplication",
  ]),
  { minItems: 1 },
);

const deploymentIncludeSchema = s.array(
  "Related deployment resources to include.",
  s.stringEnum("One Laravel Cloud include relationship.", ["environment", "initiator"]),
  { minItems: 1 },
);

export const laravelCloudActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_organization",
    description: "Get the Laravel Cloud organization associated with the API token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for getting the Laravel Cloud organization.", {}),
    outputSchema: s.object("The response returned when getting the Laravel Cloud organization.", {
      organization: organizationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_regions",
    description: "List cloud regions currently available in Laravel Cloud.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Laravel Cloud regions.", {}),
    outputSchema: s.object("The response returned when listing Laravel Cloud regions.", {
      regions: s.array("The regions returned by Laravel Cloud.", regionSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_applications",
    description: "List Laravel Cloud applications for the authenticated organization.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Laravel Cloud applications.",
      {
        name: s.nonEmptyString("Filter applications by name."),
        region: s.nonEmptyString("Filter applications by region identifier."),
        slug: s.nonEmptyString("Filter applications by slug."),
        include: applicationIncludeSchema,
      },
      { optional: ["name", "region", "slug", "include"] },
    ),
    outputSchema: s.object("The response returned when listing Laravel Cloud applications.", {
      applications: s.array("The applications returned by Laravel Cloud.", applicationSchema),
      links: s.nullable(linksSchema),
      meta: s.nullable(paginationMetaSchema),
      included: s.nullable(includedSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_application",
    description: "Get a specific Laravel Cloud application.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for getting a Laravel Cloud application.",
      {
        applicationId: s.nonEmptyString("The Laravel Cloud application identifier."),
        include: applicationIncludeSchema,
      },
      { optional: ["include"] },
    ),
    outputSchema: s.object("The response returned when getting a Laravel Cloud application.", {
      application: applicationSchema,
      included: s.nullable(includedSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_environments",
    description: "List Laravel Cloud environments for an application.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Laravel Cloud environments.",
      {
        applicationId: s.nonEmptyString("The Laravel Cloud application identifier."),
        name: s.nonEmptyString("Filter environments by name."),
        status: s.nonEmptyString("Filter environments by status."),
        slug: s.nonEmptyString("Filter environments by slug."),
        include: environmentIncludeSchema,
      },
      { optional: ["name", "status", "slug", "include"] },
    ),
    outputSchema: s.object("The response returned when listing Laravel Cloud environments.", {
      environments: s.array("The environments returned by Laravel Cloud.", environmentSchema),
      links: s.nullable(linksSchema),
      meta: s.nullable(paginationMetaSchema),
      included: s.nullable(includedSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_environment",
    description: "Get a specific Laravel Cloud environment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for getting a Laravel Cloud environment.",
      {
        environmentId: s.nonEmptyString("The Laravel Cloud environment identifier."),
        include: environmentIncludeSchema,
      },
      { optional: ["include"] },
    ),
    outputSchema: s.object("The response returned when getting a Laravel Cloud environment.", {
      environment: environmentSchema,
      included: s.nullable(includedSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    description: "List Laravel Cloud deployments for an environment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Laravel Cloud deployments.",
      {
        environmentId: s.nonEmptyString("The Laravel Cloud environment identifier."),
        status: s.nonEmptyString("Filter deployments by status."),
        branchName: s.nonEmptyString("Filter deployments by branch name."),
        commitHash: s.nonEmptyString("Filter deployments by commit hash."),
        include: deploymentIncludeSchema,
      },
      { optional: ["status", "branchName", "commitHash", "include"] },
    ),
    outputSchema: s.object("The response returned when listing Laravel Cloud deployments.", {
      deployments: s.array("The deployments returned by Laravel Cloud.", deploymentSchema),
      links: s.nullable(linksSchema),
      meta: s.nullable(paginationMetaSchema),
      included: s.nullable(includedSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    description: "Get a specific Laravel Cloud deployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for getting a Laravel Cloud deployment.",
      {
        deploymentId: s.nonEmptyString("The Laravel Cloud deployment identifier."),
        include: deploymentIncludeSchema,
      },
      { optional: ["include"] },
    ),
    outputSchema: s.object("The response returned when getting a Laravel Cloud deployment.", {
      deployment: deploymentSchema,
      included: s.nullable(includedSchema),
    }),
  }),
];
