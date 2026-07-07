import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { TogglActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const togglApiBaseUrl: string = "https://api.track.toggl.com/api/v9";
const defaultCreatedWith = "oomol-connect";

type TogglRequestPhase = "validate" | "execute";

export const togglActionHandlers: Record<TogglActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_workspaces(_input, context) {
    return listWorkspaces(context);
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
  get_task(input, context) {
    return getTask(input, context);
  },
  create_task(input, context) {
    return createTask(input, context);
  },
  update_task(input, context) {
    return updateTask(input, context);
  },
  delete_task(input, context) {
    return deleteTask(input, context);
  },
  list_tags(input, context) {
    return listTags(input, context);
  },
  create_tag(input, context) {
    return createTag(input, context);
  },
  update_tag(input, context) {
    return updateTag(input, context);
  },
  delete_tag(input, context) {
    return deleteTag(input, context);
  },
  list_time_entries(input, context) {
    return listTimeEntries(input, context);
  },
  get_current_time_entry(_input, context) {
    return getCurrentTimeEntry(context);
  },
  get_time_entry(input, context) {
    return getTimeEntry(input, context);
  },
  create_time_entry(input, context) {
    return createTimeEntry(input, context);
  },
  update_time_entry(input, context) {
    return updateTimeEntry(input, context);
  },
  stop_time_entry(input, context) {
    return stopTimeEntry(input, context);
  },
  delete_time_entry(input, context) {
    return deleteTimeEntry(input, context);
  },
};

export async function validateTogglCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestTogglJson<Record<string, unknown>>({
    apiKey,
    path: "/me",
    fetcher,
    signal,
    phase: "validate",
  });
  const user = sanitizeTogglUser(requireObjectPayload(payload, "toggl user response"));
  const userId = requireInputInteger(user.id, "id");
  return {
    profile: {
      accountId: String(userId),
      displayName: optionalString(user.fullname) ?? optionalString(user.email) ?? "Toggl Track User",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: togglApiBaseUrl,
      validationEndpoint: "/me",
      userId,
      email: optionalString(user.email),
      defaultWorkspaceId: optionalInteger(user.default_workspace_id),
      timezone: optionalString(user.timezone),
    }),
  };
}

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: "/me",
  });
  return { user: sanitizeTogglUser(requireObjectPayload(payload, "toggl user response")) };
}

async function listWorkspaces(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTogglJson<unknown[]>({ ...requestContext(context), path: "/me/workspaces" });
  return { workspaces: requireArrayPayload(payload, "toggl workspace list response") };
}

async function getWorkspace(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}`,
  });
  return { workspace: requireObjectPayload(payload, "toggl workspace response") };
}

async function listProjects(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const payload = await requestTogglJson<unknown[]>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects`,
    query: buildProjectListQuery(input),
  });
  return { projects: requireArrayPayload(payload, "toggl project list response") };
}

async function getProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}`,
  });
  return { project: requireObjectPayload(payload, "toggl project response") };
}

async function createProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects`,
    method: "POST",
    body: buildProjectBody(input),
  });
  return { project: requireObjectPayload(payload, "toggl project creation response") };
}

async function updateProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}`,
    method: "PUT",
    body: buildProjectBody(input),
  });
  return { project: requireObjectPayload(payload, "toggl project update response") };
}

async function deleteProject(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  await requestTogglJson({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}`,
    method: "DELETE",
  });
  return { deleted: true };
}

async function listTasks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  const payload = await requestTogglJson<unknown[]>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}/tasks`,
    query: buildTaskListQuery(input),
  });
  return { tasks: requireArrayPayload(payload, "toggl task list response") };
}

async function getTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  const taskId = requireInputInteger(input.taskId, "taskId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
  });
  return { task: requireObjectPayload(payload, "toggl task response") };
}

async function createTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}/tasks`,
    method: "POST",
    body: buildTaskBody(input),
  });
  return { task: requireObjectPayload(payload, "toggl task creation response") };
}

async function updateTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  const taskId = requireInputInteger(input.taskId, "taskId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
    method: "PUT",
    body: buildTaskBody(input),
  });
  return { task: requireObjectPayload(payload, "toggl task update response") };
}

async function deleteTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const projectId = requireInputInteger(input.projectId, "projectId");
  const taskId = requireInputInteger(input.taskId, "taskId");
  await requestTogglJson({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
    method: "DELETE",
  });
  return { deleted: true };
}

