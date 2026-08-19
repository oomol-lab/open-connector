import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const clockifyApiBaseUrl = "https://api.clockify.me/api/v1";

type ClockifyRequestPhase = "validate" | "execute";
type ClockifyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const clockifyActionHandlers: ProviderActionHandlers<"clockify", ClockifyActionHandler> = {
  get_current_user(input, context) {
    return getCurrentUser(input, context);
  },
  list_workspaces(input, context) {
    return listWorkspaces(input, context);
  },
  get_workspace(input, context) {
    return getWorkspace(input, context);
  },
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  create_project(input, context) {
    return createProject(input, context);
  },
  update_project(input, context) {
    return updateProject(input, context);
  },
  delete_project(input, context) {
    return deleteProject(input, context);
  },
  list_tasks(input, context) {
    return listTasks(input, context);
  },
  create_task(input, context) {
    return createTask(input, context);
  },
  list_time_entries(input, context) {
    return listTimeEntries(input, context);
  },
  create_time_entry(input, context) {
    return createTimeEntry(input, context);
  },
};

export async function validateClockifyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey,
    path: "/user",
    fetcher,
    signal,
    phase: "validate",
  });
  const user = requireObjectPayload(payload, "clockify user response");
  const userId = requireInputString(user.id, "id");
  const activeWorkspace = optionalString(user.activeWorkspace);

  return {
    profile: {
      accountId: userId,
      displayName: optionalString(user.name) ?? optionalString(user.email) ?? "Clockify User",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: clockifyApiBaseUrl,
      validationEndpoint: "/user",
      userId,
      email: optionalString(user.email),
      activeWorkspace,
      defaultWorkspace: optionalString(user.defaultWorkspace),
    }),
  };
}

async function getCurrentUser(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/user",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    user: requireObjectPayload(payload, "clockify user response"),
  };
}

async function listWorkspaces(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { payload } = await requestClockifyJson<unknown[]>({
    apiKey: context.apiKey,
    path: "/workspaces",
    query: buildQueryParams(input, ["roles"]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    workspaces: requireArrayPayload(payload, "clockify workspace list response"),
  };
}

async function getWorkspace(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    workspace: requireObjectPayload(payload, "clockify workspace response"),
  };
}

async function listProjects(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const response = await requestClockifyJson<unknown[]>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/projects`,
    query: buildQueryParams(input, [
      "name",
      "page",
      "users",
      "clients",
      "archived",
      "billable",
      "hydrated",
      "page-size",
      "sort-order",
      "is-template",
      "sort-column",
      "user-status",
      "client-status",
      "contains-users",
      "contains-client",
    ]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    projects: requireArrayPayload(response.payload, "clockify project list response"),
    pagination: buildPagination(input, response.response),
  };
}

async function getProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const projectId = requireInputString(input.projectId, "projectId");
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`,
    query: buildQueryParams(input, ["hydrated"]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    project: requireObjectPayload(payload, "clockify project response"),
  };
}

async function createProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/projects`,
    method: "POST",
    body: buildProjectBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    project: requireObjectPayload(payload, "clockify project creation response"),
  };
}

async function updateProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  assertHasAnyField(
    input,
    ["name", "note", "color", "isPublic", "archived", "billable", "clientId", "costRate", "hourlyRate"],
    "update_project",
  );
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const projectId = requireInputString(input.projectId, "projectId");
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`,
    method: "PUT",
    body: buildProjectBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    project: requireObjectPayload(payload, "clockify project update response"),
  };
}

async function deleteProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const projectId = requireInputString(input.projectId, "projectId");
  await requestClockifyJson({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    deleted: true,
  };
}

async function listTasks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const projectId = requireInputString(input.projectId, "projectId");
  const response = await requestClockifyJson<unknown[]>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/tasks`,
    query: buildQueryParams(input, [
      "name",
      "page",
      "is-active",
      "page-size",
      "sort-order",
      "sort-column",
      "strict-name-search",
    ]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    tasks: requireArrayPayload(response.payload, "clockify task list response"),
    pagination: buildPagination(input, response.response),
  };
}

async function createTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const projectId = requireInputString(input.projectId, "projectId");
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/tasks`,
    method: "POST",
    body: buildTaskBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    task: requireObjectPayload(payload, "clockify task creation response"),
  };
}

