import type { TransitFileWriter } from "../../../core/types.ts";
import type { FeishuJsonRequest } from "./client.ts";

import { ProviderRequestError } from "../../provider-runtime.ts";
import { storeFeishuTransitBytes } from "./media.ts";
import { FeishuPagination } from "./pagination.ts";

interface NoteHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export interface FeishuNoteRuntimeDeps {
  readonly request: FeishuJsonRequest;
  readonly transitFiles?: TransitFileWriter;
  readonly signal?: AbortSignal;
}

export function createFeishuNoteActionHandlers(deps: FeishuNoteRuntimeDeps): Record<string, NoteHandler> {
  return {
    get_vc_note: (input) => getNote(input, deps.request),
    get_vc_meeting_note: (input) => getMeetingNote(input, deps.request),
    download_vc_note_transcript: (input) => downloadTranscript(input, deps),
  };
}

async function getNote(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const noteId = requiredString(input.noteId, "noteId");
  const data = await request({ path: `/vc/v1/notes/${encodeURIComponent(noteId)}` });
  return normalizeNote(noteId, recordValue(data.note));
}

async function getMeetingNote(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const meetingId = requiredString(input.meetingId, "meetingId");
  const meetingData = await request({
    path: `/vc/v1/meetings/${encodeURIComponent(meetingId)}`,
    query: { with_participants: false, query_mode: 0 },
  });
  const meeting = recordValue(meetingData.meeting);
  const noteId = requiredString(meeting.note_id, "meeting.note_id");
  const noteData = await request({ path: `/vc/v1/notes/${encodeURIComponent(noteId)}` });
  return {
    meetingId,
    note: normalizeNote(noteId, recordValue(noteData.note)),
  };
}

async function downloadTranscript(input: Record<string, unknown>, deps: FeishuNoteRuntimeDeps) {
  const noteId = requiredString(input.noteId, "noteId");
  const format = optionalString(input.format) ?? "markdown";
  const locale = optionalString(input.locale) ?? "zh_cn";
  const detailData = await deps.request({ path: `/vc/v1/notes/${encodeURIComponent(noteId)}` });
  const note = recordValue(detailData.note);
  if (displayType(note) !== "unified") {
    throw new ProviderRequestError(400, `Feishu note ${noteId} is not a unified note`);
  }

  const chunks: string[] = [];
  const pagination = new FeishuPagination("note transcript");
  let cursor: string | undefined;
  for (let page = 0; page < 500; page++) {
    const data = await deps.request({
      path: `/vc/v1/notes/${encodeURIComponent(noteId)}/unified_note_transcript`,
      query: {
        format,
        locale,
        page_size: 200,
        cursor_id: cursor,
      },
    });
    const transcript = recordValue(data.transcript);
    const chunk = optionalString(transcript[format]);
    if (chunk) {
      chunks.push(chunk);
    }
    cursor = pagination.next(data.has_more, scalarString(data.next_cursor_id));
    if (!cursor) break;
  }
  if (cursor) {
    throw new ProviderRequestError(502, "Feishu note transcript exceeded 500 pages");
  }
  const content = chunks.join("");
  if (!content) {
    throw new ProviderRequestError(502, "Feishu note transcript is empty");
  }
  const transit = requireTransit(deps);
  const extension = format === "plain_text" ? "txt" : "md";
  const mimeType = format === "plain_text" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8";
  const fileName = optionalString(input.fileName) ?? `${noteId}-transcript.${extension}`;
  const bytes = new TextEncoder().encode(content);
  const uploaded = await storeFeishuTransitBytes(bytes, fileName, mimeType, transit);
  return {
    noteId,
    format,
    locale,
    file: uploaded,
  };
}

function normalizeNote(noteId: string, note: Record<string, unknown>) {
  let noteDocumentToken = "";
  let verbatimDocumentToken = "";
  for (const artifact of recordArray(note.artifacts)) {
    const artifactType = Number(artifact.artifact_type);
    const documentToken = optionalString(artifact.doc_token) ?? "";
    if (artifactType === 1) {
      noteDocumentToken = documentToken;
    } else if (artifactType === 2) {
      verbatimDocumentToken = documentToken;
    }
  }
  return {
    noteId,
    displayType: displayType(note),
    creatorId: optionalString(note.creator_id) ?? "",
    createTime: scalarString(note.create_time) ?? "",
    noteDocumentToken,
    verbatimDocumentToken,
    sharedDocumentTokens: recordArray(note.references)
      .map((reference) => optionalString(reference.doc_token))
      .filter((token): token is string => token != null),
    raw: note,
  };
}

function displayType(note: Record<string, unknown>) {
  const value = Number(note.note_display_type ?? note.display_type);
  if (value === 1) {
    return "normal";
  } else if (value === 2) {
    return "unified";
  } else {
    return "unknown";
  }
}

function requireTransit(deps: FeishuNoteRuntimeDeps): TransitFileWriter {
  if (!deps.transitFiles) {
    throw new ProviderRequestError(400, "local transit file storage is not configured");
  }
  return deps.transitFiles;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => item != null && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function requiredString(value: unknown, field: string) {
  const result = optionalString(value);
  if (result) {
    return result;
  }
  throw new ProviderRequestError(400, `${field} must be a non-empty string`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function scalarString(value: unknown) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  } else {
    return undefined;
  }
}
