import type { FeishuJsonRequest } from "./client.ts";

import { optionalBoolean, optionalNumber } from "../../../core/cast.ts";
import { providerInputError } from "../../provider-runtime.ts";

interface TaskActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuTaskActionHandlers(request: FeishuJsonRequest): Record<string, TaskActionHandler> {
  return {
    list_tasks(input) {
      return listTasks(input, request);
    },
    search_tasks(input) {
      return searchTasks(input, request);
    },
    get_task(input) {
      return getTask(input, request);
    },
    create_task(input) {
      return createTask(input, request);
    },
    update_task(input) {
      return updateTask(input, request);
    },
    complete_task(input) {
      return setTaskCompletion(input, request, true);
    },
    reopen_task(input) {
      return setTaskCompletion(input, request, false);
    },
    manage_task_assignees(input) {
      return manageAssignees(input, request);
    },
    manage_task_followers(input) {
      return manageFollowers(input, request);
    },
    set_task_ancestor(input) {
      return setTaskAncestor(input, request);
    },
    get_related_tasks(input) {
      return getRelatedTasks(input, request);
    },
    add_task_comment(input) {
      return addComment(input, request);
    },
    manage_task_reminders(input) {
      return manageReminders(input, request);
    },
    create_tasklist(input) {
      return createTasklist(input, request);
    },
    search_tasklists(input) {
      return searchTasklists(input, request);
    },
    add_task_to_tasklist(input) {
      return addTaskToTasklist(input, request);
    },
    manage_tasklist_members(input) {
      return manageTasklistMembers(input, request);
    },
  };
}

async function listTasks(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/task/v2/tasks",
    query: {
      type: optionalString(input.type) ?? "my_tasks",
      completed: optionalBoolean(input.completed),
      page_size: optionalNumber(input.pageSize) ?? 50,
      page_token: optionalString(input.pageToken),
      user_id_type: optionalString(input.userIdType) ?? "open_id",
    },
  });
  return normalizePage(data);
}

async function searchTasks(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const filter = compact({
    creator_ids: optionalStringArray(input.creatorIds),
    assignee_ids: optionalStringArray(input.assigneeIds),
    follower_ids: optionalStringArray(input.followerIds),
    is_completed: optionalBoolean(input.completed),
    due_time: timeRange(input.dueStart, input.dueEnd),
  });
  if (!optionalString(input.query) && Object.keys(filter).length === 0) {
    throw providerInputError("task search requires query or at least one filter");
  }
  const data = await request({
    method: "POST",
    path: "/task/v2/tasks/search",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: compact({
      query: optionalString(input.query) ?? "",
      filter: Object.keys(filter).length > 0 ? filter : undefined,
      page_token: optionalString(input.pageToken),
    }),
  });
  return normalizePage(data);
}

async function getTask(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const task = await fetchTask(taskGuid, input.userIdType, request);
  return { task };
}

async function createTask(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/task/v2/tasks",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: compact({
      summary: requiredString(input.summary, "summary"),
      description: optionalString(input.description),
      start: optionalTaskTime(input.start),
      due: optionalTaskTime(input.due),
      members: optionalMembers(input.members),
      tasklists: optionalStringArray(input.tasklistGuids)?.map((tasklistGuid) => ({
        tasklist_guid: tasklistGuid,
      })),
      reminders: optionalNumberArray(input.reminderOffsetsMinutes)?.map((minutes) => ({
        relative_fire_minute: minutes,
      })),
      client_token: optionalString(input.clientToken),
    }),
  });
  return { task: recordValue(data.task) };
}

async function updateTask(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const task: Record<string, unknown> = {};
  if (input.summary !== undefined) {
    task.summary = requiredString(input.summary, "summary");
  }
  if (input.description !== undefined) {
    task.description = String(input.description);
  }
  if (input.start !== undefined || input.clearStart === true) {
    task.start = input.clearStart === true ? null : optionalTaskTime(input.start);
  }
  if (input.due !== undefined || input.clearDue === true) {
    task.due = input.clearDue === true ? null : optionalTaskTime(input.due);
  }
  const updateFields = Object.keys(task);
  if (updateFields.length === 0) {
    throw providerInputError("at least one task field must be updated");
  }
  const data = await request({
    method: "PATCH",
    path: `/task/v2/tasks/${encode(taskGuid)}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: { task, update_fields: updateFields },
  });
  return { task: recordValue(data.task) };
}

async function setTaskCompletion(input: Record<string, unknown>, request: FeishuJsonRequest, completed: boolean) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const data = await request({
    method: "PATCH",
    path: `/task/v2/tasks/${encode(taskGuid)}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: {
      task: { completed_at: completed ? Date.now().toString() : "0" },
      update_fields: ["completed_at"],
    },
  });
  return { task: recordValue(data.task) };
}

