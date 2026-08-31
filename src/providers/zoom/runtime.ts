import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

export const zoomApiBaseUrl = "https://api.zoom.us/v2";

type ZoomRequestPhase = "validate" | "execute";
type ZoomActionHandler = ProviderRuntimeHandler<OAuthProviderContext>;

interface ZoomRequestInput {
  context: Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;
  path: string;
  phase: ZoomRequestPhase;
  method?: "GET" | "POST" | "PATCH";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

export const zoomActionHandlers: ProviderActionHandlers<"zoom", ZoomActionHandler> = {
  async get_user(input, context) {
    const payload = await requestZoomJson({
      context,
      path: `/users/${encodePathSegment(requiredString(input.userId, "userId"))}`,
      phase: "execute",
    });

    return {
      user: normalizeUser(payload),
    };
  },
  async list_meetings(input, context) {
    const payload = await requestZoomJson({
      context,
      path: `/users/${encodePathSegment(optionalString(input.userId) ?? "me")}/meetings`,
      phase: "execute",
      query: compactObject({
        type: optionalString(input.type),
        from: optionalString(input.from),
        to: optionalString(input.to),
        timezone: optionalString(input.timezone),
        page_size: optionalPositiveIntegerString(input.pageSize, "pageSize"),
        next_page_token: optionalString(input.nextPageToken),
      }),
    });

    return {
      pagination: normalizePagination(payload),
      meetings: objectArray(payload.meetings).map(normalizeMeeting),
    };
  },
  async create_meeting(input, context) {
    const payload = await requestZoomJson({
      context,
      path: `/users/${encodePathSegment(optionalString(input.userId) ?? "me")}/meetings`,
      phase: "execute",
      method: "POST",
      body: buildMeetingWriteBody(input, "create"),
    });

    return {
      meeting: normalizeMeeting(payload),
    };
  },
  async update_meeting(input, context) {
    const meetingId = requiredMeetingId(input.meetingId, "meetingId");
    await requestZoomJson({
      context,
      path: `/meetings/${encodePathSegment(meetingId)}`,
      phase: "execute",
      method: "PATCH",
      body: buildMeetingWriteBody(input, "update"),
    });

    return {
      success: true,
      meetingId,
    };
  },
};

export async function fetchZoomCurrentAccount(
  accessToken: string,
  metadata: Record<string, unknown>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestZoomJson({
    context: { accessToken, fetcher, signal },
    path: "/users/me",
    phase: "validate",
  });
  const userId = optionalString(payload.id);
  const email = optionalString(payload.email);
  const displayName = optionalString(payload.display_name);
  const accountId = optionalString(payload.account_id);

  return {
    profile: {
      accountId: userId ?? email ?? "zoom-user",
      displayName: email ?? displayName ?? userId ?? "Zoom user",
    },
    grantedScopes: readGrantedScopes(metadata.scope),
    metadata: compactObject({
      apiBaseUrl: zoomApiBaseUrl,
      userId,
      accountId,
      email,
      displayName,
    }),
  };
}

async function requestZoomJson(input: ZoomRequestInput): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.context.signal, label: "Zoom" }, async (signal) => {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.context.accessToken}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildZoomUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readZoomPayload(response);

    if (!response.ok) {
      throw createZoomError(response.status, payload, input.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      if (response.status === 204 || input.method === "PATCH") {
        return {};
      }
      throw new ProviderRequestError(502, "Zoom returned an invalid payload", payload);
    }

    return record;
  });
}

function buildZoomUrl(path: string, query?: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${zoomApiBaseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

async function readZoomPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zoom returned invalid JSON");
  }
}

