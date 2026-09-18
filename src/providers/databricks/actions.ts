import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "databricks";
const rawObject = s.looseObject("A raw Databricks API object.");
const rawList = s.array(rawObject, { description: "Raw Databricks API objects." });
const emptyInput = s.actionInput({});
const stringMap = s.record("A string map passed through to Databricks.", s.string("A string value."));
const pageToken = s.string("A page token returned by a previous Databricks response.");
const limit = s.integer({ minimum: 1, maximum: 1000, description: "The maximum number of results to return." });
const offset = s.nonNegativeInteger("The zero-based offset for paginated results.");
const jobId = s.positiveInteger("The Databricks job ID.");
const runId = s.positiveInteger("The Databricks run ID.");
const clusterId = s.nonEmptyString("The Databricks cluster ID.");
const path = s.nonEmptyString("The absolute Databricks workspace path.");
const scope = s.nonEmptyString("The Databricks secret scope name.");
const key = s.nonEmptyString("The Databricks secret key name.");

function action(
  name: DatabricksActionName,
  operationType: ActionDefinition["operationType"],
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, { name, operationType, description, inputSchema, outputSchema });
}

export type DatabricksActionName =
  | "get_current_user"
  | "list_jobs"
  | "get_job"
  | "create_job"
  | "update_job_by_id"
  | "delete_job"
  | "run_now_job"
  | "list_runs"
  | "get_run_by_id"
  | "get_run_output"
  | "cancel_run"
  | "submit_run"
  | "list_clusters"
  | "get_cluster"
  | "create_cluster"
  | "edit_cluster"
  | "start_cluster"
  | "permanent_delete_cluster"
  | "list_cluster_node_types"
  | "list_cluster_zones"
  | "list_cluster_spark_versions"
  | "workspace_list"
  | "workspace_get_status"
  | "workspace_export"
  | "workspace_import"
  | "workspace_mkdirs"
  | "workspace_delete"
  | "create_repo"
  | "update_repo"
  | "delete_repo"
  | "list_secret_scopes"
  | "list_secrets"
  | "create_secret_scope"
  | "delete_secret_scope"
  | "put_secret"
  | "delete_secret";

