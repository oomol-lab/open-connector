import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalRecord,
  optionalString,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
} from "../../core/cast.ts";
import { googleJsonRequest, googleRequest } from "../google-runtime.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

export const googleTasksApiBaseUrl = "https://tasks.googleapis.com/tasks/v1";

const service = "googletasks";
const googleUserInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";

type GoogleTasksRuntimeContext = OAuthProviderContext;
type GoogleTasksActionHandler = (
  input: Record<string, unknown>,
  context: GoogleTasksRuntimeContext,
) => Promise<unknown>;

type TaskStatus = "needsAction" | "completed";
type SurfaceType = "CONTEXT_TYPE_UNSPECIFIED" | "GMAIL" | "DOCUMENT" | "SPACE";

interface TaskLink {
  type: string;
  link: string;
  description?: string;
}

type TaskPayload = Record<string, unknown> & {
  id?: string;
  kind?: string;
  etag?: string;
  title?: string;
  notes?: string;
  status?: string;
  parent?: string;
  position?: string;
  due?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
  updated?: string;
  selfLink?: string;
  webViewLink?: string;
  links?: unknown;
  assignmentInfo?: unknown;
};

type TaskListPayload = Record<string, unknown> & {
  id?: string;
  kind?: string;
  etag?: string;
  title?: string;
  updated?: string;
  selfLink?: string;
};

interface TaskListCollectionPayload {
  etag?: string;
  items?: unknown;
  nextPageToken?: string;
}

interface TaskCollectionPayload {
  items?: unknown;
  nextPageToken?: string;
}

interface NormalizedTask {
  id: string;
  kind: string;
  etag: string | null;
  title: string | null;
  notes: string | null;
  status: TaskStatus | null;
  parent: string | null;
  position: string | null;
  due: string | null;
  completed: string | null;
  deleted: boolean;
  hidden: boolean;
  updated: string | null;
  selfLink: string | null;
  webViewLink: string | null;
  links: TaskLink[];
  assignmentInfo: Record<string, unknown> | null;
}

interface NormalizedTaskList {
  id: string;
  kind: string;
  etag: string | null;
  title: string | null;
  updated: string | null;
  selfLink: string | null;
}

