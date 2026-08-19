import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const microsoftTodoGraphBaseUrl = "https://graph.microsoft.com/v1.0";
const graphHost = "graph.microsoft.com";

export type MicrosoftTodoActionHandler = (
  input: Record<string, unknown>,
  context: OAuthProviderContext,
) => Promise<unknown>;

interface MicrosoftTodoRequestInput {
  accessToken: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

interface MicrosoftTodoGraphPage {
  value?: unknown;
  "@odata.nextLink"?: unknown;
}

interface MicrosoftTodoPage {
  value: unknown[];
  nextLink?: string;
}

function toPage(response: MicrosoftTodoGraphPage): MicrosoftTodoPage {
  const value = Array.isArray(response.value) ? response.value : [];
  const nextLink = optionalString(response["@odata.nextLink"]);
  return nextLink ? { value, nextLink } : { value };
}

export const microsoftTodoActionHandlers: ProviderActionHandlers<"microsoft_todo", MicrosoftTodoActionHandler> = {
  list_task_lists: listTaskLists,
  get_task_list: getTaskList,
  create_task_list: createTaskList,
  update_task_list: updateTaskList,
  delete_task_list: deleteTaskList,
  list_tasks: listTasks,
  get_task: getTask,
  create_task: createTask,
  update_task: updateTask,
  delete_task: deleteTask,
  list_checklist_items: listChecklistItems,
  create_checklist_item: createChecklistItem,
  update_checklist_item: updateChecklistItem,
  delete_checklist_item: deleteChecklistItem,
};

async function listTaskLists(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const nextLink = optionalString(input.nextLink);
  const response = await microsoftTodoJsonRequest<MicrosoftTodoGraphPage>(nextLink ?? "me/todo/lists", {
    accessToken,
    fetcher,
    signal,
    query: nextLink ? undefined : listQuery(input),
  });
  return toPage(response);
}

async function getTaskList(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  return microsoftTodoJsonRequest(`me/todo/lists/${encodePathSegment(listId)}`, { accessToken, fetcher, signal });
}

async function createTaskList(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const displayName = requiredString(input.displayName, "displayName");
  return microsoftTodoJsonRequest("me/todo/lists", {
    accessToken,
    fetcher,
    signal,
    method: "POST",
    body: { displayName },
  });
}

async function updateTaskList(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  const displayName = requiredString(input.displayName, "displayName");
  return microsoftTodoJsonRequest(`me/todo/lists/${encodePathSegment(listId)}`, {
    accessToken,
    fetcher,
    signal,
    method: "PATCH",
    body: { displayName },
  });
}

async function deleteTaskList(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  await microsoftTodoRequest(`me/todo/lists/${encodePathSegment(listId)}`, {
    accessToken,
    fetcher,
    signal,
    method: "DELETE",
  });
  return { id: listId, deleted: true };
}

async function listTasks(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  const nextLink = optionalString(input.nextLink);
  const query = nextLink ? undefined : listQuery(input, { $expand: expandChecklistItemsQuery(input) });
  const response = await microsoftTodoJsonRequest<MicrosoftTodoGraphPage>(
    nextLink ?? `me/todo/lists/${encodePathSegment(listId)}/tasks`,
    { accessToken, fetcher, signal, query },
  );
  return toPage(response);
}

async function getTask(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  const taskId = requiredString(input.taskId, "taskId");
  return microsoftTodoJsonRequest(`me/todo/lists/${encodePathSegment(listId)}/tasks/${encodePathSegment(taskId)}`, {
    accessToken,
    fetcher,
    signal,
  });
}

async function createTask(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  return microsoftTodoJsonRequest(`me/todo/lists/${encodePathSegment(listId)}/tasks`, {
    accessToken,
    fetcher,
    signal,
    method: "POST",
    body: taskBody(input, { title: requiredString(input.title, "title") }),
  });
}

async function updateTask(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  const taskId = requiredString(input.taskId, "taskId");
  return microsoftTodoJsonRequest(`me/todo/lists/${encodePathSegment(listId)}/tasks/${encodePathSegment(taskId)}`, {
    accessToken,
    fetcher,
    signal,
    method: "PATCH",
    body: taskBody(input, {
      title: optionalString(input.title),
      completedDateTime: dateTimeTimeZone(input.completedDateTime),
    }),
  });
}

async function deleteTask(input: Record<string, unknown>, { accessToken, fetcher, signal }: OAuthProviderContext) {
  const listId = requiredString(input.listId, "listId");
  const taskId = requiredString(input.taskId, "taskId");
  await microsoftTodoRequest(`me/todo/lists/${encodePathSegment(listId)}/tasks/${encodePathSegment(taskId)}`, {
    accessToken,
    fetcher,
    signal,
    method: "DELETE",
  });
  return { id: taskId, deleted: true };
}

async function listChecklistItems(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: OAuthProviderContext,
) {
  const listId = requiredString(input.listId, "listId");
  const taskId = requiredString(input.taskId, "taskId");
  const nextLink = optionalString(input.nextLink);
  const response = await microsoftTodoJsonRequest<MicrosoftTodoGraphPage>(
    nextLink ?? `me/todo/lists/${encodePathSegment(listId)}/tasks/${encodePathSegment(taskId)}/checklistItems`,
    { accessToken, fetcher, signal },
  );
  return toPage(response);
}

async function createChecklistItem(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: OAuthProviderContext,
) {
  const listId = requiredString(input.listId, "listId");
  const taskId = requiredString(input.taskId, "taskId");
  const displayName = requiredString(input.displayName, "displayName");
  return microsoftTodoJsonRequest(
    `me/todo/lists/${encodePathSegment(listId)}/tasks/${encodePathSegment(taskId)}/checklistItems`,
    { accessToken, fetcher, signal, method: "POST", body: { displayName } },
  );
}

async function updateChecklistItem(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: OAuthProviderContext,
) {
  const listId = requiredString(input.listId, "listId");
  const taskId = requiredString(input.taskId, "taskId");
  const checklistItemId = requiredString(input.checklistItemId, "checklistItemId");
  return microsoftTodoJsonRequest(
    `me/todo/lists/${encodePathSegment(listId)}/tasks/${encodePathSegment(taskId)}/checklistItems/${encodePathSegment(checklistItemId)}`,
    {
      accessToken,
      fetcher,
      signal,
      method: "PATCH",
      body: compactObject({
        displayName: optionalString(input.displayName),
        isChecked: typeof input.isChecked === "boolean" ? input.isChecked : undefined,
      }),
    },
  );
}

async function deleteChecklistItem(
  input: Record<string, unknown>,
  { accessToken, fetcher, signal }: OAuthProviderContext,
) {
  const listId = requiredString(input.listId, "listId");
  const taskId = requiredString(input.taskId, "taskId");
  const checklistItemId = requiredString(input.checklistItemId, "checklistItemId");
  await microsoftTodoRequest(
    `me/todo/lists/${encodePathSegment(listId)}/tasks/${encodePathSegment(taskId)}/checklistItems/${encodePathSegment(checklistItemId)}`,
    { accessToken, fetcher, signal, method: "DELETE" },
  );
  return { id: checklistItemId, deleted: true };
}

function listQuery(
  input: Record<string, unknown>,
  extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    $top: typeof input.top === "number" ? String(input.top) : undefined,
    $skip: typeof input.skip === "number" ? String(input.skip) : undefined,
    $filter: optionalString(input.filter),
    $orderby: optionalString(input.orderby),
    ...extra,
  };
}