export const databricksActions: ActionDefinition[] = [
  action(
    "get_current_user",
    "read",
    "Get the current Databricks workspace principal profile.",
    emptyInput,
    s.actionOutput({ user: rawObject }),
  ),
  action(
    "list_jobs",
    "read",
    "List Databricks jobs in the connected workspace.",
    s.object(
      {
        limit,
        offset,
        name: s.string("Filters jobs by name prefix."),
        expandTasks: s.boolean("Include expanded tasks."),
        pageToken,
      },
      {
        optional: ["limit", "offset", "name", "expandTasks", "pageToken"],
      },
    ),
    s.actionOutput(
      {
        jobs: rawList,
        hasMore: s.boolean("Whether more jobs are available."),
        nextPageToken: pageToken,
        prevPageToken: pageToken,
      },
      "A paginated Databricks jobs list.",
      ["jobs"],
    ),
  ),
  action(
    "get_job",
    "read",
    "Get one Databricks job.",
    s.object({ jobId, pageToken }, { required: ["jobId"] }),
    s.actionOutput({ job: rawObject, nextPageToken: pageToken }, "Databricks job response.", ["job"]),
  ),
  action(
    "create_job",
    "write",
    "Create a Databricks job from a raw Jobs API settings object.",
    s.actionInput({ settings: rawObject }, ["settings"]),
    s.actionOutput({ jobId }),
  ),
  action(
    "update_job_by_id",
    "write",
    "Update an existing Databricks job by ID.",
    s.object(
      { jobId, newSettings: rawObject, fieldsToRemove: s.stringArray("Settings paths to remove.") },
      { required: ["jobId"], optional: ["newSettings", "fieldsToRemove"] },
    ),
    s.actionOutput({ jobId, updated: s.boolean("Whether the update was accepted.") }),
  ),
  action(
    "delete_job",
    "destructive",
    "Delete a Databricks job by ID.",
    s.actionInput({ jobId }, ["jobId"]),
    s.actionOutput({ jobId, deleted: s.boolean("Whether the delete was accepted.") }),
  ),
  action(
    "run_now_job",
    "write",
    "Trigger an immediate run for a Databricks job.",
    s.object(
      {
        jobId,
        jobParameters: stringMap,
        notebookParams: stringMap,
        pythonNamedParams: stringMap,
        pythonParams: s.stringArray("Python parameters."),
        jarParams: s.stringArray("JAR parameters."),
        sparkSubmitParams: s.stringArray("Spark submit parameters."),
        idempotencyToken: s.string("Idempotency token."),
      },
      {
        required: ["jobId"],
        optional: [
          "jobParameters",
          "notebookParams",
          "pythonNamedParams",
          "pythonParams",
          "jarParams",
          "sparkSubmitParams",
          "idempotencyToken",
        ],
      },
    ),
    s.actionOutput(
      { runId, numberInJob: s.integer("The ordinal number of this run within the job.") },
      "Run-now response.",
      ["runId"],
    ),
  ),
  action(
    "list_runs",
    "read",
    "List Databricks job runs.",
    s.object(
      {
        jobId,
        limit,
        offset,
        runType: s.string("Run type."),
        activeOnly: s.boolean("Only active runs."),
        completedOnly: s.boolean("Only completed runs."),
        expandTasks: s.boolean("Include expanded tasks."),
        startTimeFrom: s.integer("Unix-millis start lower bound."),
        startTimeTo: s.integer("Unix-millis start upper bound."),
      },
      {
        optional: [
          "jobId",
          "limit",
          "offset",
          "runType",
          "activeOnly",
          "completedOnly",
          "expandTasks",
          "startTimeFrom",
          "startTimeTo",
        ],
      },
    ),
    s.actionOutput(
      { runs: rawList, hasMore: s.boolean("Whether more runs are available."), nextPageToken: pageToken },
      "Runs list.",
      ["runs"],
    ),
  ),
  action(
    "get_run_by_id",
    "read",
    "Get one Databricks job run by run ID.",
    s.actionInput({ runId }, ["runId"]),
    s.actionOutput({ run: rawObject }),
  ),
  action(
    "get_run_output",
    "read",
    "Get the output payload for one Databricks run.",
    s.actionInput({ runId }, ["runId"]),
    s.actionOutput({ runOutput: rawObject }),
  ),
  action(
    "cancel_run",
    "destructive",
    "Cancel a Databricks job run by run ID.",
    s.actionInput({ runId }, ["runId"]),
    s.actionOutput({ runId, cancelled: s.boolean("Whether the cancel was accepted.") }),
  ),
  action(
    "submit_run",
    "write",
    "Submit a one-time Databricks run.",
    s.actionInput({ run: rawObject }, ["run"]),
    s.actionOutput({ runId }),
  ),
  action(
    "list_clusters",
    "read",
    "List Databricks clusters.",
    s.object(
      {
        pageSize: s.integer({ minimum: 1, maximum: 500, description: "The maximum number of clusters to return." }),
        pageToken,
        filterBy: rawObject,
        sortBy: rawObject,
      },
      { optional: ["pageSize", "pageToken", "filterBy", "sortBy"] },
    ),
    s.actionOutput({ clusters: rawList, nextPageToken: pageToken, prevPageToken: pageToken }, "Clusters list.", [
      "clusters",
    ]),
  ),
  action(
    "get_cluster",
    "read",
    "Get one Databricks cluster by cluster ID.",
    s.actionInput({ clusterId }, ["clusterId"]),
    s.actionOutput({ cluster: rawObject }),
  ),
  action(
    "create_cluster",
    "write",
    "Create a Databricks cluster from a raw clusters/create payload.",
    s.actionInput({ cluster: rawObject }, ["cluster"]),
    s.actionOutput({ clusterId }),
  ),
  action(
    "edit_cluster",
    "write",
    "Edit an existing Databricks cluster by cluster ID.",
    s.actionInput({ clusterId, cluster: rawObject }, ["clusterId", "cluster"]),
    s.actionOutput({ clusterId, edited: s.boolean("Whether the edit was accepted.") }),
  ),
  action(
    "start_cluster",
    "write",
    "Start a terminated Databricks cluster by cluster ID.",
    s.actionInput({ clusterId }, ["clusterId"]),
    s.actionOutput({ clusterId, started: s.boolean("Whether the start was accepted.") }),
  ),
  action(
    "permanent_delete_cluster",
    "destructive",
    "Permanently delete a Databricks cluster by cluster ID.",
    s.actionInput({ clusterId }, ["clusterId"]),
    s.actionOutput({ clusterId, deleted: s.boolean("Whether the delete was accepted.") }),
  ),
  action(
    "list_cluster_node_types",
    "read",
    "List Databricks cluster node types.",
    emptyInput,
    s.actionOutput({ nodeTypes: rawList }),
  ),
  action(
    "list_cluster_zones",
    "read",
    "List Databricks cluster availability zones.",
    emptyInput,
    s.actionOutput(
      {
        zones: s.stringArray("The Databricks availability zones."),
        defaultZone: s.string("The default Databricks availability zone."),
      },
      "Zones response.",
      ["zones"],
    ),
  ),
  action(
    "list_cluster_spark_versions",
    "read",
    "List Databricks Runtime and Spark versions.",
    emptyInput,
    s.actionOutput({ versions: rawList }),
  ),
  action(
    "workspace_list",
    "read",
    "List direct Databricks workspace objects under a workspace path.",
    s.actionInput({ path }, ["path"]),
    s.actionOutput({ objects: rawList }),
  ),
  action(
    "workspace_get_status",
    "read",
    "Get metadata for one Databricks workspace object.",
    s.actionInput({ path }, ["path"]),
    s.actionOutput({ object: rawObject }),
  ),
  action(
    "workspace_export",
    "read",
    "Export one Databricks workspace object.",
    s.object(
      {
        path,
        format: s.stringEnum(["SOURCE", "HTML", "JUPYTER", "DBC", "R_MARKDOWN", "AUTO"], {
          description: "Export format.",
        }),
        directDownload: s.boolean("Whether to return direct file content."),
      },
      { required: ["path"], optional: ["format", "directDownload"] },
    ),
    s.actionOutput(
      {
        content: s.string("Exported content."),
        fileType: s.string("Export file type."),
        directDownload: s.boolean("Whether response was direct-download."),
        contentType: s.string("Direct-download content type."),
      },
      "Workspace export response.",
      [],
    ),
  ),
  action(
    "workspace_import",
    "write",
    "Import base64 content into the Databricks workspace.",
    s.object(
      {
        path,
        content: s.nonEmptyString("Base64-encoded content."),
        format: s.stringEnum(["SOURCE", "HTML", "JUPYTER", "DBC", "R_MARKDOWN", "AUTO"], {
          description: "Import format.",
        }),
        language: s.stringEnum(["PYTHON", "SQL", "SCALA", "R"], { description: "Notebook language." }),
        overwrite: s.boolean("Whether to overwrite."),
      },
      { required: ["path", "content"], optional: ["format", "language", "overwrite"] },
    ),
    s.actionOutput({ path, imported: s.boolean("Whether the import was accepted.") }),
  ),
  action(
    "workspace_mkdirs",
    "write",
    "Create a Databricks workspace directory.",
    s.actionInput({ path }, ["path"]),
    s.actionOutput({ path, created: s.boolean("Whether mkdirs was accepted.") }),
  ),
  action(
    "workspace_delete",
    "destructive",
    "Delete a Databricks workspace object or directory.",
    s.object(
      { path, recursive: s.boolean("Whether to recursively delete.") },
      { required: ["path"], optional: ["recursive"] },
    ),
    s.actionOutput({ path, deleted: s.boolean("Whether delete was accepted.") }),
  ),
  action(
    "create_repo",
    "write",
    "Create a Databricks workspace repo linked to a Git remote.",
    s.object(
      {
        url: s.nonEmptyString("The Git repository URL."),
        path,
        provider: s.string("The Databricks Git provider name."),
        branch: s.string("The Git branch."),
        tag: s.string("The Git tag."),
        sparseCheckout: rawObject,
      },
      { required: ["url"], optional: ["path", "provider", "branch", "tag", "sparseCheckout"] },
    ),
    s.actionOutput({ repo: rawObject }),
  ),
  action(
    "update_repo",
    "write",
    "Update a Databricks workspace repo.",
    s.object(
      {
        repoId: s.anyOf("The Databricks repo ID.", [s.string(), s.positiveInteger("Repo ID.")]),
        branch: s.string("The Git branch."),
        tag: s.string("The Git tag."),
        sparseCheckout: rawObject,
      },
      { required: ["repoId"], optional: ["branch", "tag", "sparseCheckout"] },
    ),
    s.actionOutput({ repo: rawObject }),
  ),
  action(
    "delete_repo",
    "destructive",
    "Delete a Databricks workspace repo by repo ID.",
    s.actionInput({ repoId: s.anyOf("The Databricks repo ID.", [s.string(), s.positiveInteger("Repo ID.")]) }, [
      "repoId",
    ]),
    s.actionOutput({ repoId: s.string("Deleted repo ID."), deleted: s.boolean("Whether delete was accepted.") }),
  ),
  action(
    "list_secret_scopes",
    "read",
    "List Databricks secret scopes.",
    emptyInput,
    s.actionOutput({ scopes: rawList }),
  ),
  action(
    "list_secrets",
    "read",
    "List Databricks secret metadata rows in one secret scope.",
    s.actionInput({ scope }, ["scope"]),
    s.actionOutput({ secrets: rawList }),
  ),
  action(
    "create_secret_scope",
    "write",
    "Create a Databricks secret scope.",
    s.object(
      {
        scope,
        scopeBackendType: s.stringEnum(["DATABRICKS", "AZURE_KEYVAULT"], { description: "Backend type." }),
        backendAzureKeyvault: rawObject,
        initialManagePrincipal: s.string("Initial MANAGE principal."),
      },
      { required: ["scope"], optional: ["scopeBackendType", "backendAzureKeyvault", "initialManagePrincipal"] },
    ),
    s.actionOutput({ scope, created: s.boolean("Whether create was accepted.") }),
  ),
  action(
    "delete_secret_scope",
    "destructive",
    "Delete a Databricks secret scope by scope name.",
    s.actionInput({ scope }, ["scope"]),
    s.actionOutput({ scope, deleted: s.boolean("Whether delete was accepted.") }),
  ),
  action(
    "put_secret",
    "destructive",
    "Create or overwrite a Databricks secret value.",
    s.object(
      { scope, key, stringValue: s.string("UTF-8 secret value."), bytesValue: s.string("Bytes secret value.") },
      { required: ["scope", "key"], optional: ["stringValue", "bytesValue"] },
    ),
    s.actionOutput({ scope, key, updated: s.boolean("Whether put was accepted.") }),
  ),
  action(
    "delete_secret",
    "destructive",
    "Delete one Databricks secret value.",
    s.actionInput({ scope, key }, ["scope", "key"]),
    s.actionOutput({ scope, key, deleted: s.boolean("Whether delete was accepted.") }),
  ),
];
