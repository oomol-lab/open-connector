import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const n8nValidationPath = "/discover";
const n8nCredentialHelpUrl = "https://docs.n8n.io/api/authentication/";

type N8nRequestMode = "validate" | "execute";
type N8nHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type N8nActionHandler = (input: Record<string, unknown>, context: N8nActionContext) => Promise<unknown>;

export interface N8nActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface N8nRequestOptions {
  context: N8nActionContext;
  path: string;
  mode: N8nRequestMode;
  method?: N8nHttpMethod;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

export const n8nActionHandlers: ProviderActionHandlers<"n8n", N8nActionHandler> = {
  list_workflows(input, context) {
    return requestN8nJson({
      context,
      path: "/workflows",
      query: buildWorkflowListQuery(input),
      mode: "execute",
    });
  },
  get_workflow(input, context) {
    const workflowId = requireInputString(input.workflowId, "workflowId");
    return requestN8nJson({
      context,
      path: `/workflows/${encodeURIComponent(workflowId)}`,
      query: compactObject({
        excludePinnedData: optionalBoolean(input.excludePinnedData),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  activate_workflow(input, context) {
    const workflowId = requireInputString(input.workflowId, "workflowId");
    return requestN8nJson({
      context,
      path: `/workflows/${encodeURIComponent(workflowId)}/activate`,
      method: "POST",
      body: buildActivateWorkflowBody(input),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  deactivate_workflow(input, context) {
    return workflowCommand(input, context, "deactivate");
  },
  archive_workflow(input, context) {
    return workflowCommand(input, context, "archive");
  },
  unarchive_workflow(input, context) {
    return workflowCommand(input, context, "unarchive");
  },
  list_executions(input, context) {
    return requestN8nJson({
      context,
      path: "/executions",
      query: buildExecutionListQuery(input),
      mode: "execute",
    });
  },
  get_execution(input, context) {
    const executionId = requireNumberId(input.executionId, "executionId");
    return requestN8nJson({
      context,
      path: `/executions/${executionId}`,
      query: compactObject({
        includeData: optionalBoolean(input.includeData),
        redactExecutionData: optionalBoolean(input.redactExecutionData),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  retry_execution(input, context) {
    const executionId = requireNumberId(input.executionId, "executionId");
    return requestN8nJson({
      context,
      path: `/executions/${executionId}/retry`,
      method: "POST",
      body: compactObject({
        loadWorkflow: optionalBoolean(input.loadWorkflow),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  stop_execution(input, context) {
    const executionId = requireNumberId(input.executionId, "executionId");
    return requestN8nJson({
      context,
      path: `/executions/${executionId}/stop`,
      method: "POST",
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  list_tags(input, context) {
    return requestN8nJson({
      context,
      path: "/tags",
      query: buildPaginationQuery(input),
      mode: "execute",
    });
  },
  create_tag(input, context) {
    return requestN8nJson({
      context,
      path: "/tags",
      method: "POST",
      body: {
        name: requireInputString(input.name, "name"),
      },
      mode: "execute",
    });
  },
  update_tag(input, context) {
    const tagId = requireInputString(input.tagId, "tagId");
    return requestN8nJson({
      context,
      path: `/tags/${encodeURIComponent(tagId)}`,
      method: "PUT",
      body: {
        name: requireInputString(input.name, "name"),
      },
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  delete_tag(input, context) {
    const tagId = requireInputString(input.tagId, "tagId");
    return requestN8nJson({
      context,
      path: `/tags/${encodeURIComponent(tagId)}`,
      method: "DELETE",
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  async get_workflow_tags(input, context) {
    const workflowId = requireInputString(input.workflowId, "workflowId");
    return {
      tags: await requestN8nJson({
        context,
        path: `/workflows/${encodeURIComponent(workflowId)}/tags`,
        mode: "execute",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async update_workflow_tags(input, context) {
    const workflowId = requireInputString(input.workflowId, "workflowId");
    return {
      tags: await requestN8nJson({
        context,
        path: `/workflows/${encodeURIComponent(workflowId)}/tags`,
        method: "PUT",
        body: buildTagIdsBody(input.tagIds),
        mode: "execute",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async get_execution_tags(input, context) {
    const executionId = requireNumberId(input.executionId, "executionId");
    return {
      tags: await requestN8nJson({
        context,
        path: `/executions/${executionId}/tags`,
        mode: "execute",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  async update_execution_tags(input, context) {
    const executionId = requireNumberId(input.executionId, "executionId");
    return {
      tags: await requestN8nJson({
        context,
        path: `/executions/${executionId}/tags`,
        method: "PUT",
        body: buildTagIdsBody(input.tagIds),
        mode: "execute",
        notFoundAsInvalidInput: true,
      }),
    };
  },
  list_variables(input, context) {
    return requestN8nJson({
      context,
      path: "/variables",
      query: buildVariableListQuery(input),
      mode: "execute",
    });
  },
  async create_variable(input, context) {
    const body = compactObject({
      key: requireInputString(input.key, "key"),
      value: requireInputString(input.value, "value"),
      projectId: optionalString(input.projectId),
    });
    const payload = await requestN8nJson({
      context,
      path: "/variables",
      method: "POST",
      body,
      mode: "execute",
    });
    return withFallbackObject(payload, body);
  },
  async update_variable(input, context) {
    const variableId = requireInputString(input.variableId, "variableId");
    const body = {
      key: requireInputString(input.key, "key"),
      value: requireInputString(input.value, "value"),
    };
    const payload = await requestN8nJson({
      context,
      path: `/variables/${encodeURIComponent(variableId)}`,
      method: "PUT",
      body,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return withFallbackObject(payload, {
      id: variableId,
      ...body,
    });
  },
  async delete_variable(input, context) {
    const variableId = requireInputString(input.variableId, "variableId");
    const payload = await requestN8nJson({
      context,
      path: `/variables/${encodeURIComponent(variableId)}`,
      method: "DELETE",
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return withFallbackObject(payload, { id: variableId });
  },
  list_data_tables(input, context) {
    return requestN8nJson({
      context,
      path: "/data-tables",
      query: buildDataTableListQuery(input),
      mode: "execute",
    });
  },
  create_data_table(input, context) {
    return requestN8nJson({
      context,
      path: "/data-tables",
      method: "POST",
      body: compactObject({
        name: requireInputString(input.name, "name"),
        columns: requireArray(input.columns, "columns"),
        projectId: optionalString(input.projectId),
      }),
      mode: "execute",
    });
  },
  get_data_table(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  update_data_table(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}`,
      method: "PATCH",
      body: {
        name: requireInputString(input.name, "name"),
      },
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  async delete_data_table(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    const payload = await requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}`,
      method: "DELETE",
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return withFallbackObject(payload, { id: dataTableId });
  },
  list_data_table_columns(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/columns`,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  create_data_table_column(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/columns`,
      method: "POST",
      body: compactObject({
        name: requireInputString(input.name, "name"),
        type: requireInputString(input.type, "type"),
        index: optionalInteger(input.index),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  update_data_table_column(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    const columnId = requireInputString(input.columnId, "columnId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/columns/${encodeURIComponent(columnId)}`,
      method: "PATCH",
      body: compactObject({
        name: optionalString(input.name),
        index: optionalInteger(input.index),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  async delete_data_table_column(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    const columnId = requireInputString(input.columnId, "columnId");
    const payload = await requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/columns/${encodeURIComponent(columnId)}`,
      method: "DELETE",
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return withFallbackObject(payload, { id: columnId });
  },
  list_data_table_rows(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/rows`,
      query: buildDataTableRowsQuery(input),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  insert_data_table_rows(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/rows`,
      method: "POST",
      body: compactObject({
        data: requireArray(input.data, "data"),
        returnType: optionalString(input.returnType),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  update_data_table_rows(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/rows/update`,
      method: "PATCH",
      body: compactObject({
        filter: input.filter,
        data: input.data,
        returnData: optionalBoolean(input.returnData),
        dryRun: optionalBoolean(input.dryRun),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  upsert_data_table_row(input, context) {
    const dataTableId = requireInputString(input.dataTableId, "dataTableId");
    return requestN8nJson({
      context,
      path: `/data-tables/${encodeURIComponent(dataTableId)}/rows/upsert`,
      method: "POST",
      body: compactObject({
        filter: input.filter,
        data: input.data,
        returnData: optionalBoolean(input.returnData),
        dryRun: optionalBoolean(input.dryRun),
      }),
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
  },
  get_insights_summary(input, context) {
    return requestN8nJson({
      context,
      path: "/insights/summary",
      query: compactObject({
        startDate: optionalString(input.startDate),
        endDate: optionalString(input.endDate),
        projectId: optionalString(input.projectId),
      }),
      mode: "execute",
    });
  },
};

export function createN8nActionContext(
  credential: Extract<ResolvedCredential, { authType: "api_key" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): N8nActionContext {
  return {
    apiKey: credential.apiKey,
    apiBaseUrl: resolveN8nApiBaseUrl(credential),
    fetcher,
    signal,
  };
}

export async function validateN8nCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const instanceUrl = normalizeN8nInstanceUrl(input.values.instanceUrl);
  validatePublicN8nInstanceUrl(instanceUrl);
  const apiBaseUrl = buildN8nApiBaseUrl(instanceUrl);
  await requestN8nJson({
    context: {
      apiKey: input.apiKey,
      apiBaseUrl,
      fetcher,
      signal,
    },
    path: n8nValidationPath,
    mode: "validate",
  });
  const host = new URL(instanceUrl).host;

  return {
    profile: {
      accountId: `n8n:${instanceUrl}`,
      displayName: `n8n ${host}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      instanceUrl,
      apiBaseUrl,
      validationEndpoint: n8nValidationPath,
      credentialHelpUrl: n8nCredentialHelpUrl,
    }),
  };
}

/**
 * Normalize a user-supplied n8n instance URL to its canonical origin (+ base path)
 * form and reject unsafe targets.
 *
 * `allowPrivateNetwork` defaults to the deployment opt-in and may be passed
 * explicitly to pin the policy. With it off, public instances require HTTPS.
 * With it on, a self-hosted instance may be a plain-HTTP LAN/overlay target.
 * The shared guard decides which hosts are safe in both modes.
 */
export function normalizeN8nInstanceUrl(
  input?: string,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const raw = input?.trim();
  if (!raw) {
    throw providerInputError("instanceUrl is required");
  }

  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw providerInputError("instanceUrl must be a valid URL");
  }

  // Checked ahead of the shared guard so a non-HTTP scheme keeps reporting the
  // n8n-specific message instead of the guard's generic "must use http or https".
  assertN8nInstanceProtocol(parsed, allowPrivateNetwork);
  if (parsed.username || parsed.password) {
    throw providerInputError("instanceUrl must not include URL credentials");
  }
  if (!parsed.hostname) {
    throw providerInputError("instanceUrl must include a host");
  }
  parsed = assertN8nInstanceTarget(parsed.href, allowPrivateNetwork);

  parsed.hash = "";
  parsed.search = "";
  const pathname = trimTrailingSlash(parsed.pathname);
  if (pathname === "/api/v1") {
    parsed.pathname = "/";
  } else if (pathname.endsWith("/api/v1")) {
    parsed.pathname = pathname.slice(0, pathname.length - "/api/v1".length) || "/";
  } else {
    parsed.pathname = pathname || "/";
  }

  const normalizedPath = trimTrailingSlash(parsed.pathname);
  if (!normalizedPath || normalizedPath === "/") {
    return parsed.origin;
  }
  return `${parsed.origin}${normalizedPath}`;
}

export function buildN8nApiBaseUrl(instanceUrl: string): string {
  return `${trimTrailingSlash(instanceUrl)}/api/v1`;
}

function workflowCommand(
  input: Record<string, unknown>,
  context: N8nActionContext,
  command: "deactivate" | "archive" | "unarchive",
): Promise<unknown> {
  const workflowId = requireInputString(input.workflowId, "workflowId");
  return requestN8nJson({
    context,
    path: `/workflows/${encodeURIComponent(workflowId)}/${command}`,
    method: "POST",
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
}

function buildWorkflowListQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  const tags = readOptionalStringArray(input.tags);
  return compactObject({
    active: optionalBoolean(input.active),
    tags: tags ? tags.join(",") : undefined,
    name: optionalString(input.name),
    projectId: optionalString(input.projectId),
    excludePinnedData: optionalBoolean(input.excludePinnedData),
    ...buildPaginationQuery(input),
  });
}

function buildExecutionListQuery(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  return compactObject({
    includeData: optionalBoolean(input.includeData),
    redactExecutionData: optionalBoolean(input.redactExecutionData),
    status: optionalString(input.status),
    workflowId: optionalString(input.workflowId),
    projectId: optionalString(input.projectId),
    ...buildPaginationQuery(input),
  });
}

function buildVariableListQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    projectId: optionalString(input.projectId),
    state: optionalString(input.state),
    ...buildPaginationQuery(input),
  });
}

function buildDataTableListQuery(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  return compactObject({
    filter: stringifyOptionalObject(input.filter),
    sortBy: optionalString(input.sortBy),
    ...buildPaginationQuery(input),
  });
}

function buildDataTableRowsQuery(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  return compactObject({
    filter: stringifyOptionalObject(input.filter),
    sortBy: optionalString(input.sortBy),
    search: optionalString(input.search),
    ...buildPaginationQuery(input),
  });
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
  });
}

function buildActivateWorkflowBody(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const body = compactObject({
    versionId: optionalString(input.versionId),
    name: optionalString(input.name),
    description: optionalString(input.description),
  });
  return Object.keys(body).length > 0 ? body : undefined;
}

function buildTagIdsBody(value: unknown): Array<{ id: string }> {
  return readOptionalStringArray(value)?.map((id) => ({ id })) ?? [];
}

function stringifyOptionalObject(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  return JSON.stringify(value);
}

async function requestN8nJson(input: N8nRequestOptions): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await n8nFetch(input);
    payload = await readN8nPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `n8n request failed: ${error.message}` : "n8n request failed",
    );
  }

  if (!response.ok) {
    throw createN8nError(response, payload, input.mode, input.notFoundAsInvalidInput);
  }

  return payload;
}

function n8nFetch(input: N8nRequestOptions): Promise<Response> {
  const url = buildN8nUrl(input.context.apiBaseUrl, input.path);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  validatePublicN8nInstanceUrl(url.toString());
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-n8n-api-key": input.context.apiKey,
  });
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return input.context.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    redirect: "manual",
    signal: input.context.signal,
  });
}

async function readN8nPayload(response: Response): Promise<unknown> {
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

function createN8nError(
  response: Response,
  payload: unknown,
  mode: N8nRequestMode,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message =
    extractN8nErrorMessage(payload) ?? response.statusText ?? `n8n request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 409) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractN8nErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.message) ?? optionalString(object.error);
}

export function resolveN8nApiBaseUrl(credential: Extract<ResolvedCredential, { authType: "api_key" }>): string {
  const apiBaseUrl = optionalString(credential.metadata.apiBaseUrl);
  if (apiBaseUrl) {
    return buildN8nApiBaseUrl(normalizeN8nInstanceUrl(apiBaseUrl));
  }

  const instanceUrl = optionalString(credential.values.instanceUrl) ?? optionalString(credential.metadata.instanceUrl);
  if (!instanceUrl) {
    throw new ProviderRequestError(401, "n8n connection is missing instanceUrl.");
  }
  return buildN8nApiBaseUrl(normalizeN8nInstanceUrl(instanceUrl));
}

function buildN8nUrl(apiBaseUrl: string, path: string): URL {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const relative = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relative, base);
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function requireNumberId(value: unknown, fieldName: string): string {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw providerInputError(`${fieldName} must be an integer`);
  }
  return String(parsed);
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw providerInputError(`${fieldName} must be an array`);
  }
  return value;
}

function withFallbackObject(payload: unknown, fallback: Record<string, unknown>): Record<string, unknown> {
  if (isPlainObject(payload)) {
    return payload;
  }
  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function validatePublicN8nInstanceUrl(instanceUrl: string): void {
  assertN8nInstanceTarget(instanceUrl, isPrivateNetworkAccessAllowed());
}

/**
 * Apply the shared SSRF egress policy to one n8n URL and return the guard's
 * normalized URL.
 *
 * The shared guard validates both the URL literal and its resolved addresses.
 */
function assertN8nInstanceTarget(value: string, allowPrivateNetwork: boolean): URL {
  const parsed = assertPublicHttpUrl(value, {
    fieldName: "instanceUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  assertN8nInstanceProtocol(parsed, allowPrivateNetwork);
  return parsed;
}

/**
 * n8n Cloud and any internet-exposed instance must be HTTPS. A self-hosted LAN or
 * overlay-network instance usually terminates plain HTTP, so `http:` is accepted
 * only under the deployment private-network opt-in.
 */
function assertN8nInstanceProtocol(url: URL, allowPrivateNetwork: boolean): void {
  if (url.protocol === "https:" || (url.protocol === "http:" && allowPrivateNetwork)) {
    return;
  }
  throw providerInputError("instanceUrl must use https");
}
