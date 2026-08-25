import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalScalarString,
  optionalString,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "roboflow";
const roboflowApiBaseUrl = "https://api.roboflow.com";
const roboflowDetectBaseUrl = "https://detect.roboflow.com";
const validationPath = "/";

type RoboflowActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const roboflowActionHandlers: ProviderActionHandlers<"roboflow", RoboflowActionHandler> = {
  list_projects(_input, context) {
    return executeListProjects(context);
  },
  get_project_versions(input, context) {
    return executeGetProjectVersions(input, context);
  },
  get_version(input, context) {
    return executeGetVersion(input, context);
  },
  detect_objects(input, context) {
    return executeDetectObjects(input, context);
  },
  run_workflow(input, context) {
    return executeRunWorkflow(input, context);
  },
  run_saved_workflow(input, context) {
    return executeRunSavedWorkflow(input, context);
  },
  validate_workflow(input, context) {
    return executeValidateWorkflow(input, context);
  },
  describe_workflow_interface(input, context) {
    return executeDescribeWorkflowInterface(input, context);
  },
  get_workflow_schema(_input, context) {
    return executeGetWorkflowSchema(context);
  },
  get_execution_engine_versions(_input, context) {
    return executeGetExecutionEngineVersions(context);
  },
  get_server_info(_input, context) {
    return executeGetServerInfo(context);
  },
  get_server_metrics(_input, context) {
    return executeGetServerMetrics(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, roboflowActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const payload = await roboflowGetJson(validationPath, {}, apiKey, fetcher, "validate", signal);
    const workspace = extractWorkspace(payload);
    const projects = extractProjects(payload);
    return {
      profile: {
        accountId: workspace ?? "roboflow-api-key",
        displayName: workspace ? `Roboflow workspace ${workspace}` : "Roboflow API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: roboflowApiBaseUrl,
        validationEndpoint: validationPath,
        workspace,
        projectCount: projects.length,
      }),
    };
  },
};

async function executeListProjects(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await roboflowGetJson(validationPath, {}, context.apiKey, context.fetcher, "execute", context.signal);
  return {
    workspace: extractWorkspace(payload),
    projects: extractProjects(payload),
  };
}

