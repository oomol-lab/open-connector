import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { todoistOAuthScopes } from "./scopes.ts";

const todoistApiBaseUrl = "https://api.todoist.com/api/v1";
const todoistUserPath = "/user";

type TodoistRequestPhase = "validate" | "execute";

interface TodoistRequestOptions {
  path: string;
  accessToken: string;
  fetcher: typeof fetch;
  phase: TodoistRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | Array<string> | undefined>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}

export const todoistActionHandlers: ProviderActionHandlers<"todoist", ProviderRuntimeHandler<BearerProviderContext>> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
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
  list_sections(input, context) {
    return listSections(input, context);
  },
  get_section(input, context) {
    return getSection(input, context);
  },
  create_section(input, context) {
    return createSection(input, context);
  },
  update_section(input, context) {
    return updateSection(input, context);
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
  close_task(input, context) {
    return closeTask(input, context);
  },
  list_comments(input, context) {
    return listComments(input, context);
  },
  get_comment(input, context) {
    return getComment(input, context);
  },
  create_comment(input, context) {
    return createComment(input, context);
  },
  update_comment(input, context) {
    return updateComment(input, context);
  },
  list_labels(input, context) {
    return listLabels(input, context);
  },
};

export async function validateTodoistCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const validation = await fetchTodoistCurrentAccount(accessToken, fetcher, signal, "validate");
  return {
    ...validation,
    grantedScopes: todoistOAuthScopes,
  };
}

export async function fetchTodoistCurrentAccount(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  phase: TodoistRequestPhase = "execute",
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    path: todoistUserPath,
    accessToken,
    fetcher,
    signal,
    phase,
  });

  const userId = requiredString(payload.id, "todoist user id", providerResponseError);
  const email = optionalString(payload.email);
  const fullName = optionalString(payload.full_name);
  return {
    profile: {
      accountId: `todoist:user:${userId}`,
      displayName: email ?? fullName ?? userId,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: todoistApiBaseUrl,
      validationEndpoint: todoistUserPath,
      userId,
      email,
      fullName,
      lang: optionalString(payload.lang),
      isPremium: typeof payload.is_premium === "boolean" ? payload.is_premium : undefined,
    }),
  };
}

async function getCurrentUser(context: BearerProviderContext): Promise<unknown> {
  return {
    user: await requestTodoistJson({
      path: todoistUserPath,
      accessToken: context.accessToken,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  };
}

async function listProjects(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: "/projects",
    query: compactObject({
      folder_id: optionalInteger(input.folderId),
      workspace_id: optionalInteger(input.workspaceId),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
  });
  return { projects: readResultsArray(payload, "todoist projects"), nextCursor: readNextCursor(payload) };
}

async function getProject(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    project: await requestTodoistJson({
      ...requestContext(context),
      path: `/projects/${encodeURIComponent(requiredString(input.projectId, "projectId", providerInputError))}`,
      notFoundAsInvalidInput: true,
    }),
  };
}

async function createProject(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    project: await requestTodoistJson({
      ...requestContext(context),
      path: "/projects",
      method: "POST",
      body: compactObject({
        name: requiredString(input.name, "name", providerInputError),
        description: optionalString(input.description),
        parent_id: input.parentId === null ? null : optionalString(input.parentId),
        color: input.color,
        is_favorite: typeof input.isFavorite === "boolean" ? input.isFavorite : undefined,
        view_style: optionalString(input.viewStyle),
        workspace_id: optionalInteger(input.workspaceId),
      }),
    }),
  };
}

async function updateProject(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    project: await requestTodoistJson({
      ...requestContext(context),
      path: `/projects/${encodeURIComponent(requiredString(input.projectId, "projectId", providerInputError))}`,
      method: "POST",
      notFoundAsInvalidInput: true,
      body: compactObject({
        name: input.name,
        description: input.description,
        color: input.color,
        is_favorite: input.isFavorite,
        view_style: input.viewStyle,
        child_order: input.childOrder,
        is_collapsed: input.isCollapsed,
        folder_id: input.folderId,
      }),
    }),
  };
}