function expandChecklistItemsQuery(input: Record<string, unknown>): string | undefined {
  return input.expandChecklistItems === true ? "checklistItems" : undefined;
}

function taskBody(input: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    ...extra,
    body: optionalRecord(input.body),
    status: optionalString(input.status),
    importance: optionalString(input.importance),
    categories: Array.isArray(input.categories) ? input.categories : undefined,
    dueDateTime: dateTimeTimeZone(input.dueDateTime),
    startDateTime: dateTimeTimeZone(input.startDateTime),
    isReminderOn: typeof input.isReminderOn === "boolean" ? input.isReminderOn : undefined,
    reminderDateTime: dateTimeTimeZone(input.reminderDateTime),
    recurrence: optionalRecord(input.recurrence),
  });
}

/**
 * Normalize a Microsoft Graph dateTimeTimeZone input, defaulting timeZone to UTC when omitted.
 */
function dateTimeTimeZone(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const dateTime = requiredString(record.dateTime, "dateTime");
  const timeZone = optionalString(record.timeZone) ?? "UTC";
  return { dateTime, timeZone };
}

export async function microsoftTodoJsonRequest<T = unknown>(
  pathOrUrl: string,
  input: MicrosoftTodoRequestInput,
): Promise<T> {
  const response = await microsoftTodoRequest(pathOrUrl, input);
  return (await response.json()) as T;
}