async function listTimeEntries(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const userId = requireInputString(input.userId, "userId");
  const response = await requestClockifyJson<unknown[]>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/user/${encodeURIComponent(userId)}/time-entries`,
    query: buildQueryParams(input, [
      "start",
      "end",
      "page",
      "tags",
      "task",
      "project",
      "hydrated",
      "page-size",
      "description",
      "in-progress",
    ]),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    time_entries: requireArrayPayload(response.payload, "clockify time entry list response"),
    pagination: buildPagination(input, response.response),
  };
}

async function createTimeEntry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputString(input.workspaceId, "workspaceId");
  const userId = requireInputString(input.userId, "userId");
  const { payload } = await requestClockifyJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: `/workspaces/${encodeURIComponent(workspaceId)}/user/${encodeURIComponent(userId)}/time-entries`,
    method: "POST",
    body: buildTimeEntryBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    time_entry: requireObjectPayload(payload, "clockify time entry creation response"),
  };
}

async function requestClockifyJson<T>(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: ClockifyRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}): Promise<{ payload: T; response: Response }> {
  const response = await clockifyFetch(input);
  const payload = await readClockifyPayload(response);
  if (!response.ok) {
    throw createClockifyError(response, payload, input.phase);
  }
  return {
    payload: payload as T,
    response,
  };
}

async function clockifyFetch(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}): Promise<Response> {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${clockifyApiBaseUrl}/`);
  if (input.query && Array.from(input.query.keys()).length > 0) {
    url.search = input.query.toString();
  }

  try {
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: clockifyHeaders(input.apiKey, input.body != null),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Clockify request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }
}

function clockifyHeaders(apiKey: string, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    "x-api-key": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (hasJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readClockifyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createClockifyError(response: Response, payload: unknown, phase: ClockifyRequestPhase): ProviderRequestError {
  const message = readClockifyErrorMessage(payload) ?? `Clockify request failed with status ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message);
  }
  return new ProviderRequestError(response.status, message);
}

function readClockifyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    return undefined;
  }
  const directMessage =
    optionalString(objectPayload.message) ?? optionalString(objectPayload.error) ?? optionalString(objectPayload.title);
  if (directMessage) {
    return directMessage;
  }
  const nestedError = optionalRecord(objectPayload.error);
  return (
    optionalString(nestedError?.message) ?? optionalString(nestedError?.details) ?? optionalString(objectPayload.code)
  );
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    throw new ProviderRequestError(502, `${label} was not a JSON object`);
  }
  return objectPayload;
}

function requireArrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} was not a JSON array`);
  }
  return payload;
}

function requireInputString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function buildQueryParams(input: Record<string, unknown>, keys: string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, String(item));
      }
      continue;
    }
    query.set(key, String(value));
  }
  return query;
}

function buildProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    note: typeof input.note === "string" ? input.note : undefined,
    color: optionalString(input.color),
    billable: optionalBoolean(input.billable),
    archived: optionalBoolean(input.archived),
    clientId: optionalString(input.clientId),
    estimate: optionalRecord(input.estimate),
    costRate: optionalRecord(input.costRate),
    hourlyRate: optionalRecord(input.hourlyRate),
    isPublic: optionalBoolean(input.isPublic),
  });
}

function buildTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    status: optionalString(input.status),
    billable: optionalBoolean(input.billable),
    estimate: optionalString(input.estimate),
    assigneeIds: Array.isArray(input.assigneeIds) ? input.assigneeIds : undefined,
  });
}

function buildTimeEntryBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    start: optionalString(input.start),
    end: optionalString(input.end),
    projectId: optionalString(input.projectId),
    taskId: optionalString(input.taskId),
    description: typeof input.description === "string" ? input.description : undefined,
    billable: optionalBoolean(input.billable),
    tagIds: Array.isArray(input.tagIds) ? input.tagIds : undefined,
    customFieldValues: Array.isArray(input.customFieldValues) ? input.customFieldValues : undefined,
  });
}

function buildPagination(input: Record<string, unknown>, response: Response): Record<string, unknown> | null {
  const currentPage = optionalInteger(input.page);
  const currentPageSize = optionalInteger(input["page-size"]);
  const lastPage = readLastPageHeader(response);
  if (currentPage === undefined && currentPageSize === undefined && lastPage === null) {
    return null;
  }
  return {
    page: currentPage,
    page_size: currentPageSize,
    last_page: lastPage,
  };
}

function readLastPageHeader(response: Response): boolean | null {
  const headerValue = response.headers.get("last-page") ?? response.headers.get("Last-Page");
  if (headerValue === "true") {
    return true;
  }
  if (headerValue === "false") {
    return false;
  }
  return null;
}

function assertHasAnyField(input: Record<string, unknown>, fields: string[], actionName: string): void {
  if (!fields.some((field) => input[field] !== undefined)) {
    throw new ProviderRequestError(400, `${actionName} requires at least one writable field`);
  }
}
