import type { CredentialValidationResult } from "../../core/types.ts";
import type { GetnoteActionName } from "./actions.ts";

import {
  nullableString,
  optionalNumber,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const getnoteBaseUrl = "https://openapi.biji.com";
const getnoteRequestTimeoutMs = 30_000;

type GetnoteContext = {
  apiKey: string;
  clientId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};

type GetnoteActionHandler = (input: Record<string, unknown>, context: GetnoteContext) => Promise<unknown>;

type GetnoteRequest = {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
};

type GetnoteEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  error?: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export async function validateGetnoteCredential(
  input: {
    apiKey: string;
    values?: Record<string, string>;
  },
  fetcher: typeof fetch = providerFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readGetnoteApiKey(input.apiKey);
  const clientId = readGetnoteClientId(input);
  const data = await getnoteRequest(
    { apiKey, clientId, fetcher, signal },
    {
      path: "/open/api/v1/resource/knowledge/list",
      query: { page: 1 },
    },
  );
  const firstTopic = normalizeTopic(readArrayField(data.data, "topics")[0]);

  return {
    profile: {
      accountId: `getnote:${clientId}`,
      displayName: `Getnote · ${clientId}`,
    },
    grantedScopes: [],
    metadata: {
      clientId,
      validationEndpoint: "/open/api/v1/resource/knowledge/list",
      ...(firstTopic.topicId ? { firstKnowledgeBaseId: firstTopic.topicId } : {}),
      ...(firstTopic.name ? { firstKnowledgeBaseName: firstTopic.name } : {}),
    },
  };
}

export const getnoteActionHandlers: Record<GetnoteActionName, GetnoteActionHandler> = {
  save_note: saveNote,
  get_save_task: getSaveTask,
  list_notes: listNotes,
  get_note: getNote,
  update_note: updateNote,
  delete_note: deleteNote,
  share_note: shareNote,
  list_note_tags: listNoteTags,
  add_note_tags: addNoteTags,
  remove_note_tag: removeNoteTag,
  search_notes: searchNotes,
  list_knowledge_bases(input, context) {
    return listKnowledgeBases(input, context, false);
  },
  list_subscribed_knowledge_bases(input, context) {
    return listKnowledgeBases(input, context, true);
  },
  create_knowledge_base: createKnowledgeBase,
  list_knowledge_base_notes: listKnowledgeBaseNotes,
  add_notes_to_knowledge_base: addNotesToKnowledgeBase,
  remove_notes_from_knowledge_base: removeNotesFromKnowledgeBase,
  list_knowledge_base_bloggers: listKnowledgeBaseBloggers,
  list_blogger_contents: listBloggerContents,
  get_blogger_content: getBloggerContent,
  list_knowledge_base_lives: listKnowledgeBaseLives,
  get_live_detail: getLiveDetail,
  follow_live: followLive,
};

export function readGetnoteApiKey(apiKey: unknown): string {
  const value = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!value) {
    throw new ProviderRequestError(400, "getnote apiKey is required");
  }
  return value;
}

export function readGetnoteClientId(input: {
  clientId?: string;
  values?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): string {
  const value = input.clientId?.trim() || input.values?.clientId?.trim() || optionalString(input.metadata?.clientId);
  if (!value) {
    throw new ProviderRequestError(400, "getnote clientId is required");
  }
  return value;
}

async function saveNote(input: Record<string, unknown>, context: GetnoteContext) {
  const noteType = readOptionalString(input.noteType) ?? inferNoteType(input);
  if (noteType === "link" && !readOptionalString(input.linkUrl)) {
    throw new ProviderRequestError(400, "linkUrl is required when noteType is link");
  }
  if (noteType === "img_text" && readStringArray(input.imageUrls).length === 0) {
    throw new ProviderRequestError(400, "imageUrls is required when noteType is img_text");
  }

  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/note/save",
    body: compactObject({
      note_type: noteType,
      title: readOptionalString(input.title),
      content: readOptionalString(input.content),
      tags: readStringArray(input.tags),
      parent_id: readOptionalString(input.parentId),
      link_url: readOptionalString(input.linkUrl),
      image_urls: readStringArray(input.imageUrls),
      topic_id: readOptionalString(input.topicId),
    }),
  });

  return {
    success: data.success,
    noteId: readNullableId(data.data.note_id),
    title: readNullableString(data.data.title),
    createdAt: readNullableString(data.data.created_at),
    updatedAt: readNullableString(data.data.updated_at),
    tasks: readArrayField(data.data, "tasks").map(normalizeTask),
    raw: data.data,
  };
}