async function listSections(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: "/sections",
    query: compactObject({
      project_id: optionalString(input.projectId),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
  });
  return { sections: readResultsArray(payload, "todoist sections"), nextCursor: readNextCursor(payload) };
}

async function getSection(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    section: await requestTodoistJson({
      ...requestContext(context),
      path: `/sections/${encodeURIComponent(requiredString(input.sectionId, "sectionId", providerInputError))}`,
      notFoundAsInvalidInput: true,
    }),
  };
}

async function createSection(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    section: await requestTodoistJson({
      ...requestContext(context),
      path: "/sections",
      method: "POST",
      body: compactObject({
        name: requiredString(input.name, "name", providerInputError),
        project_id: requiredString(input.projectId, "projectId", providerInputError),
        order: optionalInteger(input.order),
      }),
    }),
  };
}

async function updateSection(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    section: await requestTodoistJson({
      ...requestContext(context),
      path: `/sections/${encodeURIComponent(requiredString(input.sectionId, "sectionId", providerInputError))}`,
      method: "POST",
      notFoundAsInvalidInput: true,
      body: compactObject({
        name: input.name,
        section_order: input.sectionOrder,
        is_collapsed: input.isCollapsed,
      }),
    }),
  };
}

async function listTasks(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const ids = Array.isArray(input.ids)
    ? input.ids.map((item) => optionalString(item)).filter((item): item is string => Boolean(item))
    : undefined;
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: "/tasks",
    query: compactObject({
      project_id: optionalString(input.projectId),
      section_id: optionalString(input.sectionId),
      parent_id: optionalString(input.parentId),
      label: optionalString(input.label),
      ids: ids && ids.length > 0 ? ids : undefined,
      goal_id: optionalString(input.goalId),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
  });
  return { tasks: readResultsArray(payload, "todoist tasks"), nextCursor: readNextCursor(payload) };
}

async function getTask(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    task: await requestTodoistJson({
      ...requestContext(context),
      path: `/tasks/${encodeURIComponent(requiredString(input.taskId, "taskId", providerInputError))}`,
      notFoundAsInvalidInput: true,
    }),
  };
}

async function createTask(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    task: await requestTodoistJson({
      ...requestContext(context),
      path: "/tasks",
      method: "POST",
      body: buildTaskBody(input, true),
    }),
  };
}

async function updateTask(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  return {
    task: await requestTodoistJson({
      ...requestContext(context),
      path: `/tasks/${encodeURIComponent(requiredString(input.taskId, "taskId", providerInputError))}`,
      method: "POST",
      notFoundAsInvalidInput: true,
      body: buildTaskBody(input, false),
    }),
  };
}

async function closeTask(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  await requestTodoistJson({
    ...requestContext(context),
    path: `/tasks/${encodeURIComponent(requiredString(input.taskId, "taskId", providerInputError))}/close`,
    method: "POST",
    notFoundAsInvalidInput: true,
  });
  return { success: true };
}

async function listComments(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: "/comments",
    query: compactObject({
      task_id: optionalString(input.taskId),
      project_id: optionalString(input.projectId),
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
  });
  return {
    comments: readResultsArray(payload, "todoist comments").map((comment) => normalizeComment(comment)),
    nextCursor: readNextCursor(payload),
  };
}