async function executeGetProjectVersions(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspace = requiredInputString(input.workspace, "workspace");
  const project = requiredInputString(input.project, "project");
  const payload = await roboflowGetJson(
    `/${encodeURIComponent(workspace)}/${encodeURIComponent(project)}`,
    {},
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  const rawProject = extractProjectRecord(payload);
  return {
    project: normalizeProject(rawProject, project),
    versions: extractVersions(rawProject),
  };
}

async function executeGetVersion(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspace = requiredInputString(input.workspace, "workspace");
  const project = requiredInputString(input.project, "project");
  const version = requireNumber(input.version, "version");
  const payload = await roboflowGetJson(
    `/${encodeURIComponent(workspace)}/${encodeURIComponent(project)}/${version}`,
    {},
    context.apiKey,
    context.fetcher,
    "execute",
    context.signal,
  );
  return {
    version: normalizeVersionDetail(optionalRecord(payload)?.version ?? payload),
  };
}

async function executeDetectObjects(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const project = requiredInputString(input.project, "project");
  const version = requireNumber(input.version, "version");
  const payload = await roboflowRequestJson(
    new URL(`/${encodeURIComponent(project)}/${version}`, roboflowDetectBaseUrl),
    {
      method: "POST",
      query: compactObject({
        image: optionalString(input.imageUrl),
        confidence: optionalNumber(input.confidence),
        overlap: optionalNumber(input.overlap),
      }),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      body: optionalString(input.imageBase64),
      contentType: "application/x-www-form-urlencoded",
      signal: context.signal,
    },
  );
  return normalizeDetectionPayload(payload);
}

async function executeRunWorkflow(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await roboflowPostJson(
    "/workflows/run",
    compactObject({
      api_key: context.apiKey,
      specification: requiredInputRecord(input.specification, "specification"),
      inputs: requiredInputRecord(input.inputs, "inputs"),
      workflow_id: optionalString(input.workflowId),
      excluded_fields: optionalStringArray(input.excludedFields, "excludedFields"),
      enable_profiling: optionalBoolean(input.enableProfiling),
      is_preview: optionalBoolean(input.isPreview),
    }),
    context,
  );
  return normalizeWorkflowRunPayload(payload);
}

async function executeRunSavedWorkflow(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspace = requiredInputString(input.workspace, "workspace");
  const workflowId = requiredInputString(input.workflowId, "workflowId");
  const payload = await roboflowPostJson(
    `/infer/workflows/${encodeURIComponent(workspace)}/${encodeURIComponent(workflowId)}`,
    compactObject({
      api_key: context.apiKey,
      inputs: requiredInputRecord(input.inputs, "inputs"),
      use_cache: optionalBoolean(input.useCache),
      workflow_version_id: optionalString(input.workflowVersionId),
      excluded_fields: optionalStringArray(input.excludedFields, "excludedFields"),
      enable_profiling: optionalBoolean(input.enableProfiling),
    }),
    context,
  );
  return normalizeWorkflowRunPayload(payload);
}

async function executeValidateWorkflow(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await roboflowRequestJson(new URL("/workflows/validate", roboflowDetectBaseUrl), {
    method: "POST",
    query: {},
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    body: JSON.stringify(requiredInputRecord(input.specification, "specification")),
    contentType: "application/json",
    includeApiKeyQuery: true,
    signal: context.signal,
  });
  const record = optionalRecord(payload) ?? {};
  return {
    status: optionalScalarString(record.status) ?? null,
    raw: record,
  };
}

async function executeDescribeWorkflowInterface(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const specification = optionalRecord(input.specification);
  const workspace = optionalString(input.workspace);
  const workflowId = optionalString(input.workflowId);
  const path =
    specification || !workspace || !workflowId
      ? "/workflows/describe_interface"
      : `/${encodeURIComponent(workspace)}/workflows/${encodeURIComponent(workflowId)}/describe_interface`;
  const body = specification
    ? { api_key: context.apiKey, specification }
    : compactObject({
        api_key: context.apiKey,
        use_cache: optionalBoolean(input.useCache),
        workflow_version_id: optionalString(input.workflowVersionId),
      });
  return normalizeWorkflowInterfacePayload(await roboflowPostJson(path, body, context));
}

async function executeGetWorkflowSchema(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await roboflowGetPublicJson("/workflows/definition/schema", context);
  return {
    schema: optionalRecord(optionalRecord(payload)?.schema) ?? {},
    raw: optionalRecord(payload) ?? {},
  };
}

async function executeGetExecutionEngineVersions(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await roboflowGetPublicJson("/workflows/execution_engine/versions", context);
  const record = optionalRecord(payload) ?? {};
  return {
    versions: readStringArray(record.versions),
    raw: record,
  };
}

async function executeGetServerInfo(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await roboflowGetPublicJson("/info", context);
  const record = optionalRecord(payload) ?? {};
  return {
    name: optionalScalarString(record.name) ?? null,
    version: optionalScalarString(record.version) ?? null,
    uuid: optionalScalarString(record.uuid) ?? null,
    raw: record,
  };
}

async function executeGetServerMetrics(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await context.fetcher(new URL("/metrics", roboflowDetectBaseUrl), {
      method: "GET",
      headers: roboflowHeaders(),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `roboflow request failed: ${error.message}` : "roboflow request failed",
    );
  }
  const metricsText = await response.text().catch(() => "");
  if (!response.ok) {
    throw createRoboflowError(response, metricsText, "execute");
  }
  return { metricsText };
}

async function roboflowGetJson(
  path: string,
  query: Record<string, string | number | undefined>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
): Promise<unknown> {
  return roboflowRequestJson(new URL(path, roboflowApiBaseUrl), {
    method: "GET",
    query,
    apiKey,
    fetcher,
    phase,
    signal,
  });
}

async function roboflowGetPublicJson(path: string, context: ApiKeyProviderContext): Promise<unknown> {
  return roboflowRequestJson(new URL(path, roboflowDetectBaseUrl), {
    method: "GET",
    query: {},
    apiKey: "",
    fetcher: context.fetcher,
    phase: "execute",
    includeApiKeyQuery: false,
    signal: context.signal,
  });
}

async function roboflowPostJson(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return roboflowRequestJson(new URL(path, roboflowDetectBaseUrl), {
    method: "POST",
    query: {},
    apiKey: "",
    fetcher: context.fetcher,
    phase: "execute",
    body: JSON.stringify(body),
    contentType: "application/json",
    includeApiKeyQuery: false,
    signal: context.signal,
  });
}

async function roboflowRequestJson(
  url: URL,
  input: {
    method: "GET" | "POST";
    query: Record<string, string | number | undefined>;
    apiKey: string;
    fetcher: typeof fetch;
    phase: "validate" | "execute";
    body?: string;
    contentType?: string;
    includeApiKeyQuery?: boolean;
    signal?: AbortSignal;
  },
): Promise<unknown> {
  if (input.includeApiKeyQuery ?? true) {
    url.searchParams.set("api_key", input.apiKey);
  }
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: roboflowHeaders(input.contentType),
      body: input.body,
      signal: input.signal,
    });
    payload = await readRoboflowPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `roboflow request failed: ${error.message}` : "roboflow request failed",
    );
  }
  if (!response.ok) {
    throw createRoboflowError(response, payload, input.phase);
  }
  return payload;
}

