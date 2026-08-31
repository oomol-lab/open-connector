import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
  stringRecord,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const currentUserPath = "/api/2.0/preview/scim/v2/Me";
const jobsBasePath = "/api/2.2/jobs";
const clustersBasePath = "/api/2.1/clusters";
const workspaceBasePath = "/api/2.0/workspace";
const reposBasePath = "/api/2.0/repos";
const secretsBasePath = "/api/2.0/secrets";
const timeoutMs = 15_000;

type DatabricksPhase = "validate" | "execute";
type DatabricksHandler = (input: Record<string, unknown>, context: DatabricksContext) => Promise<unknown>;

interface DatabricksContext {
  apiKey: string;
  host: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface DatabricksRequestInput {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export const databricksActionHandlers: ProviderActionHandlers<"databricks", DatabricksHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_jobs(input, context) {
    return listJobs(input, context);
  },
  get_job(input, context) {
    return getJob(input, context);
  },
  create_job(input, context) {
    return createJob(input, context);
  },
  update_job_by_id(input, context) {
    return updateJobById(input, context);
  },
  delete_job(input, context) {
    return deleteJob(input, context);
  },
  run_now_job(input, context) {
    return runNowJob(input, context);
  },
  list_runs(input, context) {
    return listRuns(input, context);
  },
  get_run_by_id(input, context) {
    return getRunById(input, context);
  },
  get_run_output(input, context) {
    return getRunOutput(input, context);
  },
  cancel_run(input, context) {
    return cancelRun(input, context);
  },
  submit_run(input, context) {
    return submitRun(input, context);
  },
  list_clusters(input, context) {
    return listClusters(input, context);
  },
  get_cluster(input, context) {
    return getCluster(input, context);
  },
  create_cluster(input, context) {
    return createCluster(input, context);
  },
  edit_cluster(input, context) {
    return editCluster(input, context);
  },
  start_cluster(input, context) {
    return startCluster(input, context);
  },
  permanent_delete_cluster(input, context) {
    return permanentDeleteCluster(input, context);
  },
  list_cluster_node_types(_input, context) {
    return listClusterNodeTypes(context);
  },
  list_cluster_zones(_input, context) {
    return listClusterZones(context);
  },
  list_cluster_spark_versions(_input, context) {
    return listClusterSparkVersions(context);
  },
  workspace_list(input, context) {
    return workspaceList(input, context);
  },
  workspace_get_status(input, context) {
    return workspaceGetStatus(input, context);
  },
  workspace_export(input, context) {
    return workspaceExport(input, context);
  },
  workspace_import(input, context) {
    return workspaceImport(input, context);
  },
  workspace_mkdirs(input, context) {
    return workspaceMkdirs(input, context);
  },
  workspace_delete(input, context) {
    return workspaceDelete(input, context);
  },
  create_repo(input, context) {
    return createRepo(input, context);
  },
  update_repo(input, context) {
    return updateRepo(input, context);
  },
  delete_repo(input, context) {
    return deleteRepo(input, context);
  },
  list_secret_scopes(_input, context) {
    return listSecretScopes(context);
  },
  list_secrets(input, context) {
    return listSecrets(input, context);
  },
  create_secret_scope(input, context) {
    return createSecretScope(input, context);
  },
  delete_secret_scope(input, context) {
    return deleteSecretScope(input, context);
  },
  put_secret(input, context) {
    return putSecret(input, context);
  },
  delete_secret(input, context) {
    return deleteSecret(input, context);
  },
};

export async function validateDatabricksCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const host = normalizeDatabricksHost(values.host);
  const profile = await fetchCurrentUser({ apiKey, host, fetcher, signal }, "validate");
  return {
    profile: {
      accountId: profile.accountId,
      displayName: profile.displayName,
    },
    grantedScopes: [],
    metadata: compactObject({
      host,
      validationEndpoint: currentUserPath,
      id: optionalString(profile.raw.id),
      userName: optionalString(profile.raw.userName) ?? readPrimaryEmail(profile.raw),
      displayName: optionalString(profile.raw.displayName),
    }),
  };
}