function createZoomError(status: number, payload: unknown, phase: ZoomRequestPhase): ProviderRequestError {
  const message = extractZoomErrorMessage(payload) ?? `Zoom request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(409, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractZoomErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (record) {
    return optionalString(record.message) ?? optionalString(record.reason) ?? optionalString(record.error);
  }

  return optionalString(payload);
}

function buildMeetingWriteBody(input: Record<string, unknown>, phase: "create" | "update"): Record<string, unknown> {
  const settings = optionalRecord(input.settings);
  const recurrence = optionalRecord(input.recurrence);
  const body = compactObject({
    topic: optionalString(input.topic),
    type: optionalInteger(input.type),
    start_time: optionalString(input.startTime),
    duration: optionalInteger(input.duration),
    timezone: optionalString(input.timezone),
    agenda: optionalString(input.agenda),
    password: optionalString(input.password),
    schedule_for: optionalString(input.scheduleFor),
    settings: settings
      ? compactObject({
          host_video: optionalBoolean(settings.hostVideo),
          participant_video: optionalBoolean(settings.participantVideo),
          join_before_host: optionalBoolean(settings.joinBeforeHost),
          waiting_room: optionalBoolean(settings.waitingRoom),
          mute_upon_entry: optionalBoolean(settings.muteUponEntry),
          auto_recording: optionalString(settings.autoRecording),
          audio: optionalString(settings.audio),
          approval_type: optionalInteger(settings.approvalType),
          registration_type: optionalInteger(settings.registrationType),
          enforce_login: optionalBoolean(settings.enforceLogin),
        })
      : undefined,
    recurrence: recurrence
      ? compactObject({
          type: optionalInteger(recurrence.type),
          repeat_interval: optionalInteger(recurrence.repeatInterval),
          weekly_days: optionalString(recurrence.weeklyDays),
          monthly_day: optionalInteger(recurrence.monthlyDay),
          end_times: optionalInteger(recurrence.endTimes),
          end_date_time: optionalString(recurrence.endDateTime),
        })
      : undefined,
  });

  if (phase === "update" && Object.keys(body).length === 0) {
    throw new ProviderRequestError(400, "at least one meeting field is required");
  }

  return body;
}

function normalizePagination(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    pageSize: optionalInteger(payload.page_size) ?? null,
    totalRecords: optionalInteger(payload.total_records) ?? null,
    nextPageToken: optionalString(payload.next_page_token) ?? null,
  };
}

function normalizeUser(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    id: optionalString(record.id) ?? null,
    email: optionalString(record.email) ?? null,
    firstName: optionalString(record.first_name) ?? null,
    lastName: optionalString(record.last_name) ?? null,
    displayName: optionalString(record.display_name) ?? null,
    type: optionalInteger(record.type) ?? null,
    status: optionalString(record.status) ?? null,
    timezone: optionalString(record.timezone) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    lastLoginTime: optionalString(record.last_login_time) ?? null,
    pmi: maybeString(record.pmi),
    raw: record,
  };
}

function normalizeMeeting(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload) ?? {};
  return {
    uuid: optionalString(record.uuid) ?? null,
    id: maybeMeetingId(record.id),
    hostId: optionalString(record.host_id) ?? null,
    hostEmail: optionalString(record.host_email) ?? null,
    topic: optionalString(record.topic) ?? null,
    type: optionalInteger(record.type) ?? null,
    status: optionalString(record.status) ?? null,
    startTime: optionalString(record.start_time) ?? null,
    duration: optionalInteger(record.duration) ?? null,
    timezone: optionalString(record.timezone) ?? null,
    agenda: optionalString(record.agenda) ?? null,
    joinUrl: optionalString(record.join_url) ?? null,
    startUrl: optionalString(record.start_url) ?? null,
    password: optionalString(record.password) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    raw: record,
  };
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  const records: Array<Record<string, unknown>> = [];
  for (const item of value) {
    const record = optionalRecord(item);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function requiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed) {
    return parsed;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function requiredMeetingId(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return requiredString(value, fieldName);
}

function optionalPositiveIntegerString(value: unknown, fieldName: string): string | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(parsed);
}

function maybeMeetingId(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  return optionalString(value) ?? null;
}

function maybeString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function readGrantedScopes(value: unknown): string[] {
  const scopes: string[] = [];
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (typeof item !== "string") {
      continue;
    }
    for (const scope of item.split(" ")) {
      const normalized = scope.trim();
      if (normalized && !scopes.includes(normalized)) {
        scopes.push(normalized);
      }
    }
  }
  return scopes;
}