async function listTags(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const payload = await requestTogglJson<unknown[]>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/tags`,
    query: buildTagListQuery(input),
  });
  return { tags: requireArrayPayload(payload, "toggl tag list response") };
}

async function createTag(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/tags`,
    method: "POST",
    body: { name: requireInputString(input.name, "name") },
  });
  return { tag: requireObjectPayload(payload, "toggl tag creation response") };
}

async function updateTag(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const tagId = requireInputInteger(input.tagId, "tagId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/tags/${tagId}`,
    method: "PUT",
    body: { name: requireInputString(input.name, "name") },
  });
  return { tag: requireObjectPayload(payload, "toggl tag update response") };
}

async function deleteTag(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const tagId = requireInputInteger(input.tagId, "tagId");
  await requestTogglJson({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/tags/${tagId}`,
    method: "DELETE",
  });
  return { deleted: true };
}

async function listTimeEntries(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTogglJson<unknown[]>({
    ...requestContext(context),
    path: "/me/time_entries",
    query: buildTimeEntryListQuery(input),
  });
  return { time_entries: requireArrayPayload(payload, "toggl time entry list response") };
}

async function getCurrentTimeEntry(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestTogglJson<Record<string, unknown> | null>({
    ...requestContext(context),
    path: "/me/time_entries/current",
  });
  return { time_entry: payload == null ? null : requireObjectPayload(payload, "toggl current time entry response") };
}

async function getTimeEntry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const timeEntryId = requireInputInteger(input.timeEntryId, "timeEntryId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/me/time_entries/${timeEntryId}`,
  });
  return { time_entry: requireObjectPayload(payload, "toggl time entry response") };
}

async function createTimeEntry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/time_entries`,
    method: "POST",
    body: buildTimeEntryBody(input, true),
  });
  return { time_entry: requireObjectPayload(payload, "toggl time entry creation response") };
}

async function updateTimeEntry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const timeEntryId = requireInputInteger(input.timeEntryId, "timeEntryId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/time_entries/${timeEntryId}`,
    method: "PUT",
    body: buildTimeEntryBody(input, false),
  });
  return { time_entry: requireObjectPayload(payload, "toggl time entry update response") };
}

async function stopTimeEntry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const timeEntryId = requireInputInteger(input.timeEntryId, "timeEntryId");
  const payload = await requestTogglJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/time_entries/${timeEntryId}/stop`,
    method: "PATCH",
  });
  return { time_entry: requireObjectPayload(payload, "toggl stopped time entry response") };
}

async function deleteTimeEntry(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const workspaceId = requireInputInteger(input.workspaceId, "workspaceId");
  const timeEntryId = requireInputInteger(input.timeEntryId, "timeEntryId");
  await requestTogglJson({
    ...requestContext(context),
    path: `/workspaces/${workspaceId}/time_entries/${timeEntryId}`,
    method: "DELETE",
  });
  return { deleted: true };
}

async function requestTogglJson<T>(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: TogglRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}): Promise<T> {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${togglApiBaseUrl}/`);
  if (input.query && Array.from(input.query.keys()).length > 0) {
    url.search = input.query.toString();
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: togglHeaders(input.apiKey, input.body != null),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `toggl request failed: ${error.message}` : "toggl request failed",
    );
  }
  const payload = await readTogglPayload(response);
  if (!response.ok) {
    throw createTogglError(response, payload, input.phase);
  }
  return payload as T;
}

function requestContext(context: ApiKeyProviderContext): {
  apiKey: string;
  fetcher: typeof fetch;
  phase: "execute";
  signal?: AbortSignal;
} {
  return {
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  };
}

function togglHeaders(apiKey: string, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    Authorization: buildTogglAuthorizationHeader(apiKey),
    Accept: "application/json",
    "User-Agent": providerUserAgent,
  });
  if (hasJsonBody) headers.set("Content-Type", "application/json");
  return headers;
}

export function buildTogglAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:api_token`).toString("base64")}`;
}

