import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dokploy";

const idSchema = (description: string) => s.nonEmptyString(description);

const projectSchema = s.looseObject(
  "A Dokploy project. Additional fields may be present based on the caller's permissions and Dokploy version.",
  {
    projectId: idSchema("The project identifier."),
    name: s.string("The project name."),
    description: s.nullableString("The project description."),
    organizationId: s.string("The organization identifier."),
    createdAt: s.dateTime("When the project was created."),
  },
);

const applicationSchema = s.looseObject(
  "A Dokploy application. Additional fields may be present based on the caller's permissions and Dokploy version.",
  {
    applicationId: idSchema("The application identifier."),
    name: s.string("The application display name."),
    appName: s.string("The application runtime name."),
    description: s.nullableString("The application description."),
    environmentId: s.string("The environment identifier."),
    applicationStatus: s.nullableString("The current application status."),
    sourceType: s.nullableString("The configured source type."),
    createdAt: s.dateTime("When the application was created."),
  },
);

const deploymentSchema = s.looseObject(
  "A Dokploy deployment record. Additional fields may be present based on the Dokploy version.",
  {
    deploymentId: idSchema("The deployment identifier."),
    title: s.string("The deployment title."),
    description: s.nullableString("The deployment description."),
    status: s.nullableString("The deployment status."),
    applicationId: s.nullableString("The deployed application identifier."),
    createdAt: s.dateTime("When the deployment was created."),
    startedAt: s.nullableString("When the deployment started."),
    finishedAt: s.nullableString("When the deployment finished."),
    errorMessage: s.nullableString("The deployment error message, when present."),
  },
);

const paginationFields = {
  limit: s.integer({ description: "The maximum number of results to return.", minimum: 1, maximum: 100, default: 20 }),
  offset: s.integer({ description: "The zero-based result offset.", minimum: 0, default: 0 }),
};

const searchProjectsAction = defineProviderAction(service, {
  name: "search_projects",
  description: "Search projects visible to the connected Dokploy account.",
  inputSchema: s.object(
    "Filters and pagination for the project search.",
    {
      query: s.string("Text matched against project names and descriptions."),
      name: s.string("Text matched against project names."),
      description: s.string("Text matched against project descriptions."),
      ...paginationFields,
    },
    { optional: ["query", "name", "description", "limit", "offset"] },
  ),
  outputSchema: s.object("A page of matching Dokploy projects.", {
    projects: s.array("The matching projects.", projectSchema),
    total: s.nonNegativeInteger("The total number of matching projects."),
  }),
});

const getProjectAction = defineProviderAction(service, {
  name: "get_project",
  description: "Get one Dokploy project and its accessible environments and services.",
  inputSchema: s.object("The project lookup input.", {
    projectId: idSchema("The Dokploy project identifier."),
  }),
  outputSchema: projectSchema,
});

const searchApplicationsAction = defineProviderAction(service, {
  name: "search_applications",
  description: "Search applications visible to the connected Dokploy account.",
  inputSchema: s.object(
    "Filters and pagination for the application search.",
    {
      query: s.string("Text matched across application name, description, repository, owner, and image fields."),
      name: s.string("Text matched against application display names."),
      appName: s.string("Text matched against application runtime names."),
      description: s.string("Text matched against application descriptions."),
      repository: s.string("Text matched against repository names."),
      owner: s.string("Text matched against repository owners."),
      dockerImage: s.string("Text matched against Docker image names."),
      projectId: idSchema("Only return applications in this project."),
      environmentId: idSchema("Only return applications in this environment."),
      ...paginationFields,
    },
    {
      optional: [
        "query",
        "name",
        "appName",
        "description",
        "repository",
        "owner",
        "dockerImage",
        "projectId",
        "environmentId",
        "limit",
        "offset",
      ],
    },
  ),
  outputSchema: s.object("A page of matching Dokploy applications.", {
    applications: s.array("The matching applications.", applicationSchema),
    total: s.nonNegativeInteger("The total number of matching applications."),
  }),
});

const getApplicationAction = defineProviderAction(service, {
  name: "get_application",
  description: "Get configuration and status details for one Dokploy application.",
  inputSchema: s.object("The application lookup input.", {
    applicationId: idSchema("The Dokploy application identifier."),
  }),
  outputSchema: applicationSchema,
});

const listDeploymentsAction = defineProviderAction(service, {
  name: "list_application_deployments",
  description: "List deployment history for one Dokploy application.",
  inputSchema: s.object("The deployment history input.", {
    applicationId: idSchema("The Dokploy application identifier."),
  }),
  outputSchema: s.object("Deployment history for the application.", {
    deployments: s.array(
      "The application's deployments, newest first when returned that way by Dokploy.",
      deploymentSchema,
    ),
  }),
});

const deployApplicationAction = defineProviderAction(service, {
  name: "deploy_application",
  description: "Queue a deployment for one Dokploy application.",
  inputSchema: s.object(
    "The application deployment request.",
    {
      applicationId: idSchema("The Dokploy application identifier."),
      title: s.string("An optional title for the deployment record."),
      description: s.string("An optional description for the deployment record."),
    },
    { optional: ["title", "description"] },
  ),
  outputSchema: s.object("Confirmation that Dokploy accepted the deployment request.", {
    accepted: s.boolean("Whether Dokploy accepted the deployment request."),
  }),
  followUpActions: [`${service}.list_application_deployments`],
});

export const dokployActions: readonly ActionDefinition[] = [
  searchProjectsAction,
  getProjectAction,
  searchApplicationsAction,
  getApplicationAction,
  listDeploymentsAction,
  deployApplicationAction,
] as const;

export type DokployActionName =
  | "search_projects"
  | "get_project"
  | "search_applications"
  | "get_application"
  | "list_application_deployments"
  | "deploy_application";