async function getComment(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/comments/${encodeURIComponent(requiredString(input.commentId, "commentId", providerInputError))}`,
    notFoundAsInvalidInput: true,
  });
  return { comment: normalizeComment(payload) };
}

async function createComment(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: "/comments",
    method: "POST",
    body: compactObject({
      content: requiredString(input.content, "content", providerInputError),
      task_id: optionalString(input.taskId),
      project_id: optionalString(input.projectId),
      attachment: buildCommentAttachment(input.attachment),
      uids_to_notify: buildNotifyUserIds(input.uidsToNotify),
    }),
  });
  return { comment: normalizeComment(payload) };
}

async function updateComment(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: `/comments/${encodeURIComponent(requiredString(input.commentId, "commentId", providerInputError))}`,
    method: "POST",
    notFoundAsInvalidInput: true,
    body: {
      content: requiredString(input.content, "content", providerInputError),
    },
  });
  return { comment: normalizeComment(payload) };
}

async function listLabels(input: Record<string, unknown>, context: BearerProviderContext): Promise<unknown> {
  const payload = await requestTodoistJson<Record<string, unknown>>({
    ...requestContext(context),
    path: "/labels",
    query: compactObject({
      cursor: optionalString(input.cursor),
      limit: optionalInteger(input.limit),
    }),
  });
  return { labels: readResultsArray(payload, "todoist labels"), nextCursor: readNextCursor(payload) };
}

async function requestTodoistJson<T = Record<string, unknown>>(input: TodoistRequestOptions): Promise<T> {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${todoistApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildTodoistHeaders(input.accessToken, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `todoist request failed: ${error.message}` : "todoist request failed",
    );
  }
  const payload = await parseTodoistPayload(response);
  if (!response.ok) {
    throw mapTodoistError(response.status, payload, input.phase, input.notFoundAsInvalidInput ?? false);
  }
  return payload as T;
}

function requestContext(context: BearerProviderContext): Omit<TodoistRequestOptions, "path"> {
  return {
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  };
}

function buildTodoistHeaders(accessToken: string, hasBody: boolean): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function parseTodoistPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapTodoistError(
  status: number,
  payload: unknown,
  phase: TodoistRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readTodoistErrorMessage(payload) ?? `todoist request failed with ${status}`;
  if (status === 404 && notFoundAsInvalidInput) return new ProviderRequestError(400, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 400) return new ProviderRequestError(status, message, payload);
  if (status === 403) return new ProviderRequestError(403, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readTodoistErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) return undefined;
  const direct =
    optionalString(object.error) ??
    optionalString(object.error_description) ??
    optionalString(object.message) ??
    optionalString(object.detail);
  if (direct) return direct;
  if (Array.isArray(object.errors)) {
    const first = object.errors.find((item) => typeof item === "string");
    if (typeof first === "string" && first.length > 0) return first;
  }
  return undefined;
}

function readResultsArray(payload: Record<string, unknown>, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.results)) {
    throw new ProviderRequestError(502, `${label} response is missing results`);
  }
  return payload.results
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function readNextCursor(payload: Record<string, unknown>): string | null {
  return optionalString(payload.next_cursor) ?? null;
}

function buildTaskBody(input: Record<string, unknown>, isCreate: boolean): Record<string, unknown> {
  return compactObject({
    content: isCreate ? requiredString(input.content, "content", providerInputError) : optionalString(input.content),
    description: input.description,
    project_id: optionalString(input.projectId),
    section_id: optionalString(input.sectionId),
    parent_id: optionalString(input.parentId),
    order: optionalInteger(input.order),
    labels: buildStringArray(input.labels),
    priority: optionalInteger(input.priority),
    assignee_id:
      input.assigneeId === undefined ? undefined : input.assigneeId === null ? null : optionalInteger(input.assigneeId),
    due_string: optionalString(input.dueString),
    due_date: optionalString(input.dueDate),
    due_datetime: optionalString(input.dueDatetime),
    due_lang: optionalString(input.dueLang),
    duration: input.duration,
    duration_unit: input.durationUnit,
    deadline_date: input.deadlineDate,
    child_order: optionalInteger(input.childOrder),
    is_collapsed: typeof input.isCollapsed === "boolean" ? input.isCollapsed : undefined,
    day_order: optionalInteger(input.dayOrder),
  });
}

function buildCommentAttachment(value: unknown): Record<string, unknown> | undefined {
  const attachment = optionalRecord(value);
  if (!attachment) return undefined;
  return compactObject({
    file_url: optionalString(attachment.fileUrl),
    file_name: optionalString(attachment.fileName),
    file_type: optionalString(attachment.fileType),
    resource_type: optionalString(attachment.resourceType),
  });
}

function buildNotifyUserIds(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const userIds = value.map((item) => optionalInteger(item)).filter((item): item is number => item !== undefined);
  return userIds.length > 0 ? userIds : undefined;
}

function buildStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function normalizeComment(comment: Record<string, unknown>): Record<string, unknown> {
  const attachment = optionalRecord(comment.attachment) ?? optionalRecord(comment.file_attachment);
  return compactObject({
    ...comment,
    attachment,
  });
}