async function manageAssignees(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const operation = requiredString(input.operation, "operation");
  const assigneeIds = requiredStringArray(input.assigneeIds, "assigneeIds");
  const data = await request({
    method: "POST",
    path: `/task/v2/tasks/${encode(taskGuid)}/${operation === "add" ? "add_members" : "remove_members"}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: compact({
      members: assigneeIds.map((id) => ({
        id,
        role: "assignee",
        type: id.startsWith("cli_") ? "app" : "user",
      })),
      client_token: operation === "add" ? optionalString(input.clientToken) : undefined,
    }),
  });
  return { task: recordValue(data.task) };
}

async function manageFollowers(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const operation = requiredString(input.operation, "operation");
  const followerIds = requiredStringArray(input.followerIds, "followerIds");
  const data = await request({
    method: "POST",
    path: `/task/v2/tasks/${encode(taskGuid)}/${operation === "add" ? "add_members" : "remove_members"}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: compact({
      members: followerIds.map((id) => ({
        id,
        role: "follower",
        type: id.startsWith("cli_") ? "app" : "user",
      })),
      client_token: operation === "add" ? optionalString(input.clientToken) : undefined,
    }),
  });
  return { task: recordValue(data.task) };
}

async function setTaskAncestor(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const ancestorGuid = optionalString(input.ancestorGuid);
  const data = await request({
    method: "POST",
    path: `/task/v2/tasks/${encode(taskGuid)}/set_ancestor_task`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: ancestorGuid ? { ancestor_guid: ancestorGuid } : {},
  });
  return {
    taskGuid,
    ancestorGuid: ancestorGuid ?? null,
    raw: data,
  };
}

async function getRelatedTasks(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fetchAll = optionalBoolean(input.fetchAll) === true;
  const maxPages = Math.min(optionalNumber(input.maxPages) ?? 20, 40);
  const items: Record<string, unknown>[] = [];
  let pageToken = optionalString(input.pageToken);
  let hasMore = false;
  let pagesFetched = 0;
  do {
    const data = await request({
      path: "/task/v2/task_v2/list_related_task",
      query: {
        user_id_type: optionalString(input.userIdType) ?? "open_id",
        page_size: 100,
        page_token: pageToken,
        completed: input.includeCompleted === false ? false : undefined,
      },
    });
    items.push(...recordArray(data.items));
    hasMore = data.has_more === true;
    pageToken = optionalString(data.page_token);
    pagesFetched++;
  } while (fetchAll && hasMore && pageToken && pagesFetched < maxPages);
  return {
    items,
    hasMore,
    pageToken: pageToken ?? null,
  };
}

async function addComment(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/task/v2/comments",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: {
      content: requiredString(input.content, "content"),
      resource_id: requiredString(input.taskGuid, "taskGuid"),
      resource_type: "task",
    },
  });
  return { comment: recordValue(data.comment) };
}

async function manageReminders(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const operation = requiredString(input.operation, "operation");
  const userIdType = optionalString(input.userIdType) ?? "open_id";
  if (operation === "add") {
    const offsets = requiredNumberArray(input.offsetsMinutes, "offsetsMinutes");
    await request({
      method: "POST",
      path: `/task/v2/tasks/${encode(taskGuid)}/add_reminders`,
      query: { user_id_type: userIdType },
      body: {
        reminders: offsets.map((minutes) => ({ relative_fire_minute: minutes })),
      },
    });
  } else if (operation === "remove") {
    await request({
      method: "POST",
      path: `/task/v2/tasks/${encode(taskGuid)}/remove_reminders`,
      query: { user_id_type: userIdType },
      body: {
        reminder_ids: requiredStringArray(input.reminderIds, "reminderIds"),
      },
    });
  }
  const task = await fetchTask(taskGuid, userIdType, request);
  return {
    task,
    reminders: recordArray(task.reminders),
  };
}

async function createTasklist(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/task/v2/tasklists",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: compact({
      name: requiredString(input.name, "name"),
      members: optionalMembers(input.members),
    }),
  });
  return { tasklist: recordValue(data.tasklist) };
}

