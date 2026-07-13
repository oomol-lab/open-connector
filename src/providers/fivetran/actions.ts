import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fivetran";

const paginationInputProperties = {
  cursor: s.nonEmptyString("Opaque cursor returned as nextCursor by a previous Fivetran list action."),
  limit: s.integer("Number of records to return. Fivetran accepts values from 1 through 1000 and defaults to 100.", {
    minimum: 1,
    maximum: 1000,
  }),
};

const setupTestSchema = s.looseRequiredObject(
  "A Fivetran setup test result.",
  {
    title: s.string("Human-readable name of the setup test step."),
    status: s.stringEnum("Result of the setup test step.", ["PASSED", "SKIPPED", "WARNING", "FAILED", "JOB_FAILED"]),
    message: s.string("Human-readable result message for the setup test step."),
    details: s.unknown("Additional diagnostic information supplied by Fivetran."),
  },
  { optional: ["message", "details"] },
);

const projectSummaryProperties = {
  id: s.string("Unique Fivetran transformation project identifier."),
  type: s.stringEnum("Transformation project type.", ["DBT_CORE"]),
  created_at: s.dateTime("Time when the transformation project was created."),
  created_by_id: s.string("Identifier of the user or system key that created the project."),
  group_id: s.string("Identifier of the Fivetran group targeted by the project."),
};

const transformationProjectSummarySchema = s.object(
  "A Fivetran transformation project summary.",
  projectSummaryProperties,
  { required: [], additionalProperties: true },
);

const transformationProjectSchema = s.object(
  "Detailed Fivetran transformation project information.",
  {
    ...projectSummaryProperties,
    status: s.stringEnum("Current transformation project status.", ["NOT_READY", "READY", "ERROR"]),
    errors: s.stringArray("Errors reported while processing or setting up the project."),
    setup_tests: s.array("Results from the latest project setup tests.", setupTestSchema),
    project_config: s.looseObject("dbt Core project configuration returned by Fivetran.", {
      dbt_version: s.string("dbt version configured for the project."),
      default_schema: s.string("Default destination schema."),
      git_remote_url: s.string("Git remote URL containing the dbt project."),
      folder_path: s.string("Path to the dbt project within the repository."),
      git_branch: s.string("Git branch used by the dbt project."),
      threads: s.integer("Number of dbt execution threads."),
      target_name: s.string("Default dbt target name."),
      environment_vars: s.stringArray("Environment variables configured for the dbt project."),
      public_key: s.string("Public key used to grant Fivetran SSH access to the Git repository."),
    }),
  },
  { required: [], additionalProperties: true },
);

const logAlertSchema = s.object(
  "An issue reported for a Fivetran log service.",
  {
    code: s.string("Provider-defined alert code."),
    message: s.string("Human-readable description of the issue."),
    details: s.string("Additional context for the alert."),
  },
  { required: [], additionalProperties: true },
);

const logStatusSchema = s.object(
  "Current Fivetran log service setup status.",
  {
    setup_state: s.stringEnum("Current log service setup state.", ["connected", "broken", "incomplete"]),
    tasks: s.array("Alerts describing log service configuration issues.", logAlertSchema),
  },
  { required: [], additionalProperties: true },
);

const logServiceSchema = s.looseRequiredObject(
  "A Fivetran external log service.",
  {
    id: s.string("Unique Fivetran log service identifier."),
    service: s.string(
      "Fivetran log service type, such as cloudwatch, datadog_log, grafana_loki, splunkLog, or stackdriver.",
    ),
    enabled: s.boolean("Whether the log service is enabled."),
    status: logStatusSchema,
    setup_tests: s.array("Results from the most recent setup test run.", setupTestSchema),
    config: s.looseObject("Service-specific logging configuration returned by Fivetran."),
  },
  { optional: ["status", "setup_tests", "config"] },
);

const hybridDeploymentUsageSchema = s.looseRequiredObject("A connection using a hybrid deployment agent.", {
  schema: s.string("Connection name and source schema name within the Fivetran group."),
  service: s.string("Fivetran connector type name."),
  connection_id: s.string("Unique Fivetran connection identifier."),
});

