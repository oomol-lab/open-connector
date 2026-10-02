import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const projectIdSchema = s.nonEmptyString("The EdgeOne Makers project ID.");
const deploymentIdSchema = s.nonEmptyString("The EdgeOne Makers deployment ID.");
const areaSchema = s.stringEnum("The acceleration area for the project.", ["mainland", "overseas", "global"]);
const environmentSchema = s.stringEnum("The deployment environment.", ["Production", "Preview"]);
const orderSchema = s.object(
  "The result ordering configuration.",
  {
    field: s.stringEnum("The timestamp field used for ordering.", ["createdOn", "modifiedOn"]),
    direction: s.stringEnum("The ordering direction.", ["asc", "desc"]),
  },
  { optional: [] },
);
const pageInputFields = {
  page: s.optional(s.nonNegativeInteger("The zero-based page number. Defaults to 0.")),
  pageSize: s.optional(
    s.positiveInteger("The maximum number of records returned per page. Defaults to 20.", {
      maximum: 100,
    }),
  ),
  order: s.optional(orderSchema),
};
const pageOutputFields = {
  page: s.nonNegativeInteger("The zero-based page number."),
  pageSize: s.positiveInteger("The requested page size."),
  total: s.nonNegativeInteger("The total number of matching records."),
  hasNext: s.boolean("Whether another result page is available."),
};
const envVarSchema = s.object(
  "An EdgeOne Makers project environment variable.",
  {
    key: s.nonEmptyString("The environment variable name."),
    value: s.string("The environment variable value."),
    comment: s.optional(s.string("An optional note describing the variable.")),
  },
  { optional: ["comment"] },
);
const projectSchema = s.looseRequiredObject(
  "An EdgeOne Makers project.",
  {
    projectId: projectIdSchema,
    name: s.nonEmptyString("The unique project name in the connected account."),
    status: s.string("The project status reported by EdgeOne Makers."),
    area: s.optional(areaSchema),
    presetDomain: s.optional(s.string("The default domain assigned to the project.")),
    createdOn: s.string("The project creation time in ISO 8601 format."),
    modifiedOn: s.string("The project modification time in ISO 8601 format."),
  },
  { optional: ["area", "presetDomain"] },
);
const deploymentSchema = s.looseRequiredObject(
  "An EdgeOne Makers deployment.",
  {
    deploymentId: deploymentIdSchema,
    projectId: projectIdSchema,
    env: environmentSchema,
    status: s.optional(s.string("The deployment status reported by EdgeOne Makers.")),
    previewUrl: s.optional(
      s.string(
        "The deployment preview address when available. List results can contain an unsigned address, while a successful deployment detail contains an accessible URL.",
      ),
    ),
    code: s.optional(s.string("The provider error code when the deployment failed.")),
    createdOn: s.optional(s.string("The deployment creation time in ISO 8601 format.")),
    modifiedOn: s.optional(s.string("The deployment modification time in ISO 8601 format.")),
  },
  { optional: ["status", "previewUrl", "code", "createdOn", "modifiedOn"] },
);
const projectOutputSchema = s.object(
  "The requested EdgeOne Makers project.",
  {
    project: projectSchema,
  },
  { optional: [] },
);
const deploymentOutputSchema = s.object(
  "The requested EdgeOne Makers deployment.",
  {
    deployment: deploymentSchema,
  },
  { optional: [] },
);
export const edgeOneMakersActions: ActionDefinition[] = [
  defineProviderAction("edgeone_makers", {
    name: "list_projects",
    operationType: "read",
    description: "List EdgeOne Makers projects available to the connected account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for listing EdgeOne Makers projects.",
      {
        projectIds: s.optional(s.array("Project IDs used to filter the result.", projectIdSchema, { minItems: 1 })),
        name: s.optional(s.nonEmptyString("A project name used to filter the result.")),
        status: s.optional(s.nonEmptyString("A project status used to filter the result.")),
        provider: s.optional(s.nonEmptyString("A project source provider used to filter the result.")),
        ...pageInputFields,
      },
      { optional: ["projectIds", "name", "status", "provider", "page", "pageSize", "order"] },
    ),
    outputSchema: s.object(
      "A page of EdgeOne Makers projects.",
      {
        projects: s.array("The projects in this page.", projectSchema),
        ...pageOutputFields,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("edgeone_makers", {
    name: "get_project",
    operationType: "read",
    description: "Get an EdgeOne Makers project by ID.",
    requiredScopes: [],
    inputSchema: s.object("The project to retrieve.", { projectId: projectIdSchema }, { optional: [] }),
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction("edgeone_makers", {
    name: "update_project",
    operationType: "write",
    description: "Update an EdgeOne Makers project's name or build configuration.",
    requiredScopes: [],
    inputSchema: s.object(
      "The project ID and fields to update.",
      {
        projectId: projectIdSchema,
        name: s.optional(s.nonEmptyString("A new unique project name.")),
        rootDir: s.optional(s.string("The project root directory used during builds.")),
        outputDir: s.optional(s.string("The directory containing deployable build output.")),
        buildCmd: s.optional(s.string("The command used to build the project.")),
        installCmd: s.optional(s.string("The command used to install project dependencies.")),
        framework: s.optional(s.string("The EdgeOne Makers framework preset.")),
        nodejsVersion: s.optional(s.string("The Node.js version used for builds.")),
      },
      {
        optional: ["name", "rootDir", "outputDir", "buildCmd", "installCmd", "framework", "nodejsVersion"],
      },
    ),
    outputSchema: s.object("The updated project identifier.", { projectId: projectIdSchema }, { optional: [] }),
  }),
  defineProviderAction("edgeone_makers", {
    name: "delete_project",
    operationType: "destructive",
    description: "Delete an EdgeOne Makers project and its deployment history.",
    requiredScopes: [],
    inputSchema: s.object("The project to delete.", { projectId: projectIdSchema }, { optional: [] }),
    outputSchema: s.object("The deleted project identifier.", { projectId: projectIdSchema }, { optional: [] }),
  }),
  defineProviderAction("edgeone_makers", {
    name: "trigger_deployment_webhook",
    operationType: "write",
    description: "Trigger a deployment through an EdgeOne Makers project deployment webhook.",
    requiredScopes: [],
    inputSchema: s.object(
      "The EdgeOne Makers deployment webhook to trigger.",
      {
        webhookUrl: s.url("The unique deployment webhook URL created in the EdgeOne Makers project settings."),
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The accepted deployment webhook request.",
      {
        triggered: s.literal(true, { description: "Whether EdgeOne Makers accepted the webhook request." }),
        status: s.integer("The successful HTTP status returned by the deployment webhook.", {
          minimum: 200,
          maximum: 299,
        }),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("edgeone_makers", {
    name: "list_deployments",
    operationType: "read",
    description: "List deployments for an EdgeOne Makers project.",
    requiredScopes: [],
    inputSchema: {
      ...s.object(
        "Filters and pagination for listing project deployments.",
        {
          projectId: projectIdSchema,
          status: s.optional(
            s.array("Deployment statuses used to filter the result.", s.nonEmptyString("A deployment status."), {
              minItems: 1,
            }),
          ),
          startTime: s.optional(s.string("The inclusive ISO 8601 start time for filtering.")),
          endTime: s.optional(s.string("The inclusive ISO 8601 end time for filtering.")),
          repoBranches: s.optional(
            s.array("Repository branches used to filter the result.", s.nonEmptyString("A repository branch name."), {
              minItems: 1,
            }),
          ),
          ...pageInputFields,
        },
        {
          optional: ["status", "startTime", "endTime", "repoBranches", "page", "pageSize", "order"],
        },
      ),
      dependentRequired: { startTime: ["endTime"], endTime: ["startTime"] },
    },
    outputSchema: s.object(
      "A page of EdgeOne Makers deployments.",
      {
        deployments: s.array("The deployments in this page.", deploymentSchema),
        ...pageOutputFields,
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("edgeone_makers", {
    name: "get_deployment",
    operationType: "read",
    description: "Get an EdgeOne Makers deployment and its current status.",
    requiredScopes: [],
    inputSchema: s.object(
      "The deployment to retrieve.",
      {
        projectId: projectIdSchema,
        deploymentId: deploymentIdSchema,
      },
      { optional: [] },
    ),
    outputSchema: deploymentOutputSchema,
  }),
  defineProviderAction("edgeone_makers", {
    name: "get_deployment_log",
    operationType: "read",
    description: "Get the build log URL for an EdgeOne Makers deployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The deployment whose build log URL should be retrieved.",
      {
        projectId: projectIdSchema,
        deploymentId: deploymentIdSchema,
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The deployment build log location.",
      {
        logUrl: s.url("The temporary build log URL returned by EdgeOne Makers."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("edgeone_makers", {
    name: "list_environment_variables",
    operationType: "read",
    description: "List environment variables configured for an EdgeOne Makers project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The project whose environment variables should be listed.",
      {
        projectId: projectIdSchema,
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The project's environment variables.",
      {
        envVars: s.array("The configured environment variables.", envVarSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("edgeone_makers", {
    name: "set_environment_variables",
    operationType: "destructive",
    description:
      "Add or overwrite environment variables for an EdgeOne Makers project while preserving unmentioned variables.",
    requiredScopes: [],
    inputSchema: s.object(
      "The project and environment variables to add or overwrite.",
      {
        projectId: projectIdSchema,
        envVars: s.array("Environment variables to add or overwrite by key.", envVarSchema, {
          minItems: 1,
        }),
      },
      { optional: [] },
    ),
    outputSchema: s.object("The updated project identifier.", { projectId: projectIdSchema }, { optional: [] }),
  }),
  defineProviderAction("edgeone_makers", {
    name: "delete_environment_variables",
    operationType: "destructive",
    description: "Delete environment variables from an EdgeOne Makers project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The project and environment variable names to delete.",
      {
        projectId: projectIdSchema,
        keys: s.array("Environment variable names to delete.", s.nonEmptyString("A variable name."), {
          minItems: 1,
        }),
      },
      { optional: [] },
    ),
    outputSchema: s.object("The updated project identifier.", { projectId: projectIdSchema }, { optional: [] }),
  }),
];