export const googleTasksActionHandlers: ProviderActionHandlers<"googletasks", GoogleTasksActionHandler> = {
  list_task_lists: listTaskLists,
  get_task_list: getTaskList,
  create_task_list: createTaskList,
  patch_task_list: patchTaskList,
  update_task_list: updateTaskList,
  delete_task_list: deleteTaskList,
  list_tasks: listTasks,
  list_all_tasks: listAllTasks,
  get_task: getTask,
  insert_task: insertTask,
  patch_task: patchTask,
  update_task_full: updateTask,
  update_task: updateTask,
  move_task: moveTask,
  delete_task: deleteTask,
  clear_tasks: clearTasks,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, googleTasksActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>(googleUserInfoUrl, {
      accessToken: input.accessToken,
      fetcher,
      signal,
    });
    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "googletasks:oauth2",
        displayName: profile.name ?? profile.email ?? "Google Tasks User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function listTaskLists(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const payload = await googleTasksJsonRequest<TaskListCollectionPayload>("/users/@me/lists", {
    context,
    query: compactObject({
      maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults")),
      pageToken: pickOptionalString(input, "pageToken"),
    }),
  });

  const fallbackEtag = optionalString(payload.etag);
  return {
    taskLists: Array.isArray(payload.items) ? payload.items.map((item) => normalizeTaskList(item, fallbackEtag)) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getTaskList(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const payload = await googleTasksJsonRequest<TaskListPayload>(`/users/@me/lists/${encodeURIComponent(tasklistId)}`, {
    context,
  });

  return {
    taskList: normalizeTaskList(payload),
  };
}

async function createTaskList(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const payload = await googleTasksJsonRequest<TaskListPayload>("/users/@me/lists", {
    context,
    method: "POST",
    body: {
      title: requireInputString(input.title, "title is required"),
    },
  });

  return {
    taskList: normalizeTaskList(payload),
  };
}

async function patchTaskList(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const payload = await googleTasksJsonRequest<TaskListPayload>(`/users/@me/lists/${encodeURIComponent(tasklistId)}`, {
    context,
    method: "PATCH",
    body: {
      title: requireInputString(input.title, "title is required"),
    },
  });

  return {
    taskList: normalizeTaskList(payload),
  };
}

async function updateTaskList(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const payload = await googleTasksJsonRequest<TaskListPayload>(`/users/@me/lists/${encodeURIComponent(tasklistId)}`, {
    context,
    method: "PUT",
    body: {
      id: tasklistId,
      title: requireInputString(input.title, "title is required"),
    },
  });

  return {
    taskList: normalizeTaskList(payload),
  };
}

async function deleteTaskList(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  await googleTasksRequest(`/users/@me/lists/${encodeURIComponent(tasklistId)}`, {
    context,
    method: "DELETE",
  });

  return { success: true };
}

async function listTasks(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  assertCompletedFilterCompatible(input);
  const tasklistId = resolveTasklistId(input);
  const payload = await googleTasksJsonRequest<TaskCollectionPayload>(
    `/lists/${encodeURIComponent(tasklistId)}/tasks`,
    {
      context,
      query: buildTaskListQuery(input),
    },
  );

  return normalizeTaskCollection(payload);
}

async function listAllTasks(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  assertCompletedFilterCompatible(input);
  const maxTasksTotal = pickOptionalInteger(input, "maxTasksTotal") ?? 1000;
  const taskLists: Array<{ id: string; title: string | null; taskCount: number }> = [];
  const tasks: Array<NormalizedTask & { tasklistId: string; tasklistTitle: string | null }> = [];

  let taskListPageToken: string | undefined;
  while (true) {
    const taskListPayload = await googleTasksJsonRequest<TaskListCollectionPayload>("/users/@me/lists", {
      context,
      query: compactObject({
        pageToken: taskListPageToken,
      }),
    });

    const normalizedTaskLists = Array.isArray(taskListPayload.items)
      ? taskListPayload.items.map((item) => normalizeTaskList(item, optionalString(taskListPayload.etag)))
      : [];
    const nextTaskListPageToken = optionalString(taskListPayload.nextPageToken);

    for (const [taskListIndex, taskList] of normalizedTaskLists.entries()) {
      let taskCount = 0;
      let taskPageToken: string | undefined;

      while (true) {
        const taskPayload = await googleTasksJsonRequest<TaskCollectionPayload>(
          `/lists/${encodeURIComponent(taskList.id)}/tasks`,
          {
            context,
            query: buildTaskListQuery(input, taskPageToken),
          },
        );

        const currentTasks = Array.isArray(taskPayload.items)
          ? taskPayload.items.map((item) => normalizeTask(item))
          : [];
        const remaining = maxTasksTotal - tasks.length;
        const selectedTasks = currentTasks.slice(0, remaining);

        tasks.push(
          ...selectedTasks.map((task) => ({
            ...task,
            tasklistId: taskList.id,
            tasklistTitle: taskList.title,
          })),
        );
        taskCount += selectedTasks.length;

        const nextTaskPageToken = optionalString(taskPayload.nextPageToken);
        const hasMoreTasksInCurrentList = selectedTasks.length < currentTasks.length || nextTaskPageToken !== undefined;
        const hasMoreTaskLists = taskListIndex < normalizedTaskLists.length - 1 || nextTaskListPageToken !== undefined;

        if (tasks.length >= maxTasksTotal && (hasMoreTasksInCurrentList || hasMoreTaskLists)) {
          taskLists.push({
            id: taskList.id,
            title: taskList.title,
            taskCount,
          });
          return {
            taskLists,
            tasks,
            totalLists: taskLists.length,
            totalTasks: tasks.length,
            truncated: true,
          };
        }

        taskPageToken = nextTaskPageToken;
        if (!taskPageToken) {
          break;
        }
      }

      taskLists.push({
        id: taskList.id,
        title: taskList.title,
        taskCount,
      });
    }

    taskListPageToken = nextTaskListPageToken;
    if (!taskListPageToken) {
      break;
    }
  }

  return {
    taskLists,
    tasks,
    totalLists: taskLists.length,
    totalTasks: tasks.length,
    truncated: false,
  };
}

async function getTask(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const taskId = resolveTaskId(input);
  const payload = await googleTasksJsonRequest<TaskPayload>(
    `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
    { context },
  );

  return {
    task: normalizeTask(payload),
  };
}

async function insertTask(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const payload = await googleTasksJsonRequest<TaskPayload>(`/lists/${encodeURIComponent(tasklistId)}/tasks`, {
    context,
    method: "POST",
    query: compactObject({
      parent: pickOptionalString(input, "taskParent"),
      previous: pickOptionalString(input, "taskPrevious"),
    }),
    body: buildTaskBody(input),
  });

  return {
    task: normalizeTask(payload),
  };
}

async function patchTask(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const taskId = resolveTaskId(input);
  assertHasWritableTaskField(input);
  const payload = await googleTasksJsonRequest<TaskPayload>(
    `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      context,
      method: "PATCH",
      body: buildTaskBody(input),
    },
  );

  return {
    task: normalizeTask(payload),
  };
}

