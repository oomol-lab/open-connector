import type { AttioActionContext, AttioActionHandler } from "./runtime.ts";

import { optionalRecord } from "../../core/cast.ts";
import { requiredResponseRecord } from "../provider-runtime.ts";
import { attioRequest, readDataArray, readDataObject } from "./runtime.ts";

interface CrmRequest {
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

async function request(context: AttioActionContext, path: string, input: CrmRequest = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) searchParams.set(key, String(value));
  }

  return attioRequest(path, {
    ...context,
    method: input.method ?? "GET",
    phase: "execute",
    searchParams,
    body: input.body,
  });
}

function segment(value: unknown) {
  return encodeURIComponent(String(value));
}

function listPath(input: Record<string, unknown>) {
  return `/v2/lists/${segment(input.list)}`;
}

function entryPath(input: Record<string, unknown>) {
  return `${listPath(input)}/entries/${segment(input.entryId)}`;
}

function attributePath(input: Record<string, unknown>) {
  return `/v2/${segment(input.target)}/${segment(input.identifier)}/attributes/${segment(input.attribute)}`;
}

function offsetQuery(input: Record<string, unknown>) {
  return { limit: input.limit, offset: input.offset };
}

function viewQuery(input: Record<string, unknown>) {
  return { limit: input.limit, cursor: input.cursor, show_archived: input.showArchived };
}

function queryBody(input: Record<string, unknown>) {
  return {
    filter: input.filter,
    filter_view_id: input.filterViewId,
    sorts: input.sorts,
    limit: input.limit,
    offset: input.offset,
  };
}

function parentEntryBody(input: Record<string, unknown>) {
  return {
    data: {
      parent_object: input.parentObject,
      parent_record_id: input.parentRecordId,
      entry_values: input.entryValues ?? {},
    },
  };
}

function cursorPage(payload: unknown) {
  const pagination = requiredResponseRecord(payload, "Attio response").pagination;
  return pagination == null ? null : requiredResponseRecord(pagination, "Attio pagination");
}

async function remove(context: AttioActionContext, path: string) {
  await request(context, path, { method: "DELETE" });
  return { deleted: true };
}

