import type { CredentialValidationResult, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "process_street";
const baseUrl = "https://public-api.process.st/api/v1.1";

type ProcessStreetActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const processStreetActionHandlers: Record<string, ProcessStreetActionHandler> = {
  list_workflows: async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
    const response = await get(
      "/workflows",
      { name: optionalString(input.name), _: optionalString(input.cursor) },
      context,
    );
    return {
      workflows: readRecordArray(response.workflows).map(normalizeWorkflow),
      links: normalizeLinks(response.links),
    };
  },
  get_workflow: async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
    const response = await get(
      `/workflows/${encodeURIComponent(requiredInputString(input.workflowId, "workflowId"))}`,
      {},
      context,
    );
    return {
      workflow: normalizeWorkflow(requireRecord(response.data, "Process Street returned an invalid workflow data")),
    };
  },
  create_workflow_run: async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
    const response = await requestProcessStreet({
      path: "/workflow-runs",
      method: "POST",
      params: {},
      body: compactObject({
        workflowId: requiredInputString(input.workflowId, "workflowId"),
        name: optionalString(input.name),
        dueDate: optionalString(input.dueDate),
        shared: optionalBoolean(input.shared),
        referenceId: optionalString(input.referenceId),
      }),
      context,
      phase: "execute",
    });
    return {
      id: requiredResponseString(response.id, "id", "create_workflow_run"),
      links: normalizeLinks(response.links),
      raw: response,
    };
  },
  list_workflow_runs: async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
    const response = await get(
      "/workflow-runs",
      {
        workflowId: optionalString(input.workflowId),
        status: readStringArray(input.status).join(",") || undefined,
        _: optionalString(input.cursor),
      },
      context,
    );
    return {
      workflowRuns: readRecordArray(response.data).map(normalizeWorkflowRun),
      links: normalizeLinks(response.links),
    };
  },
  get_workflow_run: async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => ({
    workflowRun: normalizeWorkflowRun(
      await get(
        `/workflow-runs/${encodeURIComponent(requiredInputString(input.workflowRunId, "workflowRunId"))}`,
        {},
        context,
      ),
    ),
  }),
  list_workflow_tasks: async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
    const response = await get(
      `/workflow-runs/${encodeURIComponent(requiredInputString(input.workflowRunId, "workflowRunId"))}/tasks`,
      { _: optionalString(input.cursor) },
      context,
    );
    return { tasks: readRecordArray(response.tasks).map(normalizeTask), links: normalizeLinks(response.links) };
  },
  update_workflow_task: async (input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> => {
    const workflowRunId = requiredInputString(input.workflowRunId, "workflowRunId");
    const taskId = requiredInputString(input.taskId, "taskId");
    await requestProcessStreet({
      path: `/workflow-runs/${encodeURIComponent(workflowRunId)}/tasks/${encodeURIComponent(taskId)}`,
      method: "PUT",
      params: {},
      body: compactObject({
        status: requiredInputString(input.status, "status"),
        dueDate: optionalString(input.dueDate),
      }),
      context,
      phase: "execute",
      allowEmptyBody: true,
    });
    return { ok: true };
  },
  list_workflow_form_fields: async (
    input: Record<string, unknown>,
    context: ApiKeyProviderContext,
  ): Promise<unknown> => {
    const response = await get(
      `/workflows/${encodeURIComponent(requiredInputString(input.workflowId, "workflowId"))}/form-fields`,
      { _: optionalString(input.cursor) },
      context,
    );
    return { fields: readRecordArray(response.fields).map(normalizeFormField), links: normalizeLinks(response.links) };
  },
  list_workflow_run_form_fields: async (
    input: Record<string, unknown>,
    context: ApiKeyProviderContext,
  ): Promise<unknown> => {
    const response = await get(
      `/workflow-runs/${encodeURIComponent(requiredInputString(input.workflowRunId, "workflowRunId"))}/form-fields`,
      { _: optionalString(input.cursor) },
      context,
    );
    return {
      fields: readRecordArray(response.fields).map(normalizeFormFieldValue),
      links: normalizeLinks(response.links),
    };
  },
  update_workflow_run_form_fields: async (
    input: Record<string, unknown>,
    context: ApiKeyProviderContext,
  ): Promise<unknown> => {
    const response = await requestProcessStreet({
      path: `/workflow-runs/${encodeURIComponent(requiredInputString(input.workflowRunId, "workflowRunId"))}/form-fields`,
      method: "POST",
      params: {},
      body: { fields: readFieldUpdates(input.fields) },
      context,
      phase: "execute",
    });
    return {
      fields: readRecordArray(response.fields).map(normalizeFormFieldValue),
      links: normalizeLinks(response.links),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, processStreetActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
});

export async function validateProcessStreetCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const response = await requestProcessStreet({
    path: "/testAuth",
    method: "GET",
    params: {},
    context: { apiKey, fetcher },
    phase: "validate",
  });
  const apiKeyLabel = requiredResponseString(response.apiKeyLabel, "apiKeyLabel", "validate");
  return {
    profile: { accountId: apiKeyLabel, displayName: apiKeyLabel, grantedScopes: [] },
    grantedScopes: [],
    metadata: { validationEndpoint: "/testAuth", apiKeyLabel },
  };
}