export function normalizeDatabricksHost(value: string): string {
  const raw = value.trim();
  if (!raw) throw new ProviderRequestError(400, "host is required for Databricks API key connections");
  const candidate = raw.includes("://") ? raw : `https://${raw}`;
  const url = assertPublicHttpUrl(candidate, {
    fieldName: "host",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") throw new ProviderRequestError(400, "host must use HTTPS");
  if (url.username || url.password) throw new ProviderRequestError(400, "host must not include credentials");
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new ProviderRequestError(400, "host must be the workspace origin without an API path");
  }
  url.hash = "";
  url.search = "";
  return url.origin;
}

async function getCurrentUser(context: DatabricksContext) {
  const profile = await fetchCurrentUser(context, "execute");
  return { user: profile.raw };
}

async function listJobs(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, {
      path: `${jobsBasePath}/list`,
      query: compactObject({
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        name: optionalString(input.name),
        expand_tasks: optionalBoolean(input.expandTasks),
        page_token: optionalString(input.pageToken),
      }),
    }),
  );
  return {
    jobs: asObjectArray(record.jobs),
    hasMore: optionalBoolean(record.has_more),
    nextPageToken: optionalString(record.next_page_token),
    prevPageToken: optionalString(record.prev_page_token),
  };
}

async function getJob(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, {
      path: `${jobsBasePath}/get`,
      query: compactObject({
        job_id: requiredInteger(input.jobId, "jobId"),
        page_token: optionalString(input.pageToken),
      }),
    }),
  );
  return { job: record, nextPageToken: optionalString(record.next_page_token) };
}

async function createJob(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, { method: "POST", path: `${jobsBasePath}/create`, body: asObject(input.settings) }),
  );
  return { jobId: requiredInteger(record.job_id, "job_id") };
}

async function updateJobById(input: Record<string, unknown>, context: DatabricksContext) {
  if (!optionalRecord(input.newSettings) && !Array.isArray(input.fieldsToRemove)) {
    throw new ProviderRequestError(400, "newSettings or fieldsToRemove is required");
  }
  await requestJson(context, {
    method: "POST",
    path: `${jobsBasePath}/update`,
    body: compactObject({
      job_id: requiredInteger(input.jobId, "jobId"),
      new_settings: optionalRecord(input.newSettings),
      fields_to_remove: Array.isArray(input.fieldsToRemove)
        ? stringArray(input.fieldsToRemove, "fieldsToRemove")
        : undefined,
    }),
  });
  return { jobId: requiredInteger(input.jobId, "jobId"), updated: true };
}

async function deleteJob(input: Record<string, unknown>, context: DatabricksContext) {
  const id = requiredInteger(input.jobId, "jobId");
  await requestJson(context, { method: "POST", path: `${jobsBasePath}/delete`, body: { job_id: id } });
  return { jobId: id, deleted: true };
}

async function runNowJob(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, {
      method: "POST",
      path: `${jobsBasePath}/run-now`,
      body: compactObject({
        job_id: requiredInteger(input.jobId, "jobId"),
        job_parameters: optionalRecord(input.jobParameters)
          ? stringRecord(optionalRecord(input.jobParameters) ?? {})
          : undefined,
        notebook_params: optionalRecord(input.notebookParams)
          ? stringRecord(optionalRecord(input.notebookParams) ?? {})
          : undefined,
        python_named_params: optionalRecord(input.pythonNamedParams)
          ? stringRecord(optionalRecord(input.pythonNamedParams) ?? {})
          : undefined,
        python_params: Array.isArray(input.pythonParams) ? stringArray(input.pythonParams, "pythonParams") : undefined,
        jar_params: Array.isArray(input.jarParams) ? stringArray(input.jarParams, "jarParams") : undefined,
        spark_submit_params: Array.isArray(input.sparkSubmitParams)
          ? stringArray(input.sparkSubmitParams, "sparkSubmitParams")
          : undefined,
        idempotency_token: optionalString(input.idempotencyToken),
      }),
    }),
  );
  return { runId: requiredInteger(record.run_id, "run_id"), numberInJob: optionalInteger(record.number_in_job) };
}

async function listRuns(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, {
      path: `${jobsBasePath}/runs/list`,
      query: compactObject({
        job_id: optionalInteger(input.jobId),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        run_type: optionalString(input.runType),
        active_only: optionalBoolean(input.activeOnly),
        completed_only: optionalBoolean(input.completedOnly),
        expand_tasks: optionalBoolean(input.expandTasks),
        start_time_from: optionalInteger(input.startTimeFrom),
        start_time_to: optionalInteger(input.startTimeTo),
      }),
    }),
  );
  return {
    runs: asObjectArray(record.runs),
    hasMore: optionalBoolean(record.has_more),
    nextPageToken: optionalString(record.next_page_token),
  };
}