async function readTogglPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTogglError(response: Response, payload: unknown, phase: TogglRequestPhase): ProviderRequestError {
  const message = readTogglErrorMessage(payload) ?? `toggl request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403)
    return new ProviderRequestError(response.status, message, payload);
  if (response.status === 404) return new ProviderRequestError(404, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (response.status >= 500) return new ProviderRequestError(502, message, payload);
  if (phase === "validate") return new ProviderRequestError(response.status, message, payload);
  return new ProviderRequestError(response.status, message, payload);
}

function readTogglErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) return undefined;
  const direct =
    optionalString(objectPayload.message) ??
    optionalString(objectPayload.error) ??
    optionalString(objectPayload.title) ??
    optionalString(objectPayload.detail);
  if (direct) return direct;
  if (Array.isArray(objectPayload.errors)) {
    const combined = objectPayload.errors
      .map((entry) => (typeof entry === "string" ? entry.trim() : optionalString(optionalRecord(entry)?.message)))
      .filter((entry): entry is string => Boolean(entry))
      .join("; ");
    return combined || undefined;
  }
  return undefined;
}

function buildProjectListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  appendQueryParam(query, "active", input.active);
  appendQueryParam(query, "since", input.since);
  appendQueryParam(query, "page", input.page);
  appendQueryParam(query, "sort_field", input.sortField);
  appendQueryParam(query, "sort_order", input.sortOrder);
  appendQueryParam(query, "per_page", input.perPage);
  appendQueryParam(query, "search", input.search);
  return query;
}

function buildProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    active: optionalBoolean(input.active),
    billable: optionalBoolean(input.billable),
    client_id: optionalInteger(input.clientId),
    client_name: optionalString(input.clientName),
    color: optionalString(input.color),
    currency: optionalString(input.currency),
    is_private: optionalBoolean(input.isPrivate),
    is_shared: optionalBoolean(input.isShared),
    rate: typeof input.rate === "number" ? input.rate : undefined,
    rate_change_mode: optionalString(input.rateChangeMode),
    start_date: optionalString(input.startDate),
    end_date: optionalString(input.endDate),
    estimated_hours: optionalInteger(input.estimatedHours),
    template: optionalBoolean(input.template),
    template_id: optionalInteger(input.templateId),
  });
}

function buildTaskListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  appendQueryParam(query, "active", input.active);
  return query;
}

function buildTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    active: optionalBoolean(input.active),
    estimated_seconds: optionalInteger(input.estimatedSeconds),
    external_reference: optionalString(input.externalReference),
    user_id: optionalInteger(input.userId),
  });
}

function buildTagListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  appendQueryParam(query, "page", input.page);
  appendQueryParam(query, "per_page", input.perPage);
  appendQueryParam(query, "search", input.search);
  return query;
}

function buildTimeEntryListQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  appendQueryParam(query, "since", input.since);
  appendQueryParam(query, "before", input.before);
  appendQueryParam(query, "start_date", input.startDate);
  appendQueryParam(query, "end_date", input.endDate);
  return query;
}

function buildTimeEntryBody(input: Record<string, unknown>, setDefaultCreatedWith: boolean): Record<string, unknown> {
  const createdWith = optionalString(input.createdWith);
  return compactObject({
    billable: optionalBoolean(input.billable),
    created_with: createdWith ?? (setDefaultCreatedWith ? defaultCreatedWith : undefined),
    description: typeof input.description === "string" ? input.description : undefined,
    duration: optionalInteger(input.duration),
    project_id: optionalInteger(input.projectId),
    start: optionalString(input.start),
    start_date: optionalString(input.startDate),
    stop: optionalString(input.stop),
    tag_ids: Array.isArray(input.tagIds)
      ? input.tagIds.map((value) => requireInputInteger(value, "tagIds[]"))
      : undefined,
    tags: Array.isArray(input.tags) ? input.tags.map((value) => requireInputString(value, "tags[]")) : undefined,
    task_id: optionalInteger(input.taskId),
    user_id: optionalInteger(input.userId),
  });
}

function appendQueryParam(query: URLSearchParams, key: string, value: unknown): void {
  if (value == null || value === "") return;
  query.set(key, String(value));
}

function sanitizeTogglUser(user: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...user };
  delete sanitized.api_token;
  return sanitized;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const objectPayload = optionalRecord(payload);
  if (!objectPayload) throw new ProviderRequestError(502, `${label} was not a JSON object`);
  return objectPayload;
}

function requireArrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, `${label} was not a JSON array`);
  return payload;
}

function requireInputInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requireInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value)?.trim();
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}
