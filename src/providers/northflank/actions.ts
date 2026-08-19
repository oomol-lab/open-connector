import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "northflank";

function trimmedString(description: string): JsonSchema {
  return s.string(description, { minLength: 1 });
}

const paginationInputFields = {
  per_page: s.integer("The number of results to display per request. Maximum of 100.", {
    minimum: 1,
    maximum: 100,
  }),
  page: s.integer("The page number to access.", { minimum: 1 }),
  cursor: trimmedString("The cursor returned from the previous page of results."),
};

const paginationSchema = s.object(
  "Pagination metadata returned by Northflank.",
  {
    hasNextPage: s.boolean("Whether another page of results is available."),
    cursor: trimmedString("Cursor to use for the next page of results."),
    count: s.number("Number of results returned by this request."),
  },
  { required: ["hasNextPage", "count"], optional: ["cursor"] },
);

const projectSummarySchema = s.object(
  "Northflank project summary.",
  {
    id: trimmedString("Identifier for the project."),
    name: trimmedString("Project name."),
    description: s.string("Short project description."),
  },
  { required: ["id", "name"], optional: ["description"] },
);

const serviceStatusSchema = s.looseObject("Current service status returned by Northflank.", {
  build: s.looseObject("Build status information returned by Northflank.", {
    status: trimmedString("Current build status."),
    lastTransitionTime: s.dateTime("Timestamp when the build reached this status."),
  }),
  deployment: s.looseObject("Deployment status information returned by Northflank.", {
    status: trimmedString("Current deployment status."),
    reason: trimmedString("Reason the current deployment was started."),
    lastTransitionTime: s.dateTime("Timestamp when the deployment reached this status."),
  }),
});

const serviceSummarySchema = s.object(
  "Northflank service summary.",
  {
    id: trimmedString("Identifier for the service."),
    appId: trimmedString("Full identifier used for service deployment."),
    projectId: trimmedString("Identifier for the project that owns the service."),
    name: trimmedString("Service name."),
    description: s.string("Short service description."),
    serviceType: s.stringEnum("Type of service.", ["combined", "build", "deployment"]),
    tags: s.array("Tags attached to the service.", trimmedString("Service tag.")),
    disabledCI: s.boolean("Whether Continuous Integration is disabled."),
    disabledCD: s.boolean("Whether Continuous Deployment is disabled."),
    status: serviceStatusSchema,
  },
  {
    required: ["id", "appId", "projectId", "name", "serviceType", "disabledCI", "disabledCD"],
    optional: ["description", "tags", "status"],
  },
);

const projectServiceSummarySchema = s.object(
  "Northflank service summary embedded in a project detail response.",
  {
    id: trimmedString("Identifier for the service."),
    appId: trimmedString("Full identifier used for service deployment."),
    name: trimmedString("Service name."),
    description: s.string("Short service description."),
    serviceType: s.stringEnum("Type of service.", ["combined", "build", "deployment"]),
  },
  { required: ["id", "appId", "name", "serviceType"], optional: ["description"] },
);

const listProjectsInputSchema = s.object("Input parameters for listing Northflank projects.", paginationInputFields, {
  required: [],
  optional: ["per_page", "page", "cursor"],
});

const listProjectsOutputSchema = s.object(
  "Northflank projects list response.",
  {
    projects: s.array("Projects returned by Northflank.", projectSummarySchema),
    pagination: paginationSchema,
  },
  { required: ["projects", "pagination"] },
);

const getProjectInputSchema = s.object(
  "Input parameters for retrieving a Northflank project.",
  {
    projectId: trimmedString("ID of the project."),
  },
  { required: ["projectId"] },
);

