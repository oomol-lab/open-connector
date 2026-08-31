import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, objectArray, optionalBoolean, optionalInteger, optionalString } from "../../core/cast.ts";
import { providerInputError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const ticktickApiBaseUrl = "https://api.ticktick.com";
const ticktickProviderScopes = ["ticktick.read", "ticktick.write"] as const;

type TicktickPayload = Record<string, unknown>;
type TicktickRequestPhase = "validate" | "execute";
type TicktickHandler = (input: Record<string, unknown>, context: BearerProviderContext) => Promise<unknown>;

interface TicktickRequestOptions {
  accessToken: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: TicktickRequestPhase;
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  notFoundAsInvalidInput?: boolean;
  allowNotFound?: boolean;
}

interface TicktickProjectData {
  project: TicktickPayload;
  tasks: TicktickPayload[];
  columns: TicktickPayload[];
}

export const ticktickActionHandlers: ProviderActionHandlers<"ticktick", TicktickHandler> = {
  async get_user_project(_input, context) {
    return { projects: await fetchProjects(context, "execute") };
  },
  async get_project_by_id(input, context) {
    return { project: await fetchProject(context, resolveProjectId(input), "execute") };
  },
  async get_project_with_data(input, context) {
    const data = await fetchProjectData(context, resolveProjectId(input), "execute");
    return { project: data.project, tasks: data.tasks, columns: data.columns };
  },
  async create_project(input, context) {
    const { payload } = await requestTicktickJson<TicktickPayload>({
      ...requestContext(context),
      path: "/open/v1/project",
      method: "POST",
      body: buildCreateProjectBody(input),
      phase: "execute",
    });
    return { project: requireObjectPayload(payload, "ticktick project response") };
  },
  async update_project(input, context) {
    const projectId = resolveProjectId(input);
    const { payload } = await requestTicktickJson<TicktickPayload>({
      ...requestContext(context),
      path: `/open/v1/project/${encodeURIComponent(projectId)}`,
      method: "POST",
      body: buildUpdateProjectBody(input),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { project: requireObjectPayload(payload, "ticktick project response") };
  },
  async delete_project(input, context) {
    const projectId = resolveProjectId(input);
    await requestTicktickJson({
      ...requestContext(context),
      path: `/open/v1/project/${encodeURIComponent(projectId)}`,
      method: "DELETE",
      phase: "execute",
      allowNotFound: true,
    });
    return { deleted: true, projectId };
  },
  async get_task_by_project_and_id(input, context) {
    return {
      task: await fetchTask(context, resolveProjectId(input), resolveTaskId(input), "execute"),
    };
  },
  async create_task(input, context) {
    const { payload } = await requestTicktickJson<TicktickPayload>({
      ...requestContext(context),
      path: "/open/v1/task",
      method: "POST",
      body: buildCreateTaskBody(input),
      phase: "execute",
    });
    return { task: requireObjectPayload(payload, "ticktick task response") };
  },
  async create_task2(input, context) {
    return ticktickActionHandlers.create_task(input, context);
  },
  async batch_add_tasks(input, context) {
    const tasks = objectArray(input.tasks, "tasks").map((task) => buildCreateTaskBody(task));
    const { payload } = await requestTicktickJson<TicktickPayload | TicktickPayload[]>({
      ...requestContext(context),
      path: "/open/v1/task/batch",
      method: "POST",
      body: { add: tasks },
      phase: "execute",
    });
    const payloadAny = payload as TicktickPayload | TicktickPayload[] | undefined;
    const add = (payloadAny as { add?: TicktickPayload[] } | undefined)?.add;
    const nested = (payloadAny as { tasks?: TicktickPayload[] } | undefined)?.tasks;
    const created = Array.isArray(payloadAny) ? payloadAny : (add ?? nested);
    return {
      tasks: created ?? [],
      createdCount: created?.length ?? tasks.length,
    };
  },
  async update_task(input, context) {
    const projectId = resolveProjectId(input);
    const taskId = resolveTaskId(input);
    const { payload } = await requestTicktickJson<TicktickPayload>({
      ...requestContext(context),
      path: `/open/v1/task/${encodeURIComponent(taskId)}`,
      method: "POST",
      body: buildUpdateTaskBody(input, taskId, projectId),
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { task: requireObjectPayload(payload, "ticktick task response") };
  },
  async complete_task(input, context) {
    const projectId = resolveProjectId(input);
    const taskId = resolveTaskId(input);
    await requestTicktickJson({
      ...requestContext(context),
      path: `/open/v1/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}/complete`,
      method: "POST",
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { completed: true, projectId, taskId };
  },
  async delete_task(input, context) {
    const projectId = resolveProjectId(input);
    const taskId = resolveTaskId(input);
    await requestTicktickJson({
      ...requestContext(context),
      path: `/open/v1/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
      method: "DELETE",
      phase: "execute",
      allowNotFound: true,
    });
    return { deleted: true, projectId, taskId };
  },
  async list_all_tasks(input, context) {
    const limit = optionalInteger(input.limit);
    const requestedProjectIds = normalizeStringArray(input.projectIds, "projectIds");
    const requested = requestedProjectIds ? new Set(requestedProjectIds) : null;
    const includeClosedProjects = optionalBoolean(input.includeClosedProjects) ?? false;
    const projects = await fetchProjects(context, "execute");
    const tasks: TicktickPayload[] = [];
    let projectsScanned = 0;
    for (const project of projects) {
      const projectId = optionalString(project.id);
      if (!projectId || (requested && !requested.has(projectId))) continue;
      if (!includeClosedProjects && optionalBoolean(project.closed) === true) continue;
      const data = await fetchProjectData(context, projectId, "execute");
      projectsScanned += 1;
      for (const task of data.tasks) {
        tasks.push(
          compactObject({
            ...task,
            projectName: optionalString(project.name) ?? projectId,
            projectClosed: optionalBoolean(project.closed),
            projectKind: optionalString(project.kind),
          }),
        );
      }
    }
    const limited = limit ? tasks.slice(0, limit) : tasks;
    return { tasks: limited, totalTasks: limited.length, projectsScanned };
  },
  async list_completed_tasks(input, context) {
    const { payload } = await requestTicktickJson<TicktickPayload[]>({
      ...requestContext(context),
      path: "/open/v1/task/completed",
      method: "POST",
      body: buildCompletedTasksBody(input),
      phase: "execute",
    });
    return { tasks: requireObjectArrayPayload(payload, "ticktick completed task list response") };
  },
  async filter_tasks(input, context) {
    const { payload } = await requestTicktickJson<TicktickPayload[]>({
      ...requestContext(context),
      path: "/open/v1/task/filter",
      method: "POST",
      body: buildFilterTasksBody(input),
      phase: "execute",
    });
    return { tasks: requireObjectArrayPayload(payload, "ticktick filtered task list response") };
  },
  async move_tasks(input, context) {
    const { payload } = await requestTicktickJson<TicktickPayload[]>({
      ...requestContext(context),
      path: "/open/v1/task/move",
      method: "POST",
      body: normalizeMoveOperations(input.moves),
      phase: "execute",
    });
    return { moves: requireObjectArrayPayload(payload, "ticktick move response") };
  },
  async list_habits(_input, context) {
    const { payload } = await requestTicktickJson<TicktickPayload[]>({
      ...requestContext(context),
      path: "/open/v1/habit",
      phase: "execute",
    });
    return { habits: requireObjectArrayPayload(payload, "ticktick habit list response") };
  },
  async get_habit(input, context) {
    const habitId = resolveHabitId(input);
    const { payload } = await requestTicktickJson<TicktickPayload>({
      ...requestContext(context),
      path: `/open/v1/habit/${encodeURIComponent(habitId)}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { habit: requireObjectPayload(payload, "ticktick habit response") };
  },
  async create_or_update_habit_checkin(input, context) {
    const habitId = resolveHabitId(input);
    const body = buildHabitCheckinBody(input);
    const { payload } = await requestTicktickJson<TicktickPayload>({
      ...requestContext(context),
      path: `/open/v1/habit/${encodeURIComponent(habitId)}/checkin`,
      method: "POST",
      body,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      checkin:
        payload === undefined
          ? { habitId, checkins: [body] }
          : requireObjectPayload(payload, "ticktick habit check-in response"),
    };
  },
  async list_habit_checkins(input, context) {
    const { payload } = await requestTicktickJson<TicktickPayload[]>({
      ...requestContext(context),
      path: "/open/v1/habit/checkins",
      query: {
        habitIds: normalizeStringArray(input.habitIds, "habitIds")?.join(","),
        from: requireInteger(input.from, "from"),
        to: requireInteger(input.to, "to"),
      },
      phase: "execute",
    });
    return { checkins: requireObjectArrayPayload(payload, "ticktick habit check-in list response") };
  },
};

export async function validateTicktickCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const context = {
    accessToken: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
  };
  const projects = await fetchProjects(context, "validate");
  const firstProject = projects[0];
  return validationResult(input.apiKey, projects.length, firstProject, "TickTick Access Token");
}

export async function fetchTicktickCurrentAccount(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const projects = await fetchProjects({ accessToken, fetcher, signal }, "validate");
  const firstProject = projects[0];
  const sampleProjectName = firstProject ? optionalString(firstProject.name) : undefined;
  return validationResult(
    accessToken,
    projects.length,
    firstProject,
    sampleProjectName ? `TickTick (${sampleProjectName})` : "TickTick Account",
  );
}

function validationResult(
  accessToken: string,
  projectCount: number,
  firstProject: TicktickPayload | undefined,
  displayName: string,
): CredentialValidationResult {
  return {
    profile: {
      accountId: `ticktick:${hashAccessToken(accessToken)}`,
      displayName,
    },
    grantedScopes: [...ticktickProviderScopes],
    metadata: compactObject({
      apiBaseUrl: ticktickApiBaseUrl,
      validationEndpoint: "/open/v1/project",
      projectCount,
      sampleProjectId: firstProject ? optionalString(firstProject.id) : undefined,
      sampleProjectName: firstProject ? optionalString(firstProject.name) : undefined,
    }),
  };
}

function requestContext(
  context: BearerProviderContext | { accessToken: string; fetcher: typeof fetch; signal?: AbortSignal },
) {
  return {
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  };
}

async function fetchProjects(
  context: BearerProviderContext | { accessToken: string; fetcher: typeof fetch; signal?: AbortSignal },
  phase: TicktickRequestPhase,
): Promise<TicktickPayload[]> {
  const { payload } = await requestTicktickJson<TicktickPayload[]>({
    ...requestContext(context),
    path: "/open/v1/project",
    phase,
  });
  return requireObjectArrayPayload(payload, "ticktick project list response");
}

async function fetchProject(
  context: BearerProviderContext,
  projectId: string,
  phase: TicktickRequestPhase,
): Promise<TicktickPayload> {
  const { payload } = await requestTicktickJson<TicktickPayload>({
    ...requestContext(context),
    path: `/open/v1/project/${encodeURIComponent(projectId)}`,
    phase,
    notFoundAsInvalidInput: true,
  });
  return requireObjectPayload(payload, "ticktick project response");
}

async function fetchProjectData(
  context: BearerProviderContext,
  projectId: string,
  phase: TicktickRequestPhase,
): Promise<TicktickProjectData> {
  const { payload } = await requestTicktickJson<TicktickPayload>({
    ...requestContext(context),
    path: `/open/v1/project/${encodeURIComponent(projectId)}/data`,
    phase,
    notFoundAsInvalidInput: true,
  });
  const data = requireObjectPayload(payload, "ticktick project data response");
  return {
    project: requireObjectPayload(data.project, "ticktick project data.project"),
    tasks: optionalObjectArrayPayload(data.tasks),
    columns: optionalObjectArrayPayload(data.columns),
  };
}

async function fetchTask(
  context: BearerProviderContext,
  projectId: string,
  taskId: string,
  phase: TicktickRequestPhase,
): Promise<TicktickPayload> {
  const { payload } = await requestTicktickJson<TicktickPayload>({
    ...requestContext(context),
    path: `/open/v1/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
    phase,
    notFoundAsInvalidInput: true,
  });
  return requireObjectPayload(payload, "ticktick task response");
}

async function requestTicktickJson<T>(
  input: TicktickRequestOptions,
): Promise<{ response: Response; payload: T | undefined }> {
  const url = new URL(input.path, ticktickApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await input.fetcher(url, {
    method: input.method ?? "GET",
    headers: buildTicktickHeaders(input.accessToken, input.body),
    body: input.body == null ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });

  const payload = await parseTicktickPayload<T>(response);
  if (input.allowNotFound && response.status === 404) return { response, payload };
  if (!response.ok) {
    throw mapTicktickError({
      status: response.status,
      payload,
      phase: input.phase,
      notFoundAsInvalidInput: input.notFoundAsInvalidInput ?? false,
    });
  }
  return { response, payload };
}

function buildTicktickHeaders(accessToken: string, body: unknown): HeadersInit {
  return compactObject({
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
    "content-type": body != null ? "application/json" : undefined,
  }) as HeadersInit;
}

async function parseTicktickPayload<T>(response: Response): Promise<T | undefined> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function mapTicktickError(input: {
  status: number;
  payload: unknown;
  phase: TicktickRequestPhase;
  notFoundAsInvalidInput: boolean;
}): ProviderRequestError {
  const message = extractTicktickErrorMessage(input.payload) ?? `ticktick request failed with status ${input.status}`;
  if (input.status === 400) return new ProviderRequestError(400, message, input.payload);
  if ((input.status === 401 || input.status === 403) && input.phase === "validate")
    return new ProviderRequestError(401, message, input.payload);
  if (input.status === 401) return new ProviderRequestError(401, message, input.payload);
  if (input.status === 403) return new ProviderRequestError(403, message, input.payload);
  if (input.status === 404 && input.notFoundAsInvalidInput)
    return new ProviderRequestError(400, message, input.payload);
  if (input.status === 429) return new ProviderRequestError(429, message, input.payload);
  return new ProviderRequestError(
    input.status >= 400 && input.status < 500 ? input.status : 500,
    message,
    input.payload,
  );
}

function extractTicktickErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) return payload;
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "msg", "error_description"]) {
    const value = record[key];
    if (typeof value === "string" && value) return value;
  }
  for (const key of ["message", "error", "msg", "error_description"]) {
    const value = record[key];
    if (value && typeof value === "object") {
      const nested = extractTicktickErrorMessage(value);
      if (nested) return nested;
    }
  }
  return undefined;
}

function buildCreateProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: requireNonEmptyString(input.name, "name"),
    color: optionalString(input.color),
    sortOrder: optionalInteger(input.sortOrder),
    viewMode: normalizeViewMode(input.viewMode),
    kind: normalizeProjectKind(input.kind),
  });
}

function buildUpdateProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    color: optionalString(input.color),
    sortOrder: optionalInteger(input.sortOrder),
    viewMode: normalizeViewMode(input.viewMode),
    kind: normalizeProjectKind(input.kind),
  });
}

function buildCreateTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    projectId: resolveProjectId(input),
    title: requireNonEmptyString(input.title, "title"),
    content: optionalString(input.content),
    desc: optionalString(input.desc),
    isAllDay: optionalBoolean(input.isAllDay),
    startDate: optionalString(input.startDate),
    dueDate: optionalString(input.dueDate),
    timeZone: optionalString(input.timeZone),
    reminders: normalizeStringArray(input.reminders, "reminders"),
    repeatFlag: optionalString(input.repeatFlag),
    priority: normalizePriority(input.priority),
    sortOrder: optionalInteger(input.sortOrder),
    items: normalizeChecklistItems(input.items),
    tags: normalizeStringArray(input.tags, "tags"),
  });
}

function buildUpdateTaskBody(
  input: Record<string, unknown>,
  taskId: string,
  projectId: string,
): Record<string, unknown> {
  const explicitBodyTaskId = optionalString(input.id);
  if (explicitBodyTaskId && explicitBodyTaskId !== taskId) throw new ProviderRequestError(400, "id must match taskId");
  return compactObject({
    id: taskId,
    projectId,
    title: optionalString(input.title),
    content: optionalString(input.content),
    desc: optionalString(input.desc),
    isAllDay: optionalBoolean(input.isAllDay),
    startDate: optionalString(input.startDate),
    dueDate: optionalString(input.dueDate),
    timeZone: optionalString(input.timeZone),
    reminders: normalizeStringArray(input.reminders, "reminders"),
    repeatFlag: optionalString(input.repeatFlag),
    priority: normalizePriority(input.priority),
    sortOrder: optionalInteger(input.sortOrder),
    items: normalizeChecklistItems(input.items),
    tags: normalizeStringArray(input.tags, "tags"),
  });
}

function buildCompletedTasksBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    projectIds: normalizeStringArray(input.projectIds, "projectIds"),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
  });
}

function buildFilterTasksBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    projectIds: normalizeStringArray(input.projectIds, "projectIds"),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    priority: normalizePriorityArray(input.priority),
    tag: normalizeStringArray(input.tag, "tag"),
    status: normalizeIntegerArray(input.status, "status"),
  });
}

function normalizeMoveOperations(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "moves", providerInputError).map((operation) =>
    compactObject({
      fromProjectId: requireNonEmptyString(operation.fromProjectId, "moves.fromProjectId"),
      toProjectId: requireNonEmptyString(operation.toProjectId, "moves.toProjectId"),
      taskId: requireNonEmptyString(operation.taskId, "moves.taskId"),
    }),
  );
}

function buildHabitCheckinBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    stamp: requireInteger(input.stamp, "stamp"),
    time: optionalString(input.time),
    opTime: optionalString(input.opTime),
    value: optionalNumber(input.value),
    goal: optionalNumber(input.goal),
    status: optionalInteger(input.status),
  });
}

function normalizeChecklistItems(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value == null) return undefined;
  return objectArray(value, "items", providerInputError).map((item) =>
    compactObject({
      id: optionalString(item.id),
      title: requireNonEmptyString(item.title, "items.title"),
      status: optionalInteger(item.status),
      isAllDay: optionalBoolean(item.isAllDay),
      timeZone: optionalString(item.timeZone),
      sortOrder: optionalInteger(item.sortOrder),
      startDate: optionalString(item.startDate),
      completedTime: optionalString(item.completedTime),
    }),
  );
}

function resolveProjectId(input: Record<string, unknown>): string {
  return requireNonEmptyString(input.projectId, "projectId");
}

function resolveTaskId(input: Record<string, unknown>): string {
  return requireNonEmptyString(input.taskId, "taskId");
}

function resolveHabitId(input: Record<string, unknown>): string {
  return requireNonEmptyString(input.habitId, "habitId");
}

function normalizeProjectKind(value: unknown): string | undefined {
  const raw = optionalString(value);
  if (!raw) return undefined;
  const normalized = raw.toUpperCase();
  if (normalized !== "TASK" && normalized !== "NOTE") throw new ProviderRequestError(400, "kind must be TASK or NOTE");
  return normalized;
}

function normalizeViewMode(value: unknown): string | undefined {
  const raw = optionalString(value);
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (normalized !== "list" && normalized !== "kanban" && normalized !== "timeline") {
    throw new ProviderRequestError(400, "viewMode must be list, kanban, or timeline");
  }
  return normalized;
}

function normalizePriority(value: unknown): number | undefined {
  const parsed = optionalInteger(value);
  if (parsed == null) return undefined;
  if (parsed !== 0 && parsed !== 1 && parsed !== 3 && parsed !== 5) {
    throw new ProviderRequestError(400, "priority must be one of 0, 1, 3, or 5");
  }
  return parsed;
}

function normalizePriorityArray(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, "priority must be an array");
  return value.map((item) => {
    const priority = normalizePriority(item);
    if (priority == null) throw new ProviderRequestError(400, "priority array items must be integers");
    return priority;
  });
}

function normalizeIntegerArray(value: unknown, fieldName: string): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  return value.map((item) => {
    const parsed = optionalInteger(item);
    if (parsed == null) throw new ProviderRequestError(400, `${fieldName} items must be integers`);
    return parsed;
  });
}

function normalizeStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  return value.map((item) => requireNonEmptyString(item, fieldName));
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(400, `${fieldName} is required`);
  return normalized;
}

function requireInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null) throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireObjectPayload(value: unknown, fieldName: string): TicktickPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return value as TicktickPayload;
}

function requireObjectArrayPayload(value: unknown, fieldName: string): TicktickPayload[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${fieldName} must be an array`);
  return value.map((item) => requireObjectPayload(item, fieldName));
}

function optionalObjectArrayPayload(value: unknown): TicktickPayload[] {
  return value == null ? [] : requireObjectArrayPayload(value, "ticktick nested array response");
}

function hashAccessToken(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
}
