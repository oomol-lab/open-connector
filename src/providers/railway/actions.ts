import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "railway" as const;

const id = (description: string) => s.nonEmptyString(description);

const serviceSummary = s.object(
  "A Railway service.",
  {
    id: id("Railway service ID."),
    name: s.nonEmptyString("Service name."),
    icon: s.nullableString("Service icon URL or identifier."),
  },
  { required: ["id", "name"], optional: ["icon"] },
);

const environmentSummary = s.object("A Railway environment.", {
  id: id("Railway environment ID."),
  name: s.nonEmptyString("Environment name."),
});

const projectSummary = s.object(
  "A Railway project.",
  {
    id: id("Railway project ID."),
    name: s.nonEmptyString("Project name."),
    description: s.nullableString("Project description."),
    createdAt: s.dateTime("When the project was created."),
    updatedAt: s.dateTime("When the project was last updated."),
  },
  { required: ["id", "name"], optional: ["description", "createdAt", "updatedAt"] },
);

const deploymentSummary = s.object(
  "A Railway deployment.",
  {
    id: id("Railway deployment ID."),
    status: s.nonEmptyString("Current Railway deployment status."),
    createdAt: s.dateTime("When the deployment was created."),
    url: s.nullableString("Deployment URL."),
    staticUrl: s.nullableString("Static deployment URL."),
  },
  { required: ["id", "status"], optional: ["createdAt", "url", "staticUrl"] },
);

const deploymentDetail = s.object(
  "Detailed Railway deployment information.",
  {
    id: id("Railway deployment ID."),
    status: s.nonEmptyString("Current Railway deployment status."),
    createdAt: s.dateTime("When the deployment was created."),
    url: s.nullableString("Deployment URL."),
    staticUrl: s.nullableString("Static deployment URL."),
    canRedeploy: s.boolean("Whether Railway allows this deployment to be redeployed."),
    canRollback: s.boolean("Whether Railway allows a rollback to this deployment."),
    meta: s.nullable(s.unknownObject("Provider-defined deployment metadata.")),
  },
  {
    required: ["id", "status"],
    optional: ["createdAt", "url", "staticUrl", "canRedeploy", "canRollback", "meta"],
  },
);

const deploymentTargetFields = {
  projectId: id("Railway project ID."),
  serviceId: id("Railway service ID."),
  environmentId: id("Railway environment ID."),
};

type RailwayActionDefinitions = readonly [
  ProviderActionDefinition<"list_projects">,
  ProviderActionDefinition<"get_project">,
  ProviderActionDefinition<"get_service_instance">,
  ProviderActionDefinition<"list_deployments">,
  ProviderActionDefinition<"get_deployment">,
  ProviderActionDefinition<"get_deployment_logs">,
  ProviderActionDefinition<"deploy_service">,
  ProviderActionDefinition<"upsert_variable">,
  ProviderActionDefinition<"rollback_deployment">,
];

export type RailwayActionName = RailwayActionDefinitions[number]["name"];