async function getSaveTask(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/note/task/progress",
    body: {
      task_id: readRequiredString(input.taskId, "taskId"),
    },
  });

  return {
    success: data.success,
    status: readOptionalString(data.data.status) ?? "unknown",
    noteId: readNullableId(data.data.note_id),
    raw: data.data,
  };
}

async function listNotes(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    path: "/open/api/v1/resource/note/list",
    query: {
      cursor: readOptionalString(input.cursor),
    },
  });

  return {
    success: data.success,
    notes: readArrayField(data.data, "notes").map(normalizeNoteSummary),
    hasMore: optionalBoolean(data.data.has_more) ?? false,
    cursor: readNullableId(data.data.cursor),
    raw: data.data,
  };
}

async function getNote(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    path: "/open/api/v1/resource/note/detail",
    query: {
      id: readRequiredString(input.noteId, "noteId"),
      image_quality: readOptionalString(input.imageQuality),
    },
  });
  const note = normalizeNoteDetail(optionalRecord(data.data.note) ?? data.data);

  return {
    success: data.success,
    note,
    raw: data.data,
  };
}

async function updateNote(input: Record<string, unknown>, context: GetnoteContext) {
  if (input.title == null && input.content == null && input.tags == null) {
    throw new ProviderRequestError(400, "at least one of title, content, or tags is required");
  }

  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/note/update",
    body: compactObject({
      note_id: readRequiredString(input.noteId, "noteId"),
      title: readOptionalString(input.title),
      content: readOptionalString(input.content),
      tags: readStringArray(input.tags),
    }),
  });

  return mutationOutput(data);
}

async function deleteNote(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/note/delete",
    body: {
      note_id: readRequiredString(input.noteId, "noteId"),
    },
  });

  return mutationOutput(data);
}

async function shareNote(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/note/sharing",
    body: compactObject({
      note_id: readRequiredString(input.noteId, "noteId"),
      share_exclude_audio: optionalBoolean(input.excludeAudio),
    }),
  });

  return {
    success: data.success,
    noteId: readNullableId(data.data.note_id),
    shareId: readNullableId(data.data.share_id),
    shareUrl: readNullableString(data.data.share_url),
    raw: data.data,
  };
}

async function listNoteTags(input: Record<string, unknown>, context: GetnoteContext) {
  const detail = await getNote(input, context);
  const rawTags = readArrayField(detail.note.raw, "tags");

  return {
    success: detail.success,
    noteId: readNullableId(detail.note.noteId),
    tags: rawTags.map(normalizeTag),
    raw: detail.note.raw,
  };
}

async function addNoteTags(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/note/tags/add",
    body: {
      note_id: readRequiredString(input.noteId, "noteId"),
      tags: readStringArray(input.tags),
    },
  });

  return mutationOutput(data);
}

async function removeNoteTag(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/note/tags/delete",
    body: {
      note_id: readRequiredString(input.noteId, "noteId"),
      tag_id: readRequiredString(input.tagId, "tagId"),
    },
  });

  return mutationOutput(data);
}

async function searchNotes(input: Record<string, unknown>, context: GetnoteContext) {
  const topicId = readOptionalString(input.topicId);
  const data = await getnoteRequest(context, {
    method: "POST",
    path: topicId ? "/open/api/v1/resource/recall/knowledge" : "/open/api/v1/resource/recall",
    body: compactObject({
      topic_id: topicId,
      query: readRequiredString(input.query, "query"),
      top_k: optionalNumber(input.topK),
    }),
  });

  return {
    success: data.success,
    results: readArrayField(data.data, "results").map(normalizeSearchResult),
    raw: data.data,
  };
}

async function listKnowledgeBases(input: Record<string, unknown>, context: GetnoteContext, subscribed: boolean) {
  const data = await getnoteRequest(context, {
    path: subscribed ? "/open/api/v1/resource/knowledge/subscribe/list" : "/open/api/v1/resource/knowledge/list",
    query: {
      page: optionalNumber(input.page),
    },
  });

  return {
    success: data.success,
    topics: readArrayField(data.data, "topics").map(normalizeTopic),
    total: nullableNumber(data.data.total),
    hasMore: nullableBoolean(data.data.has_more),
    raw: data.data,
  };
}

async function createKnowledgeBase(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/knowledge/create",
    body: compactObject({
      name: readRequiredString(input.name, "name"),
      description: readOptionalString(input.description),
    }),
  });

  return {
    success: data.success,
    topic: optionalRecord(data.data.topic) ?? data.data,
    raw: data.data,
  };
}

