import type { FeishuJsonRequest } from "./client.ts";

import { providerInputError } from "../../provider-runtime.ts";

interface MinutesActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuMinutesActionHandlers(request: FeishuJsonRequest): Record<string, MinutesActionHandler> {
  return {
    search_minutes: (input) => searchMinutes(input, request),
    get_minutes_detail: (input) => getMinutesDetail(input, request),
    get_minutes_transcript: (input) => getArtifact(input, request, "transcript"),
    get_minutes_summary: (input) => getArtifact(input, request, "summary"),
    get_minutes_todos: (input) => getTodos(input, request),
    get_minutes_download_metadata: (input) => getDownloadMetadata(input, request),
    update_minutes_title: (input) => updateMinutesTitle(input, request),
    apply_minutes_permission: (input) => applyMinutesPermission(input, request),
    replace_minutes_speaker: (input) => replaceMinutesSpeaker(input, request),
    replace_minutes_words: (input) => replaceMinutesWords(input, request),
    replace_minutes_summary: (input) => replaceMinutesSummary(input, request),
    manage_minutes_todos: (input) => manageMinutesTodos(input, request),
    search_vc_meetings: (input) => searchMeetings(input, request),
    get_vc_meeting: (input) => getMeeting(input, request),
    get_vc_recording_metadata: (input) => getRecording(input, request),
  };
}

async function updateMinutesTitle(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const topic = requiredString(input.topic, "topic");
  await request({
    method: "PATCH",
    path: `/minutes/v1/minutes/${encode(token)}`,
    body: { topic },
  });
  return { minuteToken: token, topic };
}

async function applyMinutesPermission(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const permission = requiredString(input.permission, "permission");
  await request({
    method: "POST",
    path: `/minutes/v1/minutes/${encode(token)}/permissions/apply`,
    body: { perm: permission },
  });
  return { minuteToken: token, permission };
}

async function replaceMinutesSpeaker(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const fromSpeakerId = optionalString(input.fromSpeakerId);
  const fromUserId = optionalString(input.fromUserId);
  const toUserId = requiredString(input.toUserId, "toUserId");
  if (Boolean(fromSpeakerId) === Boolean(fromUserId)) {
    throw providerInputError("provide exactly one of fromSpeakerId or fromUserId");
  }
  await request({
    method: "PUT",
    path: `/minutes/v1/minutes/${encode(token)}/transcript/speaker`,
    query: { user_id_type: "open_id" },
    body: {
      from_speaker_id: fromSpeakerId,
      from_user_id: fromUserId,
      to_user_id: toUserId,
    },
  });
  return {
    minuteToken: token,
    fromSpeakerId,
    fromUserId,
    toUserId,
  };
}

async function replaceMinutesWords(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const replacements = requireReplacements(input.replacements);
  await request({
    method: "PUT",
    path: `/minutes/v1/minutes/${encode(token)}/transcript/word`,
    body: {
      minute_token: token,
      replace_words: replacements.map((replacement) => ({
        source_word: replacement.sourceWord,
        target_word: replacement.targetWord,
      })),
    },
  });
  return { minuteToken: token, replacements };
}

async function replaceMinutesSummary(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const summary = requiredString(input.summary, "summary").trim();
  if (!summary) {
    throw providerInputError("summary must contain non-whitespace text");
  }
  await request({
    method: "PUT",
    path: `/minutes/v1/minutes/${encode(token)}/summary`,
    body: { summary },
  });
  return { minuteToken: token, updated: true };
}

async function manageMinutesTodos(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const todos = requireTodoMutations(input.todos);
  await request({
    method: "POST",
    path: `/minutes/v1/minutes/${encode(token)}/todo`,
    body: {
      todo_items: todos.map((todo) =>
        compact({
          operation: todo.operation,
          content: todo.content,
          is_done: todo.isDone,
          todo_id: todo.todoId,
        }),
      ),
    },
  });
  return {
    minuteToken: token,
    count: todos.length,
    updated: true,
  };
}

async function searchMinutes(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const filter = compact({
    owner_ids: optionalStringArray(input.ownerIds),
    participant_ids: optionalStringArray(input.participantIds),
    create_time: timeRange(input.startTime, input.endTime),
  });
  requireSearch(input.query, filter, "Minutes");
  const data = await request({
    method: "POST",
    path: "/minutes/v1/minutes/search",
    query: {
      page_size: optionalNumber(input.pageSize) ?? 15,
      page_token: optionalString(input.pageToken),
    },
    body: compact({
      query: optionalString(input.query),
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    }),
  });
  return normalizePage(data);
}