export const railwayActions: RailwayActionDefinitions = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Railway projects available to the configured account or workspace token.",
    inputSchema: s.object("Input for listing Railway projects.", {}),
    outputSchema: s.object("Railway projects available to the token.", {
      projects: s.array(projectSummary, { description: "Railway projects." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a Railway project together with its services and environments.",
    inputSchema: s.object("Input for retrieving a Railway project.", {
      projectId: id("Railway project ID."),
    }),
    outputSchema: s.object("A Railway project with related resources.", {
      project: s.object(
        "Railway project details.",
        {
          id: id("Railway project ID."),
          name: s.nonEmptyString("Project name."),
          description: s.nullableString("Project description."),
          createdAt: s.dateTime("When the project was created."),
          services: s.array(serviceSummary, { description: "Services in the project." }),
          environments: s.array(environmentSummary, { description: "Environments in the project." }),
        },
        { required: ["id", "name", "services", "environments"], optional: ["description", "createdAt"] },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_service_instance",
    description: "Get Railway service configuration and its latest deployment in one environment.",
    inputSchema: s.object("Input for retrieving a Railway service instance.", {
      serviceId: id("Railway service ID."),
      environmentId: id("Railway environment ID."),
    }),
    outputSchema: s.object("Railway service instance configuration.", {
      serviceInstance: s.looseRequiredObject(
        "A Railway service instance.",
        {
          id: id("Railway service instance ID."),
          serviceName: s.nonEmptyString("Service name."),
          startCommand: s.nullableString("Configured start command."),
          buildCommand: s.nullableString("Configured build command."),
          rootDirectory: s.nullableString("Configured repository root directory."),
          healthcheckPath: s.nullableString("Configured health check path."),
          region: s.nullableString("Deployment region."),
          numReplicas: s.nullableInteger("Configured replica count."),
          restartPolicyType: s.nullableString("Restart policy type."),
          restartPolicyMaxRetries: s.nullableInteger("Maximum restart attempts."),
          latestDeployment: s.nullable(deploymentSummary),
        },
        {
          optional: [
            "startCommand",
            "buildCommand",
            "rootDirectory",
            "healthcheckPath",
            "region",
            "numReplicas",
            "restartPolicyType",
            "restartPolicyMaxRetries",
            "latestDeployment",
          ],
        },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_deployments",
    description: "List recent Railway deployments for a service and environment.",
    inputSchema: s.object(
      "Filters for Railway deployments.",
      {
        ...deploymentTargetFields,
        limit: s.integer("Maximum number of deployments to return.", { minimum: 1, maximum: 100, default: 20 }),
      },
      { required: ["projectId", "serviceId", "environmentId"], optional: ["limit"] },
    ),
    outputSchema: s.object("Recent Railway deployments.", {
      deployments: s.array(deploymentSummary, { description: "Railway deployments ordered by the provider." }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_deployment",
    description: "Get one Railway deployment and its redeploy and rollback capabilities.",
    inputSchema: s.object("Input for retrieving a Railway deployment.", {
      deploymentId: id("Railway deployment ID."),
    }),
    outputSchema: s.object("A Railway deployment.", { deployment: deploymentDetail }),
  }),
  defineProviderAction(service, {
    name: "get_deployment_logs",
    description: "Read runtime logs for a Railway deployment with optional text and time filters.",
    inputSchema: s.object(
      "Filters for Railway deployment logs.",
      {
        deploymentId: id("Railway deployment ID."),
        limit: s.integer("Maximum number of log entries to return.", { minimum: 1, maximum: 5000, default: 500 }),
        filter: s.nonEmptyString("Railway log filter expression."),
        startDate: s.dateTime("Start of the log time range."),
        endDate: s.dateTime("End of the log time range."),
      },
      { required: ["deploymentId"], optional: ["limit", "filter", "startDate", "endDate"] },
    ),
    outputSchema: s.object("Runtime log entries for a Railway deployment.", {
      logs: s.array(
        s.object(
          "A Railway runtime log entry.",
          {
            timestamp: s.nonEmptyString("Provider timestamp for the log entry."),
            message: s.string("Log message."),
            severity: s.nullableString("Log severity."),
          },
          { required: ["timestamp", "message"], optional: ["severity"] },
        ),
        { description: "Railway runtime log entries." },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "deploy_service",
    description: "Trigger a Railway deployment for a service, optionally at a specific connected-repository commit.",
    inputSchema: s.object(
      "Input for deploying a Railway service.",
      {
        serviceId: id("Railway service ID."),
        environmentId: id("Railway environment ID."),
        commitSha: s.nonEmptyString("Commit SHA from the repository connected to the Railway service."),
      },
      { required: ["serviceId", "environmentId"], optional: ["commitSha"] },
    ),
    outputSchema: s.object("The triggered Railway deployment.", {
      deploymentId: id("Railway deployment ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_variable",
    description: "Create or update one Railway variable for an environment or service.",
    inputSchema: s.object(
      "Input for creating or updating a Railway variable.",
      {
        ...deploymentTargetFields,
        name: s.string({
          minLength: 1,
          maxLength: 255,
          pattern: "^[A-Za-z_][A-Za-z0-9_]*$",
          description: "Variable name.",
        }),
        value: s.string("Variable value. This may contain a Railway variable reference."),
        skipDeploys: s.boolean("Do not automatically redeploy after updating the variable."),
      },
      { required: ["projectId", "environmentId", "name", "value"], optional: ["serviceId", "skipDeploys"] },
    ),
    outputSchema: s.object("Result of updating a Railway variable.", {
      updated: s.boolean("Whether Railway accepted the variable update."),
    }),
  }),
  defineProviderAction(service, {
    name: "rollback_deployment",
    description: "Roll a Railway service back to a deployment that Railway marks as rollback-capable.",
    inputSchema: s.object("Input for rolling back a Railway deployment.", {
      deploymentId: id("Rollback-capable Railway deployment ID."),
    }),
    outputSchema: s.object("The Railway deployment created by the rollback.", {
      deployment: deploymentSummary,
    }),
  }),
];