async function getRunById(input: Record<string, unknown>, context: DatabricksContext) {
  return {
    run: asObject(
      await requestJson(context, {
        path: `${jobsBasePath}/runs/get`,
        query: { run_id: requiredInteger(input.runId, "runId") },
      }),
    ),
  };
}

async function getRunOutput(input: Record<string, unknown>, context: DatabricksContext) {
  return {
    runOutput: asObject(
      await requestJson(context, {
        path: `${jobsBasePath}/runs/get-output`,
        query: { run_id: requiredInteger(input.runId, "runId") },
      }),
    ),
  };
}

async function cancelRun(input: Record<string, unknown>, context: DatabricksContext) {
  const id = requiredInteger(input.runId, "runId");
  await requestJson(context, { method: "POST", path: `${jobsBasePath}/runs/cancel`, body: { run_id: id } });
  return { runId: id, cancelled: true };
}

async function submitRun(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, { method: "POST", path: `${jobsBasePath}/runs/submit`, body: asObject(input.run) }),
  );
  return { runId: requiredInteger(record.run_id, "run_id") };
}

async function listClusters(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, {
      method: "POST",
      path: `${clustersBasePath}/list`,
      body: compactObject({
        page_size: optionalInteger(input.pageSize),
        page_token: optionalString(input.pageToken),
        filter_by: optionalRecord(input.filterBy),
        sort_by: optionalRecord(input.sortBy),
      }),
    }),
  );
  return {
    clusters: asObjectArray(record.clusters),
    nextPageToken: optionalString(record.next_page_token),
    prevPageToken: optionalString(record.prev_page_token),
  };
}

async function getCluster(input: Record<string, unknown>, context: DatabricksContext) {
  return {
    cluster: asObject(
      await requestJson(context, {
        path: `${clustersBasePath}/get`,
        query: { cluster_id: requiredString(input.clusterId, "clusterId", providerInputError) },
      }),
    ),
  };
}

async function createCluster(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, { method: "POST", path: `${clustersBasePath}/create`, body: asObject(input.cluster) }),
  );
  return { clusterId: requiredString(record.cluster_id, "cluster_id", providerInputError) };
}

async function editCluster(input: Record<string, unknown>, context: DatabricksContext) {
  const id = requiredString(input.clusterId, "clusterId", providerInputError);
  await requestJson(context, {
    method: "POST",
    path: `${clustersBasePath}/edit`,
    body: { ...asObject(input.cluster), cluster_id: id },
  });
  return { clusterId: id, edited: true };
}

async function startCluster(input: Record<string, unknown>, context: DatabricksContext) {
  const id = requiredString(input.clusterId, "clusterId", providerInputError);
  await requestJson(context, { method: "POST", path: `${clustersBasePath}/start`, body: { cluster_id: id } });
  return { clusterId: id, started: true };
}

async function permanentDeleteCluster(input: Record<string, unknown>, context: DatabricksContext) {
  const id = requiredString(input.clusterId, "clusterId", providerInputError);
  await requestJson(context, {
    method: "POST",
    path: `${clustersBasePath}/permanent-delete`,
    body: { cluster_id: id },
  });
  return { clusterId: id, deleted: true };
}

async function listClusterNodeTypes(context: DatabricksContext) {
  const record = asObject(await requestJson(context, { path: `${clustersBasePath}/list-node-types` }));
  return { nodeTypes: asObjectArray(record.node_types) };
}

async function listClusterZones(context: DatabricksContext) {
  const record = asObject(await requestJson(context, { path: `${clustersBasePath}/list-zones` }));
  return {
    zones: Array.isArray(record.zones) ? record.zones.map(String) : [],
    defaultZone: optionalString(record.default_zone),
  };
}

async function listClusterSparkVersions(context: DatabricksContext) {
  const record = asObject(await requestJson(context, { path: `${clustersBasePath}/spark-versions` }));
  return { versions: asObjectArray(record.versions) };
}

async function workspaceList(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, {
      path: `${workspaceBasePath}/list`,
      query: { path: requiredString(input.path, "path", providerInputError) },
    }),
  );
  return { objects: asObjectArray(record.objects) };
}

async function workspaceGetStatus(input: Record<string, unknown>, context: DatabricksContext) {
  return {
    object: asObject(
      await requestJson(context, {
        path: `${workspaceBasePath}/get-status`,
        query: { path: requiredString(input.path, "path", providerInputError) },
      }),
    ),
  };
}

