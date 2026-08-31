import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { providerInputError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const dida365ApiBaseUrl = "https://api.dida365.com";

type Dida365Phase = "validate" | "execute";
type Dida365Payload = Record<string, unknown>;
type Dida365ActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

interface Dida365RequestOptions {
  path: string;
  phase: Dida365Phase;
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  notFoundAsInvalidInput?: boolean;
  allowNotFound?: boolean;
}

export const dida365ActionHandlers: ProviderActionHandlers<"dida365", Dida365ActionHandler> = {
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
    const body = buildCreateProjectBody(input);
    const payload = await requestDida365Json(context, {
      path: "/open/v1/project",
      method: "POST",
      body,
      phase: "execute",
    });
    return { project: payload ?? body };
  },
  async update_project(input, context) {
    const projectId = resolveProjectId(input);
    const body = buildUpdateProjectBody(input);
    const payload = await requestDida365Json(context, {
      path: `/open/v1/project/${encodeURIComponent(projectId)}`,
      method: "POST",
      body,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { project: payload ?? compactObject({ id: projectId, ...body }) };
  },
  async delete_project(input, context) {
    const projectId = resolveProjectId(input);
    await requestDida365Json(context, {
      path: `/open/v1/project/${encodeURIComponent(projectId)}`,
      method: "DELETE",
      phase: "execute",
      allowNotFound: true,
    });
    return { deleted: true, projectId };
  },
  async get_task_by_project_and_id(input, context) {
    return { task: await fetchTask(context, resolveProjectId(input), resolveTaskId(input), "execute") };
  },
  async create_task(input, context) {
    const body = buildCreateTaskBody(input);
    const payload = await requestDida365Json(context, {
      path: "/open/v1/task",
      method: "POST",
      body,
      phase: "execute",
    });
    return { task: payload ?? body };
  },
  async update_task(input, context) {
    const projectId = resolveProjectId(input);
    const taskId = resolveTaskId(input);
    const body = buildUpdateTaskBody(input, taskId, projectId);
    const payload = await requestDida365Json(context, {
      path: `/open/v1/task/${encodeURIComponent(taskId)}`,
      method: "POST",
      body,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { task: payload ?? body };
  },
  async complete_task(input, context) {
    const projectId = resolveProjectId(input);
    const taskId = resolveTaskId(input);
    await requestDida365Json(context, {
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
    await requestDida365Json(context, {
      path: `/open/v1/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
      method: "DELETE",
      phase: "execute",
      allowNotFound: true,
    });
    return { deleted: true, projectId, taskId };
  },
  async list_all_tasks(input, context) {
    return listAllTasks(input, context);
  },
  async list_completed_tasks(input, context) {
    return {
      tasks: requireObjectArrayPayload(
        await requestDida365Json(context, {
          path: "/open/v1/task/completed",
          method: "POST",
          body: buildCompletedTasksBody(input),
          phase: "execute",
        }),
        "dida365 completed task list response",
      ),
    };
  },
  async filter_tasks(input, context) {
    return {
      tasks: requireObjectArrayPayload(
        await requestDida365Json(context, {
          path: "/open/v1/task/filter",
          method: "POST",
          body: buildFilterTasksBody(input),
          phase: "execute",
        }),
        "dida365 filtered task list response",
      ),
    };
  },
  async move_tasks(input, context) {
    const moves = normalizeMoveOperations(input.moves);
    const payload = await requestDida365Json(context, {
      path: "/open/v1/task/move",
      method: "POST",
      body: moves,
      phase: "execute",
    });
    return { moves: payload === undefined ? moves : requireObjectArrayPayload(payload, "dida365 move response") };
  },
  async list_habits(_input, context) {
    return {
      habits: requireObjectArrayPayload(
        await requestDida365Json(context, { path: "/open/v1/habit", phase: "execute" }),
        "dida365 habit list response",
      ),
    };
  },
  async get_habit(input, context) {
    return {
      habit: requireObjectPayload(
        await requestDida365Json(context, {
          path: `/open/v1/habit/${encodeURIComponent(resolveHabitId(input))}`,
          phase: "execute",
          notFoundAsInvalidInput: true,
        }),
        "dida365 habit response",
      ),
    };
  },
  async create_or_update_habit_checkin(input, context) {
    const habitId = resolveHabitId(input);
    const body = buildHabitCheckinBody(input);
    const payload = await requestDida365Json(context, {
      path: `/open/v1/habit/${encodeURIComponent(habitId)}/checkin`,
      method: "POST",
      body,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return { checkin: payload ?? { habitId, checkins: [body] } };
  },
  async list_habit_checkins(input, context) {
    return {
      checkins: requireObjectArrayPayload(
        await requestDida365Json(context, {
          path: "/open/v1/habit/checkins",
          query: {
            habitIds: normalizeStringArray(input.habitIds, "habitIds").join(","),
            from: requireInteger(input.from, "from"),
            to: requireInteger(input.to, "to"),
          },
          phase: "execute",
        }),
        "dida365 habit check-in list response",
      ),
    };
  },
};

export async function fetchDida365CurrentAccount(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: OAuthProviderContext = { accessToken, fetcher, signal };
  const projects = await fetchProjects(context, "validate");
  const firstProject = projects[0];
  const sampleProjectName = firstProject ? optionalString(firstProject.name) : undefined;
  return {
    profile: {
      accountId: `dida365:${createHash("sha256").update(accessToken).digest("hex").slice(0, 16)}`,
      displayName: sampleProjectName ? `Dida365 (${sampleProjectName})` : "Dida365 Account",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: dida365ApiBaseUrl,
      validationEndpoint: "/open/v1/project",
      projectCount: projects.length,
      sampleProjectId: firstProject ? optionalString(firstProject.id) : undefined,
      sampleProjectName,
    }),
  };
}

async function listAllTasks(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const limit = optionalInteger(input.limit);
  const requestedProjectIds =
    input.projectIds === undefined ? null : new Set(normalizeStringArray(input.projectIds, "projectIds"));
  const includeClosedProjects = optionalBoolean(input.includeClosedProjects) ?? false;
  const projects = await fetchProjects(context, "execute");
  const tasks: Dida365Payload[] = [];
  let projectsScanned = 0;

  for (const project of projects) {
    const id = optionalString(project.id);
    if (
      !id ||
      (requestedProjectIds && !requestedProjectIds.has(id)) ||
      (!includeClosedProjects && optionalBoolean(project.closed))
    ) {
      continue;
    }
    const data = await fetchProjectData(context, id, "execute");
    projectsScanned += 1;
    for (const task of data.tasks) {
      tasks.push(
        compactObject({
          ...task,
          projectName: optionalString(project.name) ?? id,
          projectClosed: optionalBoolean(project.closed),
          projectKind: optionalString(project.kind),
        }),
      );
    }
  }

  const limitedTasks = limit ? tasks.slice(0, limit) : tasks;
  return { tasks: limitedTasks, totalTasks: limitedTasks.length, projectsScanned };
}

async function fetchProjects(context: OAuthProviderContext, phase: Dida365Phase): Promise<Dida365Payload[]> {
  return requireObjectArrayPayload(
    await requestDida365Json(context, { path: "/open/v1/project", phase }),
    "dida365 project list response",
  );
}

async function fetchProject(
  context: OAuthProviderContext,
  projectId: string,
  phase: Dida365Phase,
): Promise<Dida365Payload> {
  return requireObjectPayload(
    await requestDida365Json(context, {
      path: `/open/v1/project/${encodeURIComponent(projectId)}`,
      phase,
      notFoundAsInvalidInput: true,
    }),
    "dida365 project response",
  );
}

async function fetchProjectData(
  context: OAuthProviderContext,
  projectId: string,
  phase: Dida365Phase,
): Promise<{ project: Dida365Payload; tasks: Dida365Payload[]; columns: Dida365Payload[] }> {
  const payload = requireObjectPayload(
    await requestDida365Json(context, {
      path: `/open/v1/project/${encodeURIComponent(projectId)}/data`,
      phase,
      notFoundAsInvalidInput: true,
    }),
    "dida365 project data response",
  );
  return {
    project: requireObjectPayload(payload.project, "dida365 project data.project"),
    tasks: optionalObjectArrayPayload(payload.tasks),
    columns: optionalObjectArrayPayload(payload.columns),
  };
}

async function fetchTask(
  context: OAuthProviderContext,
  projectId: string,
  taskId: string,
  phase: Dida365Phase,
): Promise<Dida365Payload> {
  return requireObjectPayload(
    await requestDida365Json(context, {
      path: `/open/v1/project/${encodeURIComponent(projectId)}/task/${encodeURIComponent(taskId)}`,
      phase,
      notFoundAsInvalidInput: true,
    }),
    "dida365 task response",
  );
}

async function requestDida365Json(context: OAuthProviderContext, input: Dida365RequestOptions): Promise<unknown> {
  const url = new URL(input.path, dida365ApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  const response = await context.fetcher(url.toString(), {
    method: input.method ?? "GET",
    headers: buildDida365Headers(context.accessToken, input.body !== undefined),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: context.signal,
  });
  const payload = await parseDida365Payload(response);
  if (input.allowNotFound && response.status === 404) {
    return payload;
  }
  if (!response.ok) {
    throw mapDida365Error(response.status, payload, input.phase, input.notFoundAsInvalidInput ?? false);
  }
  return payload;
}

function buildDida365Headers(accessToken: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function parseDida365Payload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function mapDida365Error(
  status: number,
  payload: unknown,
  phase: Dida365Phase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = extractDida365ErrorMessage(payload) ?? `dida365 request failed with status ${status}`;
  if (status === 400 || (status === 404 && notFoundAsInvalidInput))
    return new ProviderRequestError(400, message, payload);
  if ((status === 401 || status === 403) && phase === "validate")
    return new ProviderRequestError(400, message, payload);
  if (status === 401 || status === 403) return new ProviderRequestError(status, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractDida365ErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  for (const key of ["message", "error", "msg", "error_description"]) {
    const direct = optionalString(record[key]);
    if (direct) return direct;
    const nested = extractDida365ErrorMessage(record[key]);
    if (nested) return nested;
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
    reminders: optionalStringArray(input.reminders, "reminders"),
    tags: optionalStringArray(input.tags, "tags"),
    repeatFlag: optionalString(input.repeatFlag),
    priority: normalizePriority(input.priority),
    sortOrder: optionalInteger(input.sortOrder),
    items: normalizeChecklistItems(input.items),
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
    reminders: optionalStringArray(input.reminders, "reminders"),
    tags: optionalStringArray(input.tags, "tags"),
    repeatFlag: optionalString(input.repeatFlag),
    priority: normalizePriority(input.priority),
    sortOrder: optionalInteger(input.sortOrder),
    items: normalizeChecklistItems(input.items),
  });
}

function buildCompletedTasksBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    projectIds: optionalStringArray(input.projectIds, "projectIds"),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
  });
}

function buildFilterTasksBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    projectIds: optionalStringArray(input.projectIds, "projectIds"),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    priority: optionalPriorityArray(input.priority),
    tag: optionalStringArray(input.tag, "tag"),
    status: optionalIntegerArray(input.status, "status"),
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
  if (parsed !== 0 && parsed !== 1 && parsed !== 3 && parsed !== 5)
    throw new ProviderRequestError(400, "priority must be one of 0, 1, 3, or 5");
  return parsed;
}

function optionalPriorityArray(value: unknown): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, "priority must be an array");
  return value.map((item) => {
    const priority = normalizePriority(item);
    if (priority == null) throw new ProviderRequestError(400, "priority array items must be integers");
    return priority;
  });
}

function optionalIntegerArray(value: unknown, fieldName: string): number[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  return value.map((item) => requireInteger(item, fieldName));
}

function requireInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function optionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) return undefined;
  return normalizeStringArray(value, fieldName);
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  return value.map((item) => requireNonEmptyString(item, fieldName));
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new ProviderRequestError(400, `${fieldName} is required`);
  return normalized;
}

function requireObjectPayload(value: unknown, fieldName: string): Dida365Payload {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${fieldName} must be an object`);
  return record;
}

function requireObjectArrayPayload(value: unknown, fieldName: string): Dida365Payload[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `${fieldName} must be an array`);
  return value.map((item) => requireObjectPayload(item, fieldName));
}

function optionalObjectArrayPayload(value: unknown): Dida365Payload[] {
  return value == null ? [] : requireObjectArrayPayload(value, "dida365 nested array response");
}