export const crmActionHandlers: Record<string, AttioActionHandler> = {
  async search_records(input, context) {
    return {
      records: readDataArray(
        await request(context, "/v2/objects/records/search", {
          method: "POST",
          body: {
            query: input.query,
            objects: input.objects,
            request_as: input.requestAs ?? { type: "workspace" },
            limit: input.limit,
          },
        }),
      ),
    };
  },
  async list_select_options(input, context) {
    return {
      options: readDataArray(
        await request(context, `${attributePath(input)}/options`, {
          query: { show_archived: input.showArchived },
        }),
      ),
    };
  },
  async list_statuses(input, context) {
    return {
      statuses: readDataArray(
        await request(context, `${attributePath(input)}/statuses`, {
          query: { show_archived: input.showArchived },
        }),
      ),
    };
  },
  async list_object_views(input, context) {
    const payload = await request(context, `/v2/objects/${segment(input.object)}/views`, {
      query: viewQuery(input),
    });

    return { views: readDataArray(payload), pagination: cursorPage(payload) };
  },
  async list_list_views(input, context) {
    const payload = await request(context, `${listPath(input)}/views`, { query: viewQuery(input) });
    return { views: readDataArray(payload), pagination: cursorPage(payload) };
  },
  async list_lists(_input, context) {
    return { lists: readDataArray(await request(context, "/v2/lists")) };
  },
  async get_list(input, context) {
    return { list: readDataObject(await request(context, listPath(input))) };
  },
  async list_record_entries(input, context) {
    return {
      entries: readDataArray(
        await request(context, `/v2/objects/${segment(input.object)}/records/${segment(input.recordId)}/entries`, {
          query: offsetQuery(input),
        }),
      ),
    };
  },
  async list_entries(input, context) {
    return {
      entries: readDataArray(
        await request(context, `${listPath(input)}/entries/query`, {
          method: "POST",
          body: queryBody(input),
        }),
      ),
    };
  },
  async get_entry(input, context) {
    return { entry: readDataObject(await request(context, entryPath(input))) };
  },
  async create_entry(input, context) {
    return {
      entry: readDataObject(
        await request(context, `${listPath(input)}/entries`, {
          method: "POST",
          body: parentEntryBody(input),
        }),
      ),
    };
  },
  async upsert_entry(input, context) {
    return {
      entry: readDataObject(
        await request(context, `${listPath(input)}/entries`, {
          method: "PUT",
          body: parentEntryBody(input),
        }),
      ),
    };
  },
  async update_entry(input, context) {
    return {
      entry: readDataObject(
        await request(context, entryPath(input), {
          method: input.mode === "overwrite_multiselect" ? "PUT" : "PATCH",
          body: { data: { entry_values: input.entryValues } },
        }),
      ),
    };
  },
  delete_entry(input, context) {
    return remove(context, entryPath(input));
  },
  async list_notes(input, context) {
    return {
      notes: readDataArray(
        await request(context, "/v2/notes", {
          query: {
            ...offsetQuery(input),
            parent_object: input.parentObject,
            parent_record_id: input.parentRecordId,
          },
        }),
      ),
    };
  },
  async get_note(input, context) {
    return { note: readDataObject(await request(context, `/v2/notes/${segment(input.noteId)}`)) };
  },
  async create_note(input, context) {
    return {
      note: readDataObject(
        await request(context, "/v2/notes", {
          method: "POST",
          body: {
            data: {
              parent_object: input.parentObject,
              parent_record_id: input.parentRecordId,
              title: input.title,
              content: input.content,
              format: input.format ?? "plaintext",
              created_at: input.createdAt,
              meeting_id: input.meetingId,
            },
          },
        }),
      ),
    };
  },
  async update_note(input, context) {
    return {
      note: readDataObject(
        await request(context, `/v2/notes/${segment(input.noteId)}`, {
          method: "PATCH",
          body: {
            data: {
              title: input.title,
              content: input.content,
              format: input.format ?? (input.content === undefined ? undefined : "plaintext"),
            },
          },
        }),
      ),
    };
  },
  delete_note(input, context) {
    return remove(context, `/v2/notes/${segment(input.noteId)}`);
  },
  async list_tasks(input, context) {
    return {
      tasks: readDataArray(
        await request(context, "/v2/tasks", {
          query: {
            ...offsetQuery(input),
            sort: input.sort,
            linked_object: input.linkedObject,
            linked_record_id: input.linkedRecordId,
            assignee: input.assignee,
            is_completed: input.isCompleted,
          },
        }),
      ),
    };
  },
  async get_task(input, context) {
    return { task: readDataObject(await request(context, `/v2/tasks/${segment(input.taskId)}`)) };
  },
  async create_task(input, context) {
    return {
      task: readDataObject(
        await request(context, "/v2/tasks", {
          method: "POST",
          body: {
            data: {
              content: input.content,
              format: "plaintext",
              deadline_at: input.deadlineAt ?? null,
              is_completed: input.isCompleted ?? false,
              linked_records: input.linkedRecords ?? [],
              assignees: input.assignees ?? [],
            },
          },
        }),
      ),
    };
  },
  async update_task(input, context) {
    return {
      task: readDataObject(
        await request(context, `/v2/tasks/${segment(input.taskId)}`, {
          method: "PATCH",
          body: {
            data: {
              deadline_at: input.deadlineAt,
              is_completed: input.isCompleted,
              linked_records: input.linkedRecords,
              assignees: input.assignees,
            },
          },
        }),
      ),
    };
  },
  delete_task(input, context) {
    return remove(context, `/v2/tasks/${segment(input.taskId)}`);
  },
  async list_workspace_members(_input, context) {
    return { members: readDataArray(await request(context, "/v2/workspace_members")) };
  },
  async get_workspace_member(input, context) {
    return {
      member: readDataObject(await request(context, `/v2/workspace_members/${segment(input.memberId)}`)),
    };
  },
  async list_threads(input, context) {
    return {
      threads: readDataArray(
        await request(context, "/v2/threads", {
          query: {
            ...offsetQuery(input),
            object: input.object,
            record_id: input.recordId,
            list: input.list,
            entry_id: input.entryId,
          },
        }),
      ),
    };
  },
  async get_thread(input, context) {
    const payload = await request(context, `/v2/threads/${segment(input.threadId)}`, {
      query: {
        limit: input.limit,
        cursor: input.cursor,
        created_after: input.createdAfter ?? undefined,
      },
    });

    return { thread: readDataObject(payload), pagination: cursorPage(payload) };
  },
  async create_comment(input, context) {
    return {
      comment: readDataObject(
        await request(context, "/v2/comments", {
          method: "POST",
          body: {
            data: {
              content: input.content,
              format: "plaintext",
              author: { type: "workspace-member", id: input.authorId },
              created_at: input.createdAt,
              thread_id: input.threadId,
              record: optionalRecord(input.record),
              entry: optionalRecord(input.entry),
            },
          },
        }),
      ),
    };
  },
  async get_comment(input, context) {
    return {
      comment: readDataObject(await request(context, `/v2/comments/${segment(input.commentId)}`)),
    };
  },
  delete_comment(input, context) {
    return remove(context, `/v2/comments/${segment(input.commentId)}`);
  },
};