async function workspaceExport(input: Record<string, unknown>, context: DatabricksContext) {
  const directDownload = optionalBoolean(input.directDownload);
  const request = {
    path: `${workspaceBasePath}/export`,
    query: compactObject({
      path: requiredString(input.path, "path", providerInputError),
      format: optionalString(input.format),
      direct_download: directDownload,
    }),
  };
  if (directDownload) {
    const response = await requestText(context, request);
    return { content: response.text, directDownload: true, contentType: response.contentType };
  }
  const record = asObject(await requestJson(context, request));
  return { content: optionalString(record.content), fileType: optionalString(record.file_type) };
}

async function workspaceImport(input: Record<string, unknown>, context: DatabricksContext) {
  const targetPath = requiredString(input.path, "path", providerInputError);
  await requestJson(context, {
    method: "POST",
    path: `${workspaceBasePath}/import`,
    body: compactObject({
      path: targetPath,
      content: requiredString(input.content, "content", providerInputError),
      format: optionalString(input.format),
      language: optionalString(input.language),
      overwrite: optionalBoolean(input.overwrite),
    }),
  });
  return { path: targetPath, imported: true };
}

async function workspaceMkdirs(input: Record<string, unknown>, context: DatabricksContext) {
  const targetPath = requiredString(input.path, "path", providerInputError);
  await requestJson(context, { method: "POST", path: `${workspaceBasePath}/mkdirs`, body: { path: targetPath } });
  return { path: targetPath, created: true };
}

async function workspaceDelete(input: Record<string, unknown>, context: DatabricksContext) {
  const targetPath = requiredString(input.path, "path", providerInputError);
  await requestJson(context, {
    method: "POST",
    path: `${workspaceBasePath}/delete`,
    body: compactObject({ path: targetPath, recursive: optionalBoolean(input.recursive) }),
  });
  return { path: targetPath, deleted: true };
}

async function createRepo(input: Record<string, unknown>, context: DatabricksContext) {
  assertBranchTag(input);
  return {
    repo: asObject(
      await requestJson(context, {
        method: "POST",
        path: reposBasePath,
        body: compactObject({
          url: requiredString(input.url, "url", providerInputError),
          path: optionalString(input.path),
          provider: optionalString(input.provider),
          branch: optionalString(input.branch),
          tag: optionalString(input.tag),
          sparse_checkout: optionalRecord(input.sparseCheckout),
        }),
      }),
    ),
  };
}

async function updateRepo(input: Record<string, unknown>, context: DatabricksContext) {
  assertBranchTag(input);
  if (!optionalString(input.branch) && !optionalString(input.tag) && !optionalRecord(input.sparseCheckout)) {
    throw new ProviderRequestError(400, "branch, tag, or sparseCheckout is required");
  }
  return {
    repo: asObject(
      await requestJson(context, {
        method: "PATCH",
        path: `${reposBasePath}/${encodeURIComponent(String(input.repoId))}`,
        body: compactObject({
          branch: optionalString(input.branch),
          tag: optionalString(input.tag),
          sparse_checkout: optionalRecord(input.sparseCheckout),
        }),
      }),
    ),
  };
}

async function deleteRepo(input: Record<string, unknown>, context: DatabricksContext) {
  const repoId = String(input.repoId);
  await requestJson(context, { method: "DELETE", path: `${reposBasePath}/${encodeURIComponent(repoId)}` });
  return { repoId, deleted: true };
}

async function listSecretScopes(context: DatabricksContext) {
  const record = asObject(await requestJson(context, { path: `${secretsBasePath}/scopes/list` }));
  return { scopes: asObjectArray(record.scopes) };
}

async function listSecrets(input: Record<string, unknown>, context: DatabricksContext) {
  const record = asObject(
    await requestJson(context, {
      path: `${secretsBasePath}/list`,
      query: { scope: requiredString(input.scope, "scope", providerInputError) },
    }),
  );
  return { secrets: asObjectArray(record.secrets) };
}

async function createSecretScope(input: Record<string, unknown>, context: DatabricksContext) {
  const secretScope = requiredString(input.scope, "scope", providerInputError);
  await requestJson(context, {
    method: "POST",
    path: `${secretsBasePath}/scopes/create`,
    body: compactObject({
      scope: secretScope,
      scope_backend_type: optionalString(input.scopeBackendType),
      backend_azure_keyvault: optionalRecord(input.backendAzureKeyvault),
      initial_manage_principal: optionalString(input.initialManagePrincipal),
    }),
  });
  return { scope: secretScope, created: true };
}

async function deleteSecretScope(input: Record<string, unknown>, context: DatabricksContext) {
  const secretScope = requiredString(input.scope, "scope", providerInputError);
  await requestJson(context, {
    method: "POST",
    path: `${secretsBasePath}/scopes/delete`,
    body: { scope: secretScope },
  });
  return { scope: secretScope, deleted: true };
}

