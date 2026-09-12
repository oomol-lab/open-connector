import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { GranolaMeeting } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  requiredBoolean,
  requiredRawString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const granolaApiBaseUrl = "https://public-api.granola.ai";

type GranolaRequestMode = "validate" | "execute";

export const granolaActionHandlers: ProviderActionHandlers<"granola", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_notes(input, context) {
    const payload = await requestGranola(context, buildListNotesUrl(input), "execute");
    const record = requiredResponseRecord(payload, "Granola notes response");
    return {
      notes: Array.isArray(record.notes) ? record.notes : [],
      hasMore: Boolean(record.hasMore),
      cursor: optionalString(record.cursor) ?? null,
      nextCursor: optionalString(record.cursor) ?? null,
    };
  },
  async get_note(input, context) {
    const payload = await requestGranola(context, buildGetNoteUrl(input), "execute");
    return { note: requiredResponseRecord(payload, "Granola note response") };
  },
  async list_folders(input, context) {
    const payload = await requestGranola(context, buildListFoldersUrl(input), "execute");
    const record = requiredResponseRecord(payload, "Granola folders response");
    return {
      folders: Array.isArray(record.folders) ? record.folders : [],
      hasMore: Boolean(record.hasMore),
      cursor: optionalString(record.cursor) ?? null,
      nextCursor: optionalString(record.cursor) ?? null,
    };
  },
  list_meetings(_input, context) {
    return runProviderRequest({ signal: context.signal, label: "Granola meetings" }, async (signal) => {
      const createdAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const meetings: GranolaMeeting[] = [];
      const cursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const payload = await requestGranola(
          { ...context, signal },
          buildListNotesUrl({ created_after: createdAfter, page_size: 30, cursor }),
          "execute",
        );
        const page = requiredResponseRecord(payload, "Granola notes response");
        meetings.push(...objectArray(page.notes, "Granola notes", providerResponseError).map(normalizeGranolaMeeting));
        if (!requiredBoolean(page.hasMore, "Granola hasMore", providerResponseError)) break;
        cursor = requiredString(page.cursor, "Granola next cursor", providerResponseError);
        if (cursors.has(cursor)) throw providerResponseError("Granola returned a repeated pagination cursor.");
        cursors.add(cursor);
      } while (cursor);
      return { meetings };
    });
  },
  get_meetings(input, context) {
    const ids = requiredStringArray(input.meeting_ids, "meeting_ids", providerInputError);
    return runProviderRequest({ signal: context.signal, label: "Granola meetings" }, async (signal) => {
      const meetings: GranolaMeeting[] = [];
      for (const id of ids) {
        const note = await readGranolaMeeting({ ...context, signal }, id);
        meetings.push(normalizeGranolaMeeting(note));
      }
      return { meetings };
    });
  },
  async get_meeting_transcript(input, context) {
    const meetingId = requiredInputString(input.meeting_id, "meeting_id");
    const note = await readGranolaMeeting(context, meetingId, "transcript");
    const segments = objectArray(note.transcript ?? [], "Granola transcript", providerResponseError);
    const transcript = segments
      .map((segment) => {
        const text = requiredRawString(segment.text, "Granola transcript text", providerResponseError);
        if (!text.trim()) return "";
        const speaker = optionalRecord(segment.speaker);
        const label = optionalString(speaker?.diarization_label) ?? optionalString(speaker?.source);
        const timestamp = optionalString(segment.start_time);
        return `${timestamp ? `[${timestamp}] ` : ""}${label ? `${label}: ` : ""}${text}`;
      })
      .filter(Boolean)
      .join("\n");
    if (!transcript.trim()) throw providerResponseError("Granola transcript is not available yet.");
    return { meeting_id: meetingId, transcript };
  },
};

async function readGranolaMeeting(
  context: ApiKeyProviderContext,
  id: string,
  include?: string,
): Promise<Record<string, unknown>> {
  const payload = await requestGranola(context, buildGetNoteUrl({ note_id: id, include }), "execute");
  const note = requiredResponseRecord(payload, "Granola note response");
  if (note.id !== id) throw providerResponseError("Granola returned a different meeting identity.");
  return note;
}

function normalizeGranolaMeeting(note: Record<string, unknown>): GranolaMeeting {
  const calendarEvent = optionalRecord(note.calendar_event);
  const attendees =
    note.attendees == null ? undefined : objectArray(note.attendees, "Granola attendees", providerResponseError);
  return {
    id: requiredString(note.id, "Granola meeting ID", providerResponseError),
    title: rawStringOrNull(note.title),
    date: optionalString(calendarEvent?.scheduled_start_time),
    attendees: attendees
      ?.map((attendee) => {
        const email = requiredString(attendee.email, "Granola attendee email", providerResponseError);
        const name = optionalString(attendee.name);
        return name ? `${name} <${email}>` : email;
      })
      .join(", "),
    summary: optionalRawString(note.summary_markdown) ?? optionalRawString(note.summary_text),
  };
}

export async function validateGranolaCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestGranola(
    { apiKey, fetcher, signal },
    granolaUrl("/v1/folders", { page_size: 1 }),
    "validate",
  );
  const record = requiredResponseRecord(payload, "Granola folders response");
  const folders = Array.isArray(record.folders) ? record.folders : [];
  const firstFolder = optionalRecord(folders[0]);
  const firstFolderName = optionalString(firstFolder?.name);
  const firstFolderId = optionalString(firstFolder?.id);

  return {
    profile: {
      accountId: firstFolderId,
      displayName: firstFolderName ?? firstFolderId ?? "Granola API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: granolaApiBaseUrl,
      validationEndpoint: "/v1/folders",
      firstFolderId,
      firstFolderName,
    }),
  };
}

function buildListNotesUrl(input: Record<string, unknown>): URL {
  return granolaUrl("/v1/notes", {
    created_before: input.created_before,
    created_after: input.created_after,
    updated_after: input.updated_after,
    folder_id: input.folder_id,
    cursor: input.cursor,
    page_size: input.page_size,
  });
}

function buildGetNoteUrl(input: Record<string, unknown>): URL {
  return granolaUrl(`/v1/notes/${encodeURIComponent(requiredInputString(input.note_id, "note_id"))}`, {
    include: input.include,
  });
}

function buildListFoldersUrl(input: Record<string, unknown>): URL {
  return granolaUrl("/v1/folders", {
    cursor: input.cursor,
    page_size: input.page_size,
  });
}

function granolaUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, granolaApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function requestGranola(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  url: URL,
  mode: GranolaRequestMode,
): Promise<unknown> {
  return runProviderRequest({ signal: context.signal, label: "Granola" }, async (signal) => {
    const response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    await assertGranolaResponse(response, mode);
    return readProviderJsonBody(response, {
      emptyBody: {},
      trimEmptyBody: false,
      invalidJsonMessage: "invalid Granola response",
    });
  });
}

async function assertGranolaResponse(response: Response, mode: GranolaRequestMode): Promise<void> {
  if (response.ok) {
    return;
  }

  const record = optionalRecord(
    await readProviderJsonBody(response, {
      emptyBody: {},
      trimEmptyBody: false,
      invalidJsonMessage: `Granola request failed with ${response.status}`,
    }),
  );
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Granola request failed with ${response.status}`;
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, message);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message);
}