async function updateTask(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const taskId = resolveTaskId(input);
  const id = requireInputString(input.id, "id is required");
  requireInputString(input.title, "title is required");
  if (id !== taskId) {
    throw new ProviderRequestError(400, "id must match taskId");
  }
  const payload = await googleTasksJsonRequest<TaskPayload>(
    `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      context,
      method: "PUT",
      body: buildTaskBody(input),
    },
  );

  return {
    task: normalizeTask(payload),
  };
}

async function moveTask(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = requireInputString(input.tasklist, "tasklist is required");
  const taskId = requireInputString(input.task, "task is required");
  const payload = await googleTasksJsonRequest<TaskPayload>(
    `/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}/move`,
    {
      context,
      method: "POST",
      query: compactObject({
        destinationTasklist: pickOptionalString(input, "destinationTasklist"),
        parent: pickOptionalString(input, "parent"),
        previous: pickOptionalString(input, "previous"),
      }),
    },
  );

  return {
    task: normalizeTask(payload),
  };
}

async function deleteTask(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  const taskId = resolveTaskId(input);
  await googleTasksRequest(`/lists/${encodeURIComponent(tasklistId)}/tasks/${encodeURIComponent(taskId)}`, {
    context,
    method: "DELETE",
  });

  return { success: true };
}

async function clearTasks(input: Record<string, unknown>, context: GoogleTasksRuntimeContext) {
  const tasklistId = resolveTasklistId(input);
  await googleTasksRequest(`/lists/${encodeURIComponent(tasklistId)}/clear`, {
    context,
    method: "POST",
  });

  return { success: true };
}

function buildTaskListQuery(input: Record<string, unknown>, pageToken?: string): Record<string, string | undefined> {
  return compactObject({
    dueMax: optionalString(input.dueMax),
    dueMin: optionalString(input.dueMin),
    pageToken: pageToken ?? pickOptionalString(input, "pageToken"),
    maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults")),
    showCompleted: stringifyBoolean(pickOptionalBoolean(input, "showCompleted") ?? true),
    showHidden: stringifyBoolean(pickOptionalBoolean(input, "showHidden")),
    updatedMin: optionalString(input.updatedMin),
    showDeleted: stringifyBoolean(pickOptionalBoolean(input, "showDeleted")),
    completedMax: optionalString(input.completedMax),
    completedMin: optionalString(input.completedMin),
    showAssigned: stringifyBoolean(pickOptionalBoolean(input, "showAssigned")),
  });
}

function buildTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: pickOptionalString(input, "id"),
    etag: pickOptionalString(input, "etag"),
    title: optionalString(input.title),
    notes: optionalString(input.notes),
    status: pickOptionalString(input, "status"),
    due: optionalString(input.due),
    completed: optionalString(input.completed),
    deleted: pickOptionalBoolean(input, "deleted"),
  });
}

function resolveTasklistId(input: Record<string, unknown>): string {
  return requireInputString(input.tasklistId, "tasklistId is required");
}

function resolveTaskId(input: Record<string, unknown>): string {
  return requireInputString(input.taskId, "taskId is required");
}

function normalizeTaskCollection(payload: TaskCollectionPayload): {
  tasks: NormalizedTask[];
  nextPageToken: string | null;
} {
  return {
    tasks: Array.isArray(payload.items) ? payload.items.map((item) => normalizeTask(item)) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

function normalizeTaskList(value: unknown, fallbackEtag?: string): NormalizedTaskList {
  const payload = optionalRecord(value);
  if (!payload) {
    throw new ProviderRequestError(502, "missing google tasks task list");
  }

  return {
    id: requireProviderString(payload.id, "missing google tasks task list id"),
    kind: optionalString(payload.kind) ?? "tasks#taskList",
    etag: optionalString(payload.etag) ?? fallbackEtag ?? null,
    title: optionalString(payload.title) ?? null,
    updated: optionalString(payload.updated) ?? null,
    selfLink: optionalString(payload.selfLink) ?? null,
  };
}

function normalizeTask(value: unknown): NormalizedTask {
  const payload = optionalRecord(value);
  if (!payload) {
    throw new ProviderRequestError(502, "missing google tasks task");
  }

  return {
    id: requireProviderString(payload.id, "missing google tasks task id"),
    kind: optionalString(payload.kind) ?? "tasks#task",
    etag: optionalString(payload.etag) ?? null,
    title: optionalString(payload.title) ?? null,
    notes: optionalString(payload.notes) ?? null,
    status: normalizeTaskStatus(payload.status),
    parent: optionalString(payload.parent) ?? null,
    position: optionalString(payload.position) ?? null,
    due: optionalString(payload.due) ?? null,
    completed: optionalString(payload.completed) ?? null,
    deleted: payload.deleted === true,
    hidden: payload.hidden === true,
    updated: optionalString(payload.updated) ?? null,
    selfLink: optionalString(payload.selfLink) ?? null,
    webViewLink: optionalString(payload.webViewLink) ?? null,
    links: normalizeTaskLinks(payload.links),
    assignmentInfo: normalizeAssignmentInfo(payload.assignmentInfo),
  };
}

function normalizeTaskStatus(value: unknown): TaskStatus | null {
  return value === "needsAction" || value === "completed" ? value : null;
}

function normalizeTaskLinks(value: unknown): TaskLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const payload = optionalRecord(item);
    if (!payload) {
      return [];
    }

    const type = optionalString(payload.type);
    const link = optionalString(payload.link);
    if (!type || !link) {
      return [];
    }

    const normalized: TaskLink = { type, link };
    const description = optionalString(payload.description);
    if (description) {
      normalized.description = description;
    }
    return [normalized];
  });
}

function normalizeAssignmentInfo(value: unknown): Record<string, unknown> | null {
  const payload = optionalRecord(value);
  if (!payload) {
    return null;
  }

  const spaceInfo = optionalRecord(payload.spaceInfo);
  const driveResourceInfo = optionalRecord(payload.driveResourceInfo);
  const space = spaceInfo ? optionalString(spaceInfo.space) : undefined;
  const driveFileId = driveResourceInfo ? optionalString(driveResourceInfo.driveFileId) : undefined;
  const resourceKey = driveResourceInfo ? optionalString(driveResourceInfo.resourceKey) : undefined;
  const normalized = compactObject({
    surfaceType: normalizeSurfaceType(payload.surfaceType),
    linkToTask: optionalString(payload.linkToTask),
    spaceInfo: space ? { space } : undefined,
    driveResourceInfo: driveFileId || resourceKey ? compactObject({ driveFileId, resourceKey }) : undefined,
  });

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeSurfaceType(value: unknown): SurfaceType | undefined {
  if (value === "CONTEXT_TYPE_UNSPECIFIED" || value === "GMAIL" || value === "DOCUMENT" || value === "SPACE") {
    return value;
  }
  return undefined;
}

function assertCompletedFilterCompatible(input: Record<string, unknown>): void {
  if ((optionalString(input.completedMin) || optionalString(input.completedMax)) && input.showCompleted === false) {
    throw new ProviderRequestError(400, "showCompleted must be true when completedMin or completedMax is provided");
  }
}

function assertHasWritableTaskField(input: Record<string, unknown>): void {
  for (const field of ["id", "etag", "title", "notes", "status", "due", "completed", "deleted"]) {
    if (input[field] !== undefined) {
      return;
    }
  }

  throw new ProviderRequestError(400, "at least one task field is required");
}

function googleTasksJsonRequest<T>(
  path: string,
  input: {
    context: GoogleTasksRuntimeContext;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<T> {
  return googleJsonRequest<T>(`${googleTasksApiBaseUrl}${path}`, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

function googleTasksRequest(
  path: string,
  input: {
    context: GoogleTasksRuntimeContext;
    method?: string;
    query?: Record<string, string | undefined>;
    body?: unknown;
  },
): Promise<Response> {
  return googleRequest(`${googleTasksApiBaseUrl}${path}`, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

function requireInputString(value: unknown, message: string): string {
  const text = optionalString(value);
  if (text) {
    return text;
  }

  throw new ProviderRequestError(400, message);
}

function requireProviderString(value: unknown, message: string): string {
  const text = optionalString(value);
  if (text) {
    return text;
  }

  throw new ProviderRequestError(502, message);
}

function stringifyBoolean(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
