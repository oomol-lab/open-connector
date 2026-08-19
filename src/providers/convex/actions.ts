import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "convex";

const positiveId = (description: string) => s.positiveInteger(description);
const nonEmpty = (description: string) => s.nonEmptyString(description);
const argsSchema = s.record("Convex function arguments.", s.unknown("One Convex argument value."));

const tokenDetailsSchema = s.object(
  {
    type: s.stringEnum(["teamToken", "projectToken"], { description: "The Convex token type." }),
    name: s.string("The token display name."),
    createTime: s.integer("The token creation timestamp."),
    teamId: s.integer("The team ID for a team token."),
    projectId: s.integer("The project ID for a project token."),
  },
  { required: ["type", "name", "createTime"], optional: ["teamId", "projectId"] },
);

const projectSchema = s.looseObject(
  {
    id: s.integer("The Convex project ID."),
    name: s.string("The project name."),
    slug: s.string("The project slug."),
    teamId: s.integer("The owning team ID."),
    teamSlug: s.string("The owning team slug."),
    createTime: s.integer("The project creation timestamp."),
  },
  { description: "A Convex project." },
);

const deploymentSchema = s.looseObject(
  {
    kind: s.string("The deployment kind."),
    name: s.string("The deployment name."),
    deploymentType: s.string("The deployment type."),
    projectId: s.integer("The owning project ID."),
    createTime: s.integer("The deployment creation timestamp."),
    deploymentUrl: s.string("The deployment URL."),
    reference: s.nullableString("The deployment reference."),
    region: s.nullableString("The deployment region."),
    isDefault: s.boolean("Whether this is the default deployment."),
    previewIdentifier: s.nullableString("The preview identifier."),
    dashboardEditConfirmation: s.nullableBoolean("Whether dashboard edits are confirmed."),
    lastDeployTime: s.nullableInteger("The last deploy timestamp."),
  },
  { description: "A Convex deployment." },
);

const deployKeySchema = s.looseObject(
  {
    name: s.string("The deploy key name."),
    creationTime: s.integer("The key creation timestamp."),
    creator: s.integer("The creator user ID."),
    lastUsedTime: s.nullableInteger("The last-used timestamp."),
  },
  { description: "A Convex deploy key summary." },
);

const functionResultSchema = s.object(
  {
    status: s.stringEnum(["success", "error"], { description: "The function execution status." }),
    value: s.unknown("The returned function value."),
    logLines: s.stringArray("Log lines produced by the function."),
    errorMessage: s.string("The function error message."),
    errorData: s.unknown("Structured function error data."),
  },
  { required: ["status"], optional: ["value", "logLines", "errorMessage", "errorData"] },
);

const functionCallProperties = {
  path: nonEmpty("The Convex function path."),
  args: argsSchema,
  format: s.literal("json", { description: "Request JSON result format." }),
};