const hybridDeploymentAgentSchema = s.looseRequiredObject(
  "A Fivetran hybrid deployment agent and its current usage.",
  {
    id: s.string("Unique Fivetran hybrid deployment agent identifier."),
    version: s.string("Installed hybrid deployment agent version."),
    enabled: s.boolean("Whether the hybrid deployment agent is enabled."),
    online: s.boolean("Whether the hybrid deployment agent is online."),
    display_name: s.string("Display name of the hybrid deployment agent."),
    group_id: s.string("Fivetran group associated with the agent."),
    registered_at: s.dateTime("Time when the agent was registered."),
    created_by: s.string("Actor that created the agent."),
    deployment_type: s.stringEnum("Agent runtime environment.", ["DOCKER", "PODMAN", "KUBERNETES", "SNOWPARK"]),
    updated_at: s.dateTime("Time when the agent was last updated."),
    last_used_at: s.dateTime("Time when the agent was last used."),
    usage: s.array("Connections currently using the hybrid deployment agent.", hybridDeploymentUsageSchema),
  },
  { optional: ["usage"] },
);

function listInputSchema(description: string, extraProperties: Record<string, JsonSchema> = {}): JsonSchema {
  return s.object(
    description,
    {
      ...paginationInputProperties,
      ...extraProperties,
    },
    { optional: Object.keys({ ...paginationInputProperties, ...extraProperties }) },
  );
}

export const fivetranActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_transformation_projects",
    description: "List transformation projects accessible to the configured Fivetran API key.",
    inputSchema: listInputSchema("Pagination parameters for listing Fivetran transformation projects."),
    outputSchema: s.object("A page of Fivetran transformation projects.", {
      projects: s.array("Transformation projects returned for this page.", transformationProjectSummarySchema),
      nextCursor: s.nullableString("Cursor for the next page, or null when there is no next page."),
    }),
    followUpActions: ["fivetran.get_transformation_project"],
  }),
  defineProviderAction(service, {
    name: "get_transformation_project",
    description: "Retrieve detailed information for one Fivetran transformation project.",
    inputSchema: s.requiredObject("Identifier of the Fivetran transformation project to retrieve.", {
      projectId: s.nonEmptyString("Unique Fivetran transformation project identifier."),
    }),
    outputSchema: s.object("A Fivetran transformation project result.", {
      project: transformationProjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_log_services",
    description: "List external log services accessible within the configured Fivetran account.",
    inputSchema: listInputSchema("Pagination parameters for listing Fivetran external log services."),
    outputSchema: s.object("A page of Fivetran external log services.", {
      logServices: s.array("External log services returned for this page.", logServiceSchema),
      nextCursor: s.nullableString("Cursor for the next page, or null when there is no next page."),
    }),
    followUpActions: ["fivetran.get_log_service"],
  }),
  defineProviderAction(service, {
    name: "get_log_service",
    description: "Retrieve detailed information for one group-level Fivetran external log service.",
    inputSchema: s.requiredObject("Identifier of the Fivetran log service to retrieve.", {
      logId: s.nonEmptyString("Unique Fivetran log service identifier."),
    }),
    outputSchema: s.object("A Fivetran external log service result.", {
      logService: logServiceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_hybrid_deployment_agents",
    description: "List Fivetran hybrid deployment agents with their connection usage, optionally filtered by group.",
    inputSchema: listInputSchema("Filters and pagination for listing Fivetran hybrid deployment agents.", {
      groupId: s.nonEmptyString("Return agents associated with this Fivetran group only."),
    }),
    outputSchema: s.object("A page of Fivetran hybrid deployment agents.", {
      agents: s.array("Hybrid deployment agents returned for this page.", hybridDeploymentAgentSchema),
      nextCursor: s.nullableString("Cursor for the next page, or null when there is no next page."),
    }),
    followUpActions: ["fivetran.get_hybrid_deployment_agent"],
  }),
  defineProviderAction(service, {
    name: "get_hybrid_deployment_agent",
    description: "Retrieve details and current connection usage for one Fivetran hybrid deployment agent.",
    inputSchema: s.requiredObject("Identifier of the Fivetran hybrid deployment agent to retrieve.", {
      agentId: s.nonEmptyString("Unique Fivetran hybrid deployment agent identifier."),
    }),
    outputSchema: s.object("A Fivetran hybrid deployment agent result.", {
      agent: hybridDeploymentAgentSchema,
    }),
  }),
];