async function searchTasklists(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const ownerIds = optionalStringArray(input.ownerIds);
  if (!optionalString(input.query) && !ownerIds?.length) {
    throw providerInputError("tasklist search requires query or ownerIds");
  }
  const data = await request({
    method: "POST",
    path: "/task/v2/tasklists/search",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: compact({
      query: optionalString(input.query) ?? "",
      filter: ownerIds ? { user_id: ownerIds } : undefined,
      page_token: optionalString(input.pageToken),
    }),
  });
  return normalizePage(data);
}

async function addTaskToTasklist(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskGuid = requiredString(input.taskGuid, "taskGuid");
  const data = await request({
    method: "POST",
    path: `/task/v2/tasks/${encode(taskGuid)}/add_tasklist`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: {
      tasklist_guid: requiredString(input.tasklistGuid, "tasklistGuid"),
    },
  });
  return { task: recordValue(data.task) };
}

async function manageTasklistMembers(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const tasklistGuid = requiredString(input.tasklistGuid, "tasklistGuid");
  const operation = requiredString(input.operation, "operation");
  const members = requiredMembers(input.members, "members");
  const data = await request({
    method: "POST",
    path: `/task/v2/tasklists/${encode(tasklistGuid)}/${operation === "add" ? "add_members" : "remove_members"}`,
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: { members },
  });
  return { tasklist: recordValue(data.tasklist) };
}

async function fetchTask(taskGuid: string, userIdType: unknown, request: FeishuJsonRequest) {
  const data = await request({
    path: `/task/v2/tasks/${encode(taskGuid)}`,
    query: { user_id_type: optionalString(userIdType) ?? "open_id" },
  });
  return recordValue(data.task);
}

function taskTime(value: unknown) {
  const raw = requiredString(value, "time");
  const isDateOnly = raw.length === 10 && raw[4] === "-" && raw[7] === "-";
  const numeric = Number(raw);
  const milliseconds = Number.isFinite(numeric) ? numeric : Date.parse(raw);
  if (!Number.isFinite(milliseconds)) {
    throw providerInputError("task time must be an RFC 3339 date-time, date, or Unix timestamp");
  }
  return {
    timestamp: Math.trunc(milliseconds).toString(),
    is_all_day: isDateOnly,
  };
}

function optionalTaskTime(value: unknown) {
  return value == null ? undefined : taskTime(value);
}

function timeRange(start: unknown, end: unknown) {
  if (start == null && end == null) {
    return undefined;
  }
  const range: Record<string, unknown> = {};
  if (start != null) {
    range.start_time = rfc3339(start, "dueStart");
  }
  if (end != null) {
    range.end_time = rfc3339(end, "dueEnd");
  }
  return range;
}

function rfc3339(value: unknown, field: string) {
  const raw = requiredString(value, field);
  const numeric = Number(raw);
  const milliseconds = Number.isFinite(numeric) ? numeric : Date.parse(raw);
  if (!Number.isFinite(milliseconds)) {
    throw providerInputError(`${field} must be an RFC 3339 date-time or Unix timestamp`);
  }
  return new Date(milliseconds).toISOString();
}

function normalizePage(data: Record<string, unknown>) {
  return {
    items: recordArray(data.items),
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
  };
}

function optionalMembers(value: unknown) {
  return value === undefined ? undefined : requiredMembers(value, "members");
}

function requiredMembers(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw providerInputError(`${field} must be an array`);
  }
  return value.map((item, index) => {
    const member = recordValue(item);
    return {
      id: requiredString(member.id, `${field}.${index}.id`),
      type: requiredString(member.type, `${field}.${index}.type`),
      role: requiredString(member.role, `${field}.${index}.role`),
    };
  });
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw providerInputError(`${field} must be a non-empty string`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredStringArray(value: unknown, field: string) {
  const values = optionalStringArray(value);
  if (!values || values.length === 0) {
    throw providerInputError(`${field} must contain at least one string`);
  }
  return values;
}

function optionalStringArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  return values.length > 0 ? values : undefined;
}

function requiredNumberArray(value: unknown, field: string) {
  const values = optionalNumberArray(value);
  if (!values || values.length === 0) {
    throw providerInputError(`${field} must contain at least one number`);
  }
  return values;
}

function optionalNumberArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  const values = Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
    : [];
  return values.length > 0 ? values : undefined;
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function encode(value: string) {
  return encodeURIComponent(value);
}