async function putSecret(input: Record<string, unknown>, context: DatabricksContext) {
  const secretScope = requiredString(input.scope, "scope", providerInputError);
  const secretKey = requiredString(input.key, "key", providerInputError);
  const hasString = input.stringValue !== undefined;
  const hasBytes = input.bytesValue !== undefined;
  if (Number(hasString) + Number(hasBytes) !== 1)
    throw new ProviderRequestError(400, "exactly one of stringValue or bytesValue is required");
  await requestJson(context, {
    method: "POST",
    path: `${secretsBasePath}/put`,
    body: compactObject({
      scope: secretScope,
      key: secretKey,
      string_value: optionalString(input.stringValue),
      bytes_value: optionalString(input.bytesValue),
    }),
  });
  return { scope: secretScope, key: secretKey, updated: true };
}

async function deleteSecret(input: Record<string, unknown>, context: DatabricksContext) {
  const secretScope = requiredString(input.scope, "scope", providerInputError);
  const secretKey = requiredString(input.key, "key", providerInputError);
  await requestJson(context, {
    method: "POST",
    path: `${secretsBasePath}/delete`,
    body: { scope: secretScope, key: secretKey },
  });
  return { scope: secretScope, key: secretKey, deleted: true };
}

async function fetchCurrentUser(
  context: DatabricksContext,
  phase: DatabricksPhase,
): Promise<{ accountId: string; displayName: string; raw: Record<string, unknown> }> {
  const raw = asObject(await requestJson(context, { path: currentUserPath }, phase));
  const accountId = optionalString(raw.id) ?? optionalString(raw.userName) ?? readPrimaryEmail(raw);
  if (!accountId) throw new ProviderRequestError(502, "databricks current user response is invalid");
  return {
    accountId,
    displayName: optionalString(raw.displayName) ?? optionalString(raw.userName) ?? readPrimaryEmail(raw) ?? accountId,
    raw,
  };
}

async function requestJson(
  context: DatabricksContext,
  input: DatabricksRequestInput,
  phase: DatabricksPhase = "execute",
): Promise<unknown> {
  const response = await databricksFetch(context, input, phase);
  return response.payload;
}

async function requestText(
  context: DatabricksContext,
  input: DatabricksRequestInput,
): Promise<{ text: string; contentType?: string }> {
  const response = await databricksFetch(context, input, "execute");
  return { text: response.text, contentType: response.response.headers.get("content-type") ?? undefined };
}

async function databricksFetch(
  context: DatabricksContext,
  input: DatabricksRequestInput,
  phase: DatabricksPhase,
): Promise<{ response: Response; text: string; payload: unknown }> {
  const url = new URL(input.path, `${context.host}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const timeout = createProviderTimeout(context.signal, timeoutMs);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "databricks request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `databricks request failed: ${error.message}` : "databricks request failed",
    );
  } finally {
    timeout.cleanup();
  }
  const text = await response.text();
  const payload = parsePayload(text, response.headers.get("content-type"));
  if (!response.ok) throw createDatabricksError(response, payload, phase);
  return { response, text, payload };
}

function buildHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
  }) as Record<string, string>;
}

function parsePayload(text: string, contentType: string | null): unknown {
  if (!text) return null;
  if (contentType?.toLowerCase().includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createDatabricksError(response: Response, payload: unknown, phase: DatabricksPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? response.statusText ?? "Databricks request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403))
    return new ProviderRequestError(400, message);
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const errorCode = optionalString(record.error_code);
  const message = optionalString(record.message) ?? optionalString(record.detail) ?? optionalString(record.error);
  return errorCode && message ? `${errorCode}: ${message}` : (message ?? errorCode);
}

function requiredInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN;
  if (Number.isInteger(parsed)) return parsed;
  throw new ProviderRequestError(400, `${fieldName} must be an integer`);
}

function readPrimaryEmail(record: Record<string, unknown>): string | undefined {
  const emails = record.emails;
  if (!Array.isArray(emails)) return undefined;
  for (const entry of emails) {
    const value = optionalString(optionalRecord(entry)?.value);
    if (value) return value;
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map(asObject) : [];
}

function assertBranchTag(input: Record<string, unknown>): void {
  if (optionalString(input.branch) && optionalString(input.tag)) {
    throw new ProviderRequestError(400, "branch and tag cannot both be set");
  }
}