async function getMinutesDetail(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const data = await request({ path: `/minutes/v1/minutes/${encode(token)}` });
  return { minute: recordValue(data.minute) };
}

async function getArtifact(
  input: Record<string, unknown>,
  request: FeishuJsonRequest,
  field: "transcript" | "summary",
) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const data = await request({ path: `/minutes/v1/minutes/${encode(token)}/artifacts` });
  return {
    minuteToken: token,
    [field]: optionalString(data[field]) ?? "",
  };
}

async function getTodos(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const data = await request({ path: `/minutes/v1/minutes/${encode(token)}/artifacts` });
  return {
    minuteToken: token,
    items: recordArray(data.minute_todos ?? data.todos),
  };
}

async function getDownloadMetadata(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requiredString(input.minuteToken, "minuteToken");
  const data = await request({ path: `/minutes/v1/minutes/${encode(token)}/media` });
  return {
    minuteToken: token,
    downloadUrl: requiredString(data.download_url, "download_url"),
    raw: data,
  };
}

async function searchMeetings(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const meetingFilter = compact({
    participant_ids: optionalStringArray(input.participantIds),
    organizer_ids: optionalStringArray(input.organizerIds),
    open_room_ids: optionalStringArray(input.roomIds),
    start_time: timeRange(input.startTime, input.endTime),
  });
  requireSearch(input.query, meetingFilter, "video meeting");
  const data = await request({
    method: "POST",
    path: "/vc/v1/meetings/search",
    query: {
      page_size: optionalNumber(input.pageSize) ?? 15,
      page_token: optionalString(input.pageToken),
    },
    body: compact({
      query: optionalString(input.query),
      meeting_filter: Object.keys(meetingFilter).length > 0 ? meetingFilter : undefined,
    }),
  });
  return normalizePage(data);
}

async function getMeeting(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const meetingId = requiredString(input.meetingId, "meetingId");
  const data = await request({
    path: `/vc/v1/meetings/${encode(meetingId)}`,
    query: {
      with_participants: input.includeParticipants === true,
      query_mode: 0,
    },
  });
  return { meeting: recordValue(data.meeting) };
}

async function getRecording(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const meetingId = requiredString(input.meetingId, "meetingId");
  const data = await request({
    path: `/vc/v1/meetings/${encode(meetingId)}/recording`,
  });
  return {
    meetingId,
    recording: recordValue(data.recording),
  };
}

function timeRange(start: unknown, end: unknown) {
  if (!optionalString(start) && !optionalString(end)) {
    return undefined;
  }
  return compact({
    start_time: optionalString(start),
    end_time: optionalString(end),
  });
}

function requireSearch(query: unknown, filter: Record<string, unknown>, subject: string) {
  if (!optionalString(query) && Object.keys(filter).length === 0) {
    throw providerInputError(`${subject} search requires query or at least one filter`);
  }
}

function normalizePage(data: Record<string, unknown>) {
  return {
    items: recordArray(data.items),
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
  };
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
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

function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return values.length > 0 ? values : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireReplacements(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw providerInputError("replacements must contain at least one item");
  }
  return value.map((item) => {
    const record = recordValue(item);
    return {
      sourceWord: requiredString(record.sourceWord, "sourceWord"),
      targetWord: typeof record.targetWord === "string" ? record.targetWord : "",
    };
  });
}

interface MinutesTodoMutation {
  readonly operation: "add" | "update" | "delete";
  readonly content?: string;
  readonly isDone?: boolean;
  readonly todoId?: string;
}

function requireTodoMutations(value: unknown): MinutesTodoMutation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw providerInputError("todos must contain at least one item");
  }
  return value.map((item, index) => {
    const record = recordValue(item);
    const operation = requiredString(record.operation, `todos.${index}.operation`);
    const content = optionalString(record.content);
    const isDone = typeof record.isDone === "boolean" ? record.isDone : undefined;
    const todoId = optionalString(record.todoId);
    if (operation === "add" && content && typeof isDone === "boolean" && !todoId) {
      return { operation, content, isDone };
    } else if (operation === "update" && todoId && content && typeof isDone === "boolean") {
      return { operation, todoId, content, isDone };
    } else if (operation === "delete" && todoId && !content && isDone === undefined) {
      return { operation, todoId };
    } else {
      throw providerInputError(`todos.${index} fields do not match operation ${operation}`);
    }
  });
}

function encode(value: string) {
  return encodeURIComponent(value);
}