const projectDetailSchema = s.looseRequiredObject(
  "Northflank project details.",
  {
    id: trimmedString("Identifier for the project."),
    name: trimmedString("Project name."),
    description: s.string("Short project description."),
    deployment: s.looseObject("Project deployment information returned by Northflank.", {
      region: trimmedString("Region where the project's resources are deployed."),
    }),
    createdAt: s.dateTime("Timestamp when the project was created."),
    services: s.array("Services belonging to the project.", projectServiceSummarySchema),
    jobs: s.array(
      "Jobs belonging to the project.",
      s.looseObject("Northflank job summary.", {
        id: trimmedString("Identifier for the job."),
        appId: trimmedString("Full identifier used for deployment."),
        name: trimmedString("Job name."),
        description: s.string("Short job description."),
        jobType: trimmedString("Type of the job."),
      }),
    ),
    addons: s.array(
      "Addons belonging to the project.",
      s.looseObject("Northflank addon summary.", {
        id: trimmedString("Identifier for the addon."),
        appId: trimmedString("Full identifier used for deployment."),
        name: trimmedString("Addon name."),
        description: s.string("Short addon description."),
        spec: s.looseObject("Addon specification returned by Northflank."),
      }),
    ),
    customRegistry: s.looseObject("Custom registry information returned by Northflank."),
    cluster: s.looseObject("Cluster information returned by Northflank."),
  },
  {
    optional: ["description", "deployment", "services", "jobs", "addons", "customRegistry", "cluster"],
  },
);

const getProjectOutputSchema = s.object(
  "Northflank project detail response.",
  {
    project: projectDetailSchema,
  },
  { required: ["project"] },
);

const listServicesInputSchema = s.object(
  "Input parameters for listing Northflank services in a project.",
  {
    projectId: trimmedString("ID of the project."),
    ...paginationInputFields,
  },
  { required: ["projectId"], optional: ["per_page", "page", "cursor"] },
);

const listServicesOutputSchema = s.object(
  "Northflank services list response.",
  {
    services: s.array("Services returned by Northflank.", serviceSummarySchema),
    pagination: paginationSchema,
  },
  { required: ["services", "pagination"] },
);

const getServiceInputSchema = s.object(
  "Input parameters for retrieving a Northflank service.",
  {
    projectId: trimmedString("ID of the project."),
    serviceId: trimmedString("ID of the service."),
  },
  { required: ["projectId", "serviceId"] },
);

const getServiceOutputSchema = s.object(
  "Northflank service detail response.",
  {
    service: s.looseRequiredObject(
      "Northflank service details.",
      {
        id: trimmedString("Identifier for the service."),
        appId: trimmedString("Full identifier used for service deployment."),
        name: trimmedString("Service name."),
        projectId: trimmedString("Identifier for the project that owns the service."),
        serviceType: s.stringEnum("Type of service.", ["combined", "build", "deployment"]),
        createdAt: s.dateTime("Timestamp when the service was created."),
        description: s.string("Short service description."),
        tags: s.array("Tags attached to the service.", trimmedString("Service tag.")),
        disabledCI: s.boolean("Whether Continuous Integration is disabled."),
        disabledCD: s.boolean("Whether Continuous Deployment is disabled."),
        servicePaused: s.boolean("Whether the service is paused."),
        buildSource: trimmedString("Build source for the service."),
        status: serviceStatusSchema,
        billing: s.looseObject("Billing configuration returned by Northflank."),
        deployment: s.looseObject("Deployment configuration returned by Northflank."),
        ports: s.array("Service ports returned by Northflank.", s.looseObject("Northflank port.")),
        buildConfiguration: s.looseObject("Build configuration returned by Northflank."),
        buildEngineConfiguration: s.looseObject("Build engine configuration returned by Northflank."),
        autoscaling: s.looseObject("Autoscaling configuration returned by Northflank."),
        loadBalancing: s.looseObject("Load balancing configuration returned by Northflank."),
        cluster: s.looseObject("Cluster information returned by Northflank."),
      },
      {
        optional: [
          "description",
          "tags",
          "servicePaused",
          "buildSource",
          "status",
          "billing",
          "deployment",
          "ports",
          "buildConfiguration",
          "buildEngineConfiguration",
          "autoscaling",
          "loadBalancing",
          "cluster",
        ],
      },
    ),
  },
  { required: ["service"] },
);

export const northflankActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Northflank projects available to the authenticated token.",
    inputSchema: listProjectsInputSchema,
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve details for a Northflank project.",
    inputSchema: getProjectInputSchema,
    outputSchema: getProjectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_services",
    description: "List Northflank services in a project.",
    inputSchema: listServicesInputSchema,
    outputSchema: listServicesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_service",
    description: "Retrieve details for a Northflank service.",
    inputSchema: getServiceInputSchema,
    outputSchema: getServiceOutputSchema,
  }),
];