async function listKnowledgeBaseNotes(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    path: "/open/api/v1/resource/knowledge/notes",
    query: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      page: optionalNumber(input.page),
    },
  });

  return {
    success: data.success,
    notes: readArrayField(data.data, "notes").map(normalizeNoteSummary),
    hasMore: nullableBoolean(data.data.has_more),
    page: nullableNumber(data.data.page),
    raw: data.data,
  };
}

async function addNotesToKnowledgeBase(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/knowledge/note/batch-add",
    body: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      note_ids: readStringArray(input.noteIds),
    },
  });

  return mutationOutput(data);
}

async function removeNotesFromKnowledgeBase(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/knowledge/note/remove",
    body: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      note_ids: readStringArray(input.noteIds),
    },
  });

  return mutationOutput(data);
}

async function listKnowledgeBaseBloggers(input: Record<string, unknown>, context: GetnoteContext) {
  return listRawItems(context, {
    path: "/open/api/v1/resource/knowledge/bloggers",
    query: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      page: optionalNumber(input.page),
    },
    itemKeys: ["bloggers", "items", "list"],
  });
}

async function listBloggerContents(input: Record<string, unknown>, context: GetnoteContext) {
  return listRawItems(context, {
    path: "/open/api/v1/resource/knowledge/blogger/contents",
    query: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      follow_id: readRequiredString(input.followId, "followId"),
      page: optionalNumber(input.page),
    },
    itemKeys: ["contents", "posts", "items", "list"],
  });
}

async function getBloggerContent(input: Record<string, unknown>, context: GetnoteContext) {
  return getRawDetail(context, {
    path: "/open/api/v1/resource/knowledge/blogger/content/detail",
    query: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      post_id: readRequiredString(input.postId, "postId"),
    },
    itemKeys: ["content", "post", "detail"],
  });
}

async function listKnowledgeBaseLives(input: Record<string, unknown>, context: GetnoteContext) {
  return listRawItems(context, {
    path: "/open/api/v1/resource/knowledge/lives",
    query: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      page: optionalNumber(input.page),
    },
    itemKeys: ["lives", "items", "list"],
  });
}

async function getLiveDetail(input: Record<string, unknown>, context: GetnoteContext) {
  return getRawDetail(context, {
    path: "/open/api/v1/resource/knowledge/live/detail",
    query: {
      topic_id: readRequiredString(input.topicId, "topicId"),
      live_id: readRequiredString(input.liveId, "liveId"),
    },
    itemKeys: ["live", "detail"],
  });
}

async function followLive(input: Record<string, unknown>, context: GetnoteContext) {
  const data = await getnoteRequest(context, {
    method: "POST",
    path: "/open/api/v1/resource/knowledge/live/follow",
    body: compactObject({
      topic_id: readRequiredString(input.topicId, "topicId"),
      link: readRequiredString(input.link, "link"),
      platform: readOptionalString(input.platform),
    }),
  });

  return {
    success: data.success,
    item: optionalRecord(data.data.follow) ?? data.data,
    raw: data.data,
  };
}

async function listRawItems(context: GetnoteContext, input: GetnoteRequest & { itemKeys: string[] }) {
  const data = await getnoteRequest(context, input);
  return {
    success: data.success,
    items: readFirstArrayField(data.data, input.itemKeys),
    hasMore: nullableBoolean(data.data.has_more),
    page: nullableNumber(data.data.page),
    raw: data.data,
  };
}

async function getRawDetail(context: GetnoteContext, input: GetnoteRequest & { itemKeys: string[] }) {
  const data = await getnoteRequest(context, input);
  return {
    success: data.success,
    item: readFirstObjectField(data.data, input.itemKeys) ?? data.data,
    raw: data.data,
  };
}