export const convexActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_token_details",
    description: "Return the current Convex token details so you can discover the authorized team or project context.",
    requiredScopes: ["convex.token.read"],
    inputSchema: s.object({}),
    outputSchema: s.object({ token: tokenDetailsSchema }, { required: ["token"] }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List all Convex projects for a team.",
    requiredScopes: ["convex.projects.read"],
    inputSchema: s.object({ team_id: positiveId("The Convex team ID.") }, { required: ["team_id"] }),
    outputSchema: s.object({ projects: s.array("The Convex projects.", projectSchema) }, { required: ["projects"] }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a Convex project on a team, optionally provisioning an initial dev or prod deployment.",
    requiredScopes: ["convex.projects.write"],
    inputSchema: s.object(
      {
        team_id: positiveId("The Convex team ID."),
        projectName: nonEmpty("The project name."),
        deploymentType: s.stringEnum(["dev", "prod"], { description: "The initial deployment type." }),
        deploymentClass: nonEmpty("The deployment class."),
        deploymentRegion: nonEmpty("The deployment region."),
      },
      { required: ["team_id", "projectName"], optional: ["deploymentType", "deploymentClass", "deploymentRegion"] },
    ),
    outputSchema: s.looseObject(
      {
        projectId: s.integer("The created project ID."),
        deploymentName: s.nullableString("The created deployment name."),
        deploymentUrl: s.nullableString("The created deployment URL."),
      },
      { description: "The Convex create project response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_project_by_id",
    description: "Get a Convex project by numeric project ID.",
    requiredScopes: ["convex.projects.read"],
    inputSchema: s.object({ project_id: positiveId("The Convex project ID.") }, { required: ["project_id"] }),
    outputSchema: s.object({ project: projectSchema }, { required: ["project"] }),
  }),
  defineProviderAction(service, {
    name: "get_project_by_slug",
    description: "Get a Convex project by team identifier or slug plus project slug.",
    requiredScopes: ["convex.projects.read"],
    inputSchema: s.object(
      {
        team_id_or_slug: nonEmpty("The Convex team ID or slug."),
        project_slug: nonEmpty("The project slug."),
      },
      { required: ["team_id_or_slug", "project_slug"] },
    ),
    outputSchema: s.object({ project: projectSchema }, { required: ["project"] }),
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete a Convex project and all of its deployments.",
    requiredScopes: ["convex.projects.write"],
    inputSchema: s.object({ project_id: positiveId("The Convex project ID.") }, { required: ["project_id"] }),
    outputSchema: s.object({ success: s.boolean("Whether the delete request succeeded.") }, { required: ["success"] }),
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    description: "List deployments for a Convex project.",
    requiredScopes: ["convex.deployments.read"],
    inputSchema: s.object(
      {
        project_id: positiveId("The Convex project ID."),
        includeLocal: s.boolean("Whether to include local deployments."),
        isDefault: s.boolean("Whether to filter to default deployments."),
        deploymentType: s.stringEnum(["dev", "prod", "preview"], { description: "Deployment type filter." }),
      },
      { required: ["project_id"], optional: ["includeLocal", "isDefault", "deploymentType"] },
    ),
    outputSchema: s.object(
      { deployments: s.array("The Convex deployments.", deploymentSchema) },
      { required: ["deployments"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    description: "Get a cloud deployment by deployment name.",
    requiredScopes: ["convex.deployments.read"],
    inputSchema: s.object({ deployment_name: nonEmpty("The deployment name.") }, { required: ["deployment_name"] }),
    outputSchema: s.object({ deployment: deploymentSchema }, { required: ["deployment"] }),
  }),
  defineProviderAction(service, {
    name: "create_deployment",
    description: "Create a new deployment in a Convex project.",
    requiredScopes: ["convex.deployments.write"],
    inputSchema: s.object(
      {
        project_id: positiveId("The Convex project ID."),
        type: s.stringEnum(["dev", "prod", "preview"], { description: "Deployment type." }),
        class: nonEmpty("The deployment class."),
        region: nonEmpty("The deployment region."),
        reference: nonEmpty("The deployment reference."),
        isDefault: s.boolean("Whether this deployment should be default."),
        expiresAt: s.nullableInteger("Optional expiration timestamp."),
      },
      { required: ["project_id", "type"], optional: ["class", "region", "reference", "isDefault", "expiresAt"] },
    ),
    outputSchema: s.object({ deployment: deploymentSchema }, { required: ["deployment"] }),
  }),
  defineProviderAction(service, {
    name: "update_deployment",
    description: "Update mutable Convex deployment properties.",
    requiredScopes: ["convex.deployments.write"],
    inputSchema: s.object(
      {
        deployment_name: nonEmpty("The deployment name."),
        reference: s.nullableString("The deployment reference."),
        dashboard_edit_confirmation: s.nullableBoolean("Whether dashboard edits are confirmed."),
        expiresAt: s.nullableInteger("Optional expiration timestamp."),
      },
      {
        required: ["deployment_name"],
        optional: ["reference", "dashboard_edit_confirmation", "expiresAt"],
      },
    ),
    outputSchema: s.object({ success: s.boolean("Whether the update request succeeded.") }, { required: ["success"] }),
  }),
  defineProviderAction(service, {
    name: "delete_deployment",
    description: "Delete a Convex deployment and all of its data.",
    requiredScopes: ["convex.deployments.write"],
    inputSchema: s.object({ deployment_name: nonEmpty("The deployment name.") }, { required: ["deployment_name"] }),
    outputSchema: s.object({ success: s.boolean("Whether the delete request succeeded.") }, { required: ["success"] }),
  }),
  defineProviderAction(service, {
    name: "list_deployment_classes",
    description: "List available deployment classes for a Convex team.",
    requiredScopes: ["convex.projects.read"],
    inputSchema: s.object({ team_id: positiveId("The Convex team ID.") }, { required: ["team_id"] }),
    outputSchema: s.object(
      { items: s.array("Available deployment classes.", s.looseObject({ type: s.string(), available: s.boolean() })) },
      { required: ["items"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_deployment_regions",
    description: "List available deployment regions for a Convex team.",
    requiredScopes: ["convex.projects.read"],
    inputSchema: s.object({ team_id: positiveId("The Convex team ID.") }, { required: ["team_id"] }),
    outputSchema: s.object(
      {
        items: s.array(
          "Available deployment regions.",
          s.looseObject({ name: s.string(), displayName: s.string(), available: s.boolean() }),
        ),
      },
      { required: ["items"] },
    ),
  }),
  defineProviderAction(service, {
    name: "create_deploy_key",
    description: "Create a deploy key for a Convex deployment.",
    requiredScopes: ["convex.deploy_keys.write"],
    inputSchema: s.object(
      { deployment_name: nonEmpty("The deployment name."), name: nonEmpty("The deploy key name.") },
      { required: ["deployment_name", "name"] },
    ),
    outputSchema: s.object({ deployKey: s.nonEmptyString("The created deploy key.") }, { required: ["deployKey"] }),
  }),
  defineProviderAction(service, {
    name: "list_deploy_keys",
    description: "List deploy keys for a Convex deployment.",
    requiredScopes: ["convex.deploy_keys.read"],
    inputSchema: s.object({ deployment_name: nonEmpty("The deployment name.") }, { required: ["deployment_name"] }),
    outputSchema: s.object({ deployKeys: s.array("Deploy keys.", deployKeySchema) }, { required: ["deployKeys"] }),
  }),
  defineProviderAction(service, {
    name: "delete_deploy_key",
    description: "Delete a deploy key for a Convex deployment.",
    requiredScopes: ["convex.deploy_keys.write"],
    inputSchema: s.object(
      { deployment_name: nonEmpty("The deployment name."), id: nonEmpty("The deploy key ID.") },
      { required: ["deployment_name", "id"] },
    ),
    outputSchema: s.object({ success: s.boolean("Whether the delete request succeeded.") }, { required: ["success"] }),
  }),
  defineProviderAction(service, {
    name: "list_custom_domains",
    description: "List custom domains configured for a Convex deployment.",
    requiredScopes: ["convex.custom_domains.read"],
    inputSchema: s.object({ deployment_name: nonEmpty("The deployment name.") }, { required: ["deployment_name"] }),
    outputSchema: s.object(
      {
        customDomains: s.array(
          "Custom domains.",
          s.looseObject({
            domain: s.string(),
            deploymentName: s.string(),
            requestDestination: s.string(),
          }),
        ),
      },
      { required: ["customDomains"] },
    ),
  }),
  defineProviderAction(service, {
    name: "delete_custom_domain",
    description: "Remove a custom domain from a Convex deployment.",
    requiredScopes: ["convex.custom_domains.write"],
    inputSchema: s.object(
      { deployment_name: nonEmpty("The deployment name."), domain: nonEmpty("The custom domain.") },
      { required: ["deployment_name", "domain"] },
    ),
    outputSchema: s.object({ success: s.boolean("Whether the delete request succeeded.") }, { required: ["success"] }),
  }),
  ...functionActions(),
];

function functionActions(): ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "run_query",
      description: "Execute a Convex query through the deployment HTTP API.",
      requiredScopes: ["convex.http.query"],
      inputSchema: functionInput("query"),
      outputSchema: s.object({ result: functionResultSchema }, { required: ["result"] }),
    }),
    defineProviderAction(service, {
      name: "run_mutation",
      description: "Execute a Convex mutation through the deployment HTTP API.",
      requiredScopes: ["convex.http.mutation"],
      inputSchema: functionInput("mutation"),
      outputSchema: s.object({ result: functionResultSchema }, { required: ["result"] }),
    }),
    defineProviderAction(service, {
      name: "run_action",
      description: "Execute a Convex action through the deployment HTTP API.",
      requiredScopes: ["convex.http.action"],
      inputSchema: functionInput("action"),
      outputSchema: s.object({ result: functionResultSchema }, { required: ["result"] }),
    }),
    defineProviderAction(service, {
      name: "run_function",
      description: "Execute an arbitrary Convex function through `/api/run/{functionIdentifier}`.",
      requiredScopes: ["convex.http.run"],
      inputSchema: s.object(
        {
          functionIdentifier: nonEmpty("The slash or colon separated function identifier."),
          args: argsSchema,
          format: s.literal("json"),
          deployment_url: nonEmpty("The hosted *.convex.cloud deployment URL or deployment name prefix."),
        },
        { required: ["functionIdentifier"], optional: ["args", "format", "deployment_url"] },
      ),
      outputSchema: s.object({ result: functionResultSchema }, { required: ["result"] }),
    }),
    defineProviderAction(service, {
      name: "execute_query_batch",
      description: "Execute multiple Convex queries against a deployment and return results in the same order.",
      requiredScopes: ["convex.http.query"],
      inputSchema: s.object(
        {
          queries: s.array(
            "Convex query calls.",
            s.object(functionCallProperties, { required: ["path"], optional: ["args", "format"] }),
            {
              minItems: 1,
            },
          ),
          deployment_url: nonEmpty("The hosted *.convex.cloud deployment URL or deployment name prefix."),
        },
        { required: ["queries"], optional: ["deployment_url"] },
      ),
      outputSchema: s.object(
        { results: s.array("Convex query results.", functionResultSchema) },
        { required: ["results"] },
      ),
    }),
  ];
}

function functionInput(kind: string) {
  return s.object(
    {
      ...functionCallProperties,
      deployment_url: nonEmpty(`The hosted *.convex.cloud deployment URL or deployment name prefix for the ${kind}.`),
    },
    { required: ["path"], optional: ["args", "format", "deployment_url"] },
  );
}