function roboflowHeaders(contentType?: string): Record<string, string> {
  return contentType
    ? { accept: "application/json", "content-type": contentType, "user-agent": providerUserAgent }
    : { accept: "application/json", "user-agent": providerUserAgent };
}

async function readRoboflowPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createRoboflowError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractRoboflowErrorMessage(payload) ?? response.statusText ?? "roboflow request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && [400, 401, 403, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractRoboflowErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.error) ??
        optionalString(record.message) ??
        optionalString(record.detail) ??
        optionalString(record.title))
    : undefined;
}

function extractWorkspace(payload: unknown): string | null {
  const record = optionalRecord(payload);
  return (
    optionalString(record?.workspace) ??
    optionalString(record?.workspace_id) ??
    optionalString(record?.workspaceId) ??
    null
  );
}

function extractProjects(payload: unknown): Array<Record<string, unknown>> {
  const projects = optionalRecord(payload)?.projects;
  if (Array.isArray(projects)) {
    return projects
      .map((project, index) => normalizeProject(project, String(index)))
      .filter((project) => project.id !== null || project.name !== null);
  }
  if (projects && typeof projects === "object") {
    return Object.entries(projects).map(([id, value]) => normalizeProject(value, id));
  }
  return [];
}

function extractProjectRecord(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  return optionalRecord(record?.project) ?? optionalRecord(payload) ?? {};
}

function normalizeProject(project: unknown, fallbackId: string): Record<string, unknown> {
  const record = optionalRecord(project) ?? {};
  return {
    id: optionalString(record.id) ?? optionalString(record.project) ?? optionalString(record.project_id) ?? fallbackId,
    name:
      optionalString(record.name) ?? optionalString(record.project_name) ?? optionalString(record.projectName) ?? null,
    type:
      optionalString(record.type) ?? optionalString(record.project_type) ?? optionalString(record.annotation) ?? null,
    raw: record,
  };
}

function extractVersions(project: unknown): Array<Record<string, unknown>> {
  const versions = optionalRecord(project)?.versions;
  return Array.isArray(versions) ? versions.map(normalizeVersionSummary) : [];
}

function normalizeVersionSummary(version: unknown): Record<string, unknown> {
  const record = optionalRecord(version) ?? {};
  return {
    id: optionalScalarString(record.id) ?? null,
    name: optionalScalarString(record.name) ?? null,
    model: optionalScalarString(record.model ?? record.model_type) ?? null,
    trained: optionalBoolean(record.trained) ?? null,
    raw: record,
  };
}

function normalizeVersionDetail(version: unknown): Record<string, unknown> {
  const record = optionalRecord(version) ?? {};
  return {
    ...normalizeVersionSummary(version),
    exports: readStringArray(record.exports),
  };
}

function normalizeDetectionPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  const image = optionalRecord(record.image);
  return {
    predictions: Array.isArray(record.predictions) ? record.predictions.map(normalizePrediction) : [],
    image: image
      ? {
          width: optionalNumber(image.width) ?? null,
          height: optionalNumber(image.height) ?? null,
        }
      : null,
    timeSeconds: optionalNumber(record.time) ?? null,
    raw: record,
  };
}

function normalizeWorkflowRunPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    outputs: Array.isArray(record.outputs)
      ? objectArray(record.outputs, "outputs", (message) => new ProviderRequestError(502, message))
      : [],
    profilerTrace: Array.isArray(record.profiler_trace)
      ? objectArray(record.profiler_trace, "profiler_trace", (message) => new ProviderRequestError(502, message))
      : null,
    raw: record,
  };
}

function normalizeWorkflowInterfacePayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    inputs: optionalRecord(record.inputs) ?? {},
    outputs: optionalRecord(record.outputs) ?? {},
    typingHints: optionalRecord(record.typing_hints) ?? {},
    kindsSchemas: optionalRecord(record.kinds_schemas) ?? {},
    raw: record,
  };
}

function normalizePrediction(prediction: unknown): Record<string, unknown> {
  const record = optionalRecord(prediction) ?? {};
  return {
    className: optionalScalarString(record.class) ?? null,
    classId: optionalScalarString(record.class_id ?? record.classId) ?? null,
    confidence: optionalNumber(record.confidence) ?? null,
    x: optionalNumber(record.x) ?? null,
    y: optionalNumber(record.y) ?? null,
    width: optionalNumber(record.width) ?? null,
    height: optionalNumber(record.height) ?? null,
    detectionId: optionalScalarString(record.detection_id ?? record.detectionId) ?? null,
    raw: record,
  };
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a number`);
  }
  return value;
}

function requiredInputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function optionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  return stringArray(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => optionalScalarString(item)).filter((item): item is string => item != null)
    : [];
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.roboflow.com",
  auth: { type: "api_key_query", name: "api_key" },
});