async function getnoteRequest(context: GetnoteContext, request: GetnoteRequest) {
  const url = new URL(request.path, getnoteBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const timeoutSignal = AbortSignal.timeout(getnoteRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method ?? "GET",
      headers: getnoteHeaders(context, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Getnote request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Getnote request failed: ${error.message}` : "Getnote request failed",
      error,
    );
  }

  const payload = await readPayload(response);
  const envelope = normalizeEnvelope(payload);
  if (!response.ok || !envelope.success) {
    throw getnoteError(response, envelope);
  }
  return envelope;
}

function getnoteHeaders(context: GetnoteContext, hasBody: boolean) {
  return {
    accept: "application/json",
    authorization: context.apiKey,
    "x-client-id": context.clientId,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Getnote returned invalid JSON");
  }
}

function normalizeEnvelope(payload: unknown): GetnoteEnvelope {
  const raw = toRecord(payload);
  const data = optionalRecord(raw.data) ?? {};
  const success = typeof raw.success === "boolean" ? raw.success : true;
  return {
    success,
    data,
    error: optionalRecord(raw.error),
    raw,
  };
}

function getnoteError(response: Response, envelope: GetnoteEnvelope) {
  const code = envelope.error?.code;
  const message =
    optionalString(envelope.error?.message) ||
    optionalString(envelope.error?.msg) ||
    response.statusText ||
    "request failed";
  const reason = optionalString(envelope.error?.reason);
  const codeText = code == null ? String(response.status) : String(code);
  return new ProviderRequestError(
    getnoteErrorStatus(codeText, response.status),
    `Getnote request failed with ${codeText}: ${message}${reason ? ` (${reason})` : ""}`,
    envelope.raw,
  );
}

function getnoteErrorStatus(codeText: string, status: number) {
  if (status >= 400) {
    return status;
  }
  if (codeText === "10001") {
    return 401;
  }
  if (codeText === "10100") {
    return 404;
  }
  if (codeText === "10000") {
    return 400;
  }
  return 502;
}

function normalizeTask(value: unknown) {
  const raw = toRecord(value);
  return {
    taskId: readRequiredString(raw.task_id, "task_id"),
    url: readNullableString(raw.url),
    status: readNullableString(raw.status),
    raw,
  };
}

function normalizeNoteSummary(value: unknown) {
  const raw = toRecord(value);
  return {
    noteId: readNullableId(raw.note_id) ?? "",
    title: readNullableString(raw.title),
    content: readNullableString(raw.content),
    noteType: readNullableString(raw.note_type),
    tags: readArrayField(raw, "tags").map(toRecord),
    topics: readArrayField(raw, "topics").map(toRecord),
    createdAt: readNullableString(raw.created_at),
    updatedAt: readNullableString(raw.updated_at),
    raw,
  };
}

function normalizeNoteDetail(value: Record<string, unknown>) {
  return {
    ...value,
    noteId: readNullableId(value.note_id) ?? readNullableId(value.id) ?? "",
    title: readNullableString(value.title),
    content: readNullableString(value.content),
    noteType: readNullableString(value.note_type),
    raw: value,
  };
}

function normalizeSearchResult(value: unknown) {
  const raw = toRecord(value);
  return {
    noteId: readNullableId(raw.note_id),
    noteType: readNullableString(raw.note_type),
    title: readNullableString(raw.title),
    content: readNullableString(raw.content),
    score: nullableNumber(raw.score),
    createdAt: readNullableString(raw.created_at),
    raw,
  };
}

function normalizeTag(value: unknown) {
  const raw = toRecord(value);
  return {
    id: readNullableId(raw.id) ?? readNullableId(raw.tag_id),
    name: readNullableString(raw.name),
    type: readNullableString(raw.type),
    raw,
  };
}

function normalizeTopic(value: unknown) {
  const raw = optionalRecord(value) ?? {};
  const stats = optionalRecord(raw.stats);
  return {
    topicId: readNullableId(raw.topic_id),
    name: readNullableString(raw.name),
    description: readNullableString(raw.description),
    noteCount: nullableNumber(raw.note_count) ?? nullableNumber(stats?.note_count),
    createdAt: readNullableString(raw.created_at),
    raw,
  };
}

function mutationOutput(data: GetnoteEnvelope) {
  return {
    success: data.success,
    raw: data.data,
  };
}

function inferNoteType(input: Record<string, unknown>) {
  if (readOptionalString(input.linkUrl)) {
    return "link";
  }
  if (readStringArray(input.imageUrls).length > 0) {
    return "img_text";
  }
  return "plain_text";
}

function compactObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => {
      if (child === undefined || child === null || child === "") {
        return false;
      }
      return !Array.isArray(child) || child.length > 0;
    }),
  );
}

function readRequiredString(value: unknown, fieldName: string) {
  const output = readOptionalString(value);
  if (!output) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return output;
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readNullableString(value: unknown) {
  if (value == null) {
    return null;
  }
  return nullableString(value) ?? String(value);
}

function nullableNumber(value: unknown): number | null {
  return value == null ? null : (optionalNumber(value) ?? null);
}

function readNullableId(value: unknown) {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return null;
}

function nullableBoolean(value: unknown) {
  if (value == null) {
    return null;
  }
  return optionalBoolean(value) ?? null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function readArrayField(input: Record<string, unknown>, key: string) {
  return Array.isArray(input[key]) ? input[key] : [];
}

function readFirstArrayField(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) {
      return value.map((item) => toRecord(item));
    }
  }
  return [];
}

function readFirstObjectField(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = optionalRecord(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function toRecord(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "Getnote response object", (message) => new ProviderRequestError(502, message));
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