async function microsoftTodoRequest(pathOrUrl: string, input: MicrosoftTodoRequestInput): Promise<Response> {
  const target = buildMicrosoftTodoUrl(pathOrUrl, input.query);
  const hasJsonBody = input.body !== undefined;
  const method = (input.method ?? (hasJsonBody ? "POST" : "GET")).toUpperCase();
  const headers = {
    authorization: `Bearer ${input.accessToken}`,
    ...(input.headers ?? {}),
  };

  if ((method === "GET" || method === "HEAD") && hasJsonBody) {
    throw new ProviderRequestError(400, `microsoft_todo ${method} request must not include a body`);
  }

  const response = await input.fetcher(target.toString(), {
    method,
    signal: input.signal,
    headers:
      hasJsonBody && !hasContentTypeHeader(headers)
        ? {
            ...headers,
            "content-type": "application/json",
          }
        : headers,
    ...(hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
  });

  await assertMicrosoftTodoResponse(response);
  return response;
}

function buildMicrosoftTodoUrl(pathOrUrl: string, query?: Record<string, string | undefined>): URL {
  const isAbsolutePath = pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("http://");
  const target = isAbsolutePath ? new URL(pathOrUrl) : new URL(pathOrUrl, `${microsoftTodoGraphBaseUrl}/`);

  if (target.hostname !== graphHost) {
    throw new ProviderRequestError(400, "nextLink must target graph.microsoft.com");
  }
  if (isAbsolutePath) {
    assertAllowedMicrosoftTodoNextLink(target);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (typeof value !== "string" || value.length === 0) {
      continue;
    }

    target.searchParams.set(key, value);
  }

  return target;
}

function assertAllowedMicrosoftTodoNextLink(target: URL): void {
  if (target.protocol !== "https:") {
    throw new ProviderRequestError(400, "nextLink must use https");
  }
  if (!isAllowedMicrosoftTodoNextLinkPath(target.pathname)) {
    throw new ProviderRequestError(400, "nextLink must target Microsoft To Do pagination endpoints");
  }
}

function isAllowedMicrosoftTodoNextLinkPath(pathname: string): boolean {
  const segments = trimTrailingSlash(pathname).split("/").filter(Boolean);

  if (segments[0] !== "v1.0" || segments[1] !== "me" || segments[2] !== "todo" || segments[3] !== "lists") {
    return false;
  }

  // v1.0/me/todo/lists
  if (segments.length === 4) {
    return true;
  }
  // v1.0/me/todo/lists/{listId}/tasks
  if (segments.length === 6 && segments[5] === "tasks") {
    return true;
  }
  // v1.0/me/todo/lists/{listId}/tasks/{taskId}/checklistItems
  return segments.length === 8 && segments[5] === "tasks" && segments[7] === "checklistItems";
}

function trimTrailingSlash(value: string): string {
  let normalizedValue = value;
  while (normalizedValue.endsWith("/") && normalizedValue.length > 1) {
    normalizedValue = normalizedValue.slice(0, -1);
  }
  return normalizedValue;
}

function hasContentTypeHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

async function assertMicrosoftTodoResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const message = await extractMicrosoftTodoErrorMessage(response);
  throw new ProviderRequestError(response.status, message);
}

async function extractMicrosoftTodoErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `microsoft_todo request failed with status ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
    return (
      (typeof parsed.error?.message === "string" && parsed.error.message) ||
      (typeof parsed.message === "string" && parsed.message) ||
      text
    );
  } catch {
    return text;
  }
}