async function get(
  path: string,
  params: Record<string, string | undefined>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  return requestProcessStreet({ path, method: "GET", params, context, phase: "execute" });
}

async function requestProcessStreet(input: {
  path: string;
  method: "GET" | "POST" | "PUT";
  params: Record<string, string | undefined>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
  body?: Record<string, unknown>;
  allowEmptyBody?: boolean;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildUrl(input.path, input.params), {
      method: input.method,
      headers: compactObject({
        accept: "application/json",
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      }) as Record<string, string>,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Process Street request failed: ${error.message}` : "Process Street request failed",
    );
  }
  const payload = await readPayload(response, input.allowEmptyBody === true);
  if (!response.ok) throw createProcessStreetError(response.status, payload, input.phase);
  if (payload === null && input.allowEmptyBody) return {};
  return requireRecord(payload, "Process Street returned an invalid payload");
}

function buildUrl(path: string, params: Record<string, string | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, value);
  return url;
}

async function readPayload(response: Response, allowEmptyBody: boolean): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return allowEmptyBody ? null : null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Process Street returned invalid JSON");
  }
}

function createProcessStreetError(
  status: number,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractMessage(payload) ?? `Process Street request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && (status === 401 || status === 403)) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.errorMessage);
}

function normalizeWorkflow(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredResponseString(raw.id, "id", "normalizeWorkflow"),
    name: nullableString(raw.name),
    description: nullableString(raw.description),
    audit: raw.audit ?? null,
    links: normalizeLinks(raw.links),
    raw,
  };
}

function normalizeWorkflowRun(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredResponseString(raw.id, "id", "normalizeWorkflowRun"),
    workflowId: nullableString(raw.workflowId),
    name: nullableString(raw.name),
    status: nullableString(raw.status),
    shared: nullableBoolean(raw.shared),
    migrationStatus: nullableString(raw.migrationStatus),
    dueDate: nullableString(raw.dueDate),
    audit: raw.audit ?? null,
    links: normalizeLinks(raw.links),
    raw,
  };
}

function normalizeTask(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredResponseString(raw.id, "id", "normalizeTask"),
    workflowRunId: nullableString(raw.workflowRunId),
    status: nullableString(raw.status),
    name: nullableString(raw.name),
    hidden: nullableBoolean(raw.hidden),
    stopped: nullableBoolean(raw.stopped),
    taskType: nullableString(raw.taskType),
    dueDate: nullableString(raw.dueDate),
    completedDate: nullableString(raw.completedDate),
    updatedDate: nullableString(raw.updatedDate),
    updatedBy: normalizeUser(raw.updatedBy),
    completedBy: normalizeUser(raw.completedBy),
    links: normalizeLinks(raw.links),
    raw,
  };
}

function normalizeFormField(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredResponseString(raw.id, "id", "normalizeFormField"),
    taskId: nullableString(raw.taskId),
    key: nullableString(raw.key),
    label: nullableString(raw.label),
    fieldType: nullableString(raw.fieldType),
    dataSetLinked: nullableBoolean(raw.dataSetLinked),
    audit: raw.audit ?? null,
    raw,
  };
}

function normalizeFormFieldValue(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    id: requiredResponseString(raw.id, "id", "normalizeFormFieldValue"),
    workflowRunId: nullableString(raw.workflowRunId),
    taskId: nullableString(raw.taskId),
    key: nullableString(raw.key),
    label: nullableString(raw.label),
    fieldType: nullableString(raw.fieldType),
    data: raw.data ?? null,
    dataSetLinked: nullableBoolean(raw.dataSetLinked),
    updatedDate: nullableString(raw.updatedDate),
    updatedBy: normalizeUser(raw.updatedBy),
    links: normalizeLinks(raw.links),
    raw,
  };
}

function normalizeUser(value: unknown): Record<string, string> | null {
  const record = optionalRecord(value);
  if (!record) return null;
  return {
    id: requiredResponseString(record.id, "id", "normalizeUser"),
    email: requiredResponseString(record.email, "email", "normalizeUser"),
    username: requiredResponseString(record.username, "username", "normalizeUser"),
  };
}

function normalizeLinks(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(optionalRecord).filter((item): item is Record<string, unknown> => item != null)
    : [];
}

function readFieldUpdates(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new ProviderRequestError(400, "fields must be an array");
  return value.map((item) => {
    const record = requireRecord(item, "Process Street field update");
    return compactObject({
      id: requiredInputString(record.id, "fields[].id"),
      value: optionalString(record.value),
      values: Array.isArray(record.values) ? record.values.map(String) : undefined,
      timeHidden: optionalBoolean(record.timeHidden),
      dataSetRowId: optionalString(record.dataSetRowId),
    });
  });
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message, value);
  return record;
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(optionalRecord).filter((item): item is Record<string, unknown> => item != null)
    : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredResponseString(value: unknown, fieldName: string, context: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Process Street ${context} response is missing required field: ${fieldName}`),
  );
}

function nullableString(value: unknown): string | null {
  return value === null ? null : (optionalString(value) ?? null);
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
