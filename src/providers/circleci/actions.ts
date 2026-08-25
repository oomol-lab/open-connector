import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "circleci";

const projectSlugField = s.nonEmptyString(
  "Project slug in the form `vcs-slug/org-name/repo-name`. GitHub App and GitLab projects may use an opaque CircleCI slug such as `circleci/<org-id>/<project-id>`.",
);
const orgSlugField = s.nonEmptyString("Organization slug in the form `vcs-slug/org-name`.");
const pipelineIdField = s.nonEmptyString("The unique ID of the CircleCI pipeline.");
const pageTokenField = s.nonEmptyString("Pagination token returned by CircleCI.");
const workflowNameField = s.nonEmptyString("The CircleCI workflow name.");
const branchField = s.nonEmptyString("The VCS branch name.");
const tagField = s.nonEmptyString("The VCS tag name.");
const jobNumberField = s.positiveInteger("The CircleCI job number.");
const reportingWindowField = s.stringEnum("The reporting window used by CircleCI Insights.", [
  "last-7-days",
  "last-24-hours",
  "last-30-days",
  "last-60-days",
  "last-90-days",
]);
const pipelineStateSchema = s.stringEnum("The current pipeline state reported by CircleCI.", [
  "created",
  "errored",
  "setup-pending",
  "setup",
  "pending",
]);
const workflowStatusSchema = s.stringEnum("The current workflow status reported by CircleCI.", [
  "success",
  "canceled",
  "error",
  "failed",
  "failing",
  "not_run",
  "on_hold",
  "running",
  "unauthorized",
]);
const jobStatusSchema = s.stringEnum("The current job status reported by CircleCI.", [
  "success",
  "running",
  "not_run",
  "failed",
  "retried",
  "queued",
  "not_running",
  "infrastructure_fail",
  "timedout",
  "on_hold",
  "terminated-unknown",
  "blocked",
  "canceled",
  "unauthorized",
]);
const emptyInputSchema = s.actionInput({}, [], "No input is required.");
const paginationOutputTokenSchema = s.nullableString(
  "Pagination token for the next page, or null when there is no next page.",
);
const userSchema = s.looseObject("CircleCI user.", {
  avatar_url: s.nullableString("URL to the user's avatar on the VCS."),
  id: s.nonEmptyString("The unique ID of the user."),
  login: s.nonEmptyString("The VCS login of the current user."),
  name: s.nonEmptyString("The display name of the current user."),
});
const projectSchema = s.looseObject("CircleCI project.", {
  slug: projectSlugField,
  name: s.nonEmptyString("The project name."),
  id: s.nonEmptyString("The unique ID of the project."),
  organization_name: s.string("The organization name that owns the project."),
  organization_slug: s.string("The organization slug that owns the project."),
  organization_id: s.string("The unique ID of the organization."),
  vcs_info: s.looseObject("Version control information for the project."),
});
const pipelineSchema = s.looseObject("CircleCI pipeline.", {
  id: pipelineIdField,
  errors: s.array("Errors attached to the pipeline.", s.looseObject("CircleCI pipeline error.")),
  project_slug: projectSlugField,
  updated_at: s.dateTime("The time when the pipeline was last updated."),
  number: s.integer("The pipeline number."),
  state: pipelineStateSchema,
  created_at: s.dateTime("The time when the pipeline was created."),
  trigger: s.looseObject("Trigger metadata for the pipeline."),
  vcs: s.looseObject("Version control metadata for the pipeline."),
});
const pipelineListSchema = s.object("Paginated CircleCI pipeline list.", {
  items: s.array("The pipelines returned by CircleCI.", pipelineSchema),
  next_page_token: paginationOutputTokenSchema,
});
const pipelineCreationSchema = s.looseObject("CircleCI pipeline creation response.", {
  id: pipelineIdField,
  state: pipelineStateSchema,
  number: s.integer("The pipeline number."),
  created_at: s.dateTime("The time when the pipeline was created."),
});
const workflowSchema = s.looseObject("CircleCI workflow.", {
  pipeline_id: pipelineIdField,
  id: s.nonEmptyString("The unique ID of the workflow."),
  name: s.nonEmptyString("The workflow name."),
  project_slug: projectSlugField,
  status: workflowStatusSchema,
  started_by: s.nonEmptyString("The user ID that started the workflow."),
  pipeline_number: s.integer("The pipeline number that owns the workflow."),
  created_at: s.dateTime("The time when the workflow was created."),
  stopped_at: s.nullableString("The time when the workflow stopped, or null."),
});
const workflowListSchema = s.object("Paginated CircleCI workflow list.", {
  items: s.array("The workflows returned by CircleCI.", workflowSchema),
  next_page_token: paginationOutputTokenSchema,
});
const workflowSummarySchema = s.looseObject("CircleCI workflow summary.", {
  metrics: s.looseObject("Aggregated workflow metrics."),
  trends: s.looseObject("Workflow trend metrics."),
  workflow_names: s.stringArray("Workflow names available for the project."),
});
const jobDetailsSchema = s.looseObject("CircleCI job details.", {
  web_url: s.url("URL of the job in the CircleCI web UI."),
  project: s.looseObject("Project information for the job."),
  parallel_runs: s.array("Parallel run statuses for the job.", s.looseObject("Parallel run information.")),
  started_at: s.dateTime("The time when the job started."),
  latest_workflow: s.looseObject("The latest workflow that included the job."),
  name: s.nonEmptyString("The CircleCI job name."),
  executor: s.looseObject("Executor information for the job."),
  parallelism: s.integer("The number of parallel runs."),
  status: jobStatusSchema,
  number: s.integer("The CircleCI job number."),
  pipeline: s.looseObject("Pipeline information for the job."),
});
const artifactSchema = s.looseObject("CircleCI artifact.", {
  path: s.nonEmptyString("The artifact path."),
  node_index: s.integer("The node index that stored the artifact."),
  url: s.url("The artifact download URL."),
});
const artifactListSchema = s.object("Paginated CircleCI artifact list.", {
  items: s.array("Artifacts returned by CircleCI.", artifactSchema),
  next_page_token: paginationOutputTokenSchema,
});
const orgInsightsSummarySchema = s.looseObject("CircleCI Insights organization summary.", {
  org_data: s.looseObject("Organization-level summary data."),
  org_project_data: s.array("Project summary data across the organization.", s.looseObject("Project summary data.")),
  all_projects: s.nullable(s.stringArray("All project names available in the organization.")),
});
const envVarSchema = s.looseObject("CircleCI environment variable.", {
  name: s.nonEmptyString("The environment variable name."),
  value: s.string("The masked environment variable value returned by CircleCI."),
  "created-at": s.string("The creation timestamp payload returned by CircleCI, when present."),
});
const envVarListSchema = s.object("Paginated CircleCI environment variable list.", {
  items: s.array("Environment variables returned by CircleCI.", envVarSchema),
  next_page_token: paginationOutputTokenSchema,
});

export const circleciActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the currently authenticated CircleCI user profile.",
    inputSchema: emptyInputSchema,
    outputSchema: userSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get CircleCI project details by project slug.",
    followUpActions: ["circleci.list_pipelines_for_project"],
    inputSchema: s.actionInput({ projectSlug: projectSlugField }, ["projectSlug"], "Input for getting a project."),
    outputSchema: projectSchema,
  }),
  defineProviderAction(service, {
    name: "list_pipelines_for_project",
    description: "List CircleCI pipelines for a project.",
    inputSchema: s.object(
      "Input for listing project pipelines.",
      {
        projectSlug: projectSlugField,
        branch: branchField,
        pageToken: pageTokenField,
      },
      { optional: ["branch", "pageToken"] },
    ),
    outputSchema: pipelineListSchema,
  }),
  defineProviderAction(service, {
    name: "get_pipeline",
    description: "Get a CircleCI pipeline by pipeline ID.",
    followUpActions: ["circleci.list_workflows_by_pipeline"],
    inputSchema: s.actionInput({ pipelineId: pipelineIdField }, ["pipelineId"], "Input for getting a pipeline."),
    outputSchema: pipelineSchema,
  }),
  defineProviderAction(service, {
    name: "list_workflows_by_pipeline",
    description: "List workflows for a CircleCI pipeline.",
    inputSchema: s.object(
      "Input for listing pipeline workflows.",
      {
        pipelineId: pipelineIdField,
        pageToken: pageTokenField,
      },
      { optional: ["pageToken"] },
    ),
    outputSchema: workflowListSchema,
  }),
  defineProviderAction(service, {
    name: "get_workflow_summary",
    description: "Get CircleCI Insights summary metrics for a workflow.",
    inputSchema: s.object(
      "Input for getting a workflow insights summary. Do not provide both allBranches and branch.",
      {
        projectSlug: projectSlugField,
        workflowName: workflowNameField,
        allBranches: s.boolean("Whether to aggregate across all branches."),
        branch: branchField,
      },
      { optional: ["allBranches", "branch"] },
    ),
    outputSchema: workflowSummarySchema,
  }),
  defineProviderAction(service, {
    name: "get_job_details",
    description: "Get CircleCI job details by project slug and job number.",
    inputSchema: s.actionInput(
      { projectSlug: projectSlugField, jobNumber: jobNumberField },
      ["projectSlug", "jobNumber"],
      "Input for getting job details.",
    ),
    outputSchema: jobDetailsSchema,
  }),
  defineProviderAction(service, {
    name: "get_job_artifacts",
    description: "List artifacts for a CircleCI job.",
    inputSchema: s.actionInput(
      { projectSlug: projectSlugField, jobNumber: jobNumberField },
      ["projectSlug", "jobNumber"],
      "Input for listing job artifacts.",
    ),
    outputSchema: artifactListSchema,
  }),
  defineProviderAction(service, {
    name: "list_insights_summary",
    description: "Get CircleCI Insights summary metrics for an organization.",
    inputSchema: s.object(
      "Input for listing organization insights summary.",
      {
        orgSlug: orgSlugField,
        reportingWindow: reportingWindowField,
      },
      { optional: ["reportingWindow"] },
    ),
    outputSchema: orgInsightsSummarySchema,
  }),
  defineProviderAction(service, {
    name: "trigger_pipeline",
    description: "Trigger a new CircleCI pipeline for a project.",
    followUpActions: ["circleci.get_pipeline"],
    inputSchema: s.object(
      "Input for triggering a pipeline. Provide either branch or tag, not both.",
      {
        projectSlug: projectSlugField,
        branch: branchField,
        tag: tagField,
        parameters: s.record(
          "Pipeline parameters declared in `.circleci/config.yml`.",
          s.union([
            s.string("A string parameter value."),
            s.number("A numeric parameter value."),
            s.boolean("A boolean parameter value."),
          ]),
        ),
      },
      { optional: ["branch", "tag", "parameters"] },
    ),
    outputSchema: pipelineCreationSchema,
  }),
  defineProviderAction(service, {
    name: "list_project_env_vars",
    description: "List masked CircleCI environment variables for a project.",
    inputSchema: s.actionInput(
      { projectSlug: projectSlugField },
      ["projectSlug"],
      "Input for listing project environment variables.",
    ),
    outputSchema: envVarListSchema,
  }),
];
