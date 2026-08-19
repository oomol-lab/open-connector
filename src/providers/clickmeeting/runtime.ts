import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  setSearchParams,
} from "../provider-runtime.ts";

export const clickMeetingApiBaseUrl = "https://api.clickmeeting.com/v1";

const clickMeetingDefaultRequestTimeoutMs = 30_000;

type ClickMeetingPhase = "validate" | "execute";
type ClickMeetingActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface ClickMeetingRequestInput {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  body?: URLSearchParams;
}

interface ClickMeetingRequestContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const clickMeetingActionHandlers: ProviderActionHandlers<"clickmeeting", ClickMeetingActionHandler> = {
  async ping(_input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: "/ping",
      },
      context,
      "execute",
    );

    return normalizePing(payload);
  },
  async list_conferences(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readRequiredString(input.status, "status")}`,
        query: {
          page: stringifyOptionalPositiveInteger(input.page, "page"),
        },
      },
      context,
      "execute",
    );

    return {
      conferences: normalizeConferences(payload),
    };
  },
  async create_conference(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "POST",
        path: "/conferences",
        body: buildConferenceForm(input),
      },
      context,
      "execute",
    );

    return {
      conference: normalizeConference(unwrapRecord(payload, ["room", "conference"])),
    };
  },
  async get_conference(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}`,
      },
      context,
      "execute",
    );

    return {
      conference: normalizeConference(unwrapRecord(payload, ["conference", "room"])),
    };
  },
  async update_conference(input, context) {
    const body = buildConferenceForm(input);
    if (Array.from(body).length === 0) {
      throw new ProviderRequestError(400, "at least one ClickMeeting room field is required for update");
    }

    const payload = await requestClickMeetingJson(
      {
        method: "PUT",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}`,
        body,
      },
      context,
      "execute",
    );

    return {
      conference: normalizeConference(unwrapRecord(payload, ["conference", "room"])),
    };
  },
  async delete_conference(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "DELETE",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}`,
      },
      context,
      "execute",
    );

    return {
      result: normalizeResult(payload),
    };
  },
  async generate_access_tokens(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "POST",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/tokens`,
        body: formFromEntries({
          how_many: readPositiveInteger(input.howMany, "howMany"),
        }),
      },
      context,
      "execute",
    );

    return {
      accessTokens: normalizeAccessTokens(payload),
    };
  },
  async list_access_tokens(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/tokens`,
      },
      context,
      "execute",
    );

    return {
      accessTokens: normalizeAccessTokens(payload),
    };
  },
  async list_sessions(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/sessions`,
      },
      context,
      "execute",
    );

    return {
      sessions: normalizeSessions(payload),
    };
  },
  async get_session(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/sessions/${readPositiveInteger(input.sessionId, "sessionId")}`,
      },
      context,
      "execute",
    );

    return {
      session: normalizeSession(unwrapRecord(payload, ["session"])),
    };
  },
  async list_session_attendees(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/sessions/${readPositiveInteger(input.sessionId, "sessionId")}/attendees`,
      },
      context,
      "execute",
    );

    return {
      attendees: normalizeSessionAttendees(payload),
    };
  },
  async list_registrations(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/registrations/${readRequiredString(input.status, "status")}`,
      },
      context,
      "execute",
    );

    return {
      registrations: normalizeRegistrations(payload),
    };
  },
  async register_participant(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "POST",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/registration`,
        body: buildRegistrationForm(input),
      },
      context,
      "execute",
    );

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "ClickMeeting registration response was not an object");
    }

    return compactObject({
      status: optionalString(record.status) ?? normalizeResult(payload),
      url: optionalString(record.url),
    });
  },
  async list_session_registrations(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/sessions/${readPositiveInteger(input.sessionId, "sessionId")}/registrations`,
      },
      context,
      "execute",
    );

    return {
      registrations: normalizeRegistrations(payload),
    };
  },
  async list_time_zones(input, context) {
    const country = optionalString(input.country)?.toUpperCase();
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: country ? `/time_zone_list/${country}` : "/time_zone_list",
      },
      context,
      "execute",
    );

    return {
      timeZones: normalizeStringList(payload, "time zone"),
    };
  },
  async list_phone_gateways(_input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: "/phone_gateways",
      },
      context,
      "execute",
    );

    return {
      phoneGateways: normalizePhoneGateways(payload),
    };
  },
  async list_all_recordings(_input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: "/conferences/recordings",
      },
      context,
      "execute",
    );

    return {
      recordings: normalizeRecordings(payload),
    };
  },
  async list_conference_recordings(input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: `/conferences/${readPositiveInteger(input.roomId, "roomId")}/recordings`,
      },
      context,
      "execute",
    );

    return {
      recordings: normalizeRecordings(payload),
    };
  },
  async list_chats(_input, context) {
    const payload = await requestClickMeetingJson(
      {
        method: "GET",
        path: "/chats",
      },
      context,
      "execute",
    );

    return {
      chats: normalizeChats(payload),
    };
  },
};

export async function validateClickMeetingCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestClickMeetingJson(
    {
      method: "GET",
      path: "/ping",
    },
    { apiKey, fetcher, signal },
    "validate",
  );
  const ping = normalizePing(payload);

  return {
    profile: {
      accountId: "api_key",
      displayName: "ClickMeeting API Key",
      grantedScopes: [],
    },
    metadata: {
      validationEndpoint: "/ping",
      ping: ping.ping,
    },
  };
}

async function requestClickMeetingJson(
  input: ClickMeetingRequestInput,
  context: ClickMeetingRequestContext,
  phase: ClickMeetingPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, clickMeetingDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildClickMeetingUrl(input.path, input.query), {
      method: input.method,
      headers: buildClickMeetingHeaders(context.apiKey, input.body),
      body: input.body,
      signal: timeout.signal,
    });
    const payload = await readClickMeetingPayload(response);

    if (!response.ok) {
      throw createClickMeetingError(response.status, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ClickMeeting request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ClickMeeting request failed: ${error.message}` : "ClickMeeting request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildClickMeetingUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${clickMeetingApiBaseUrl}/`);
  setSearchParams(url, query);
  return url;
}

function buildClickMeetingHeaders(apiKey: string, body?: URLSearchParams): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-Api-Key": apiKey,
  };

  if (body) {
    headers["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  }

  return headers;
}

async function readClickMeetingPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ClickMeeting returned invalid JSON");
  }
}

function createClickMeetingError(status: number, payload: unknown, phase: ClickMeetingPhase): ProviderRequestError {
  const message = extractClickMeetingErrorMessage(payload) ?? `ClickMeeting request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractClickMeetingErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["error", "message", "error_message", "response", "result"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    return (
      errors
        .map((error) => String(error))
        .filter(Boolean)
        .join("; ") || undefined
    );
  }

  const errorsRecord = optionalRecord(errors);
  if (errorsRecord) {
    return Object.entries(errorsRecord)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join("; ");
  }

  return undefined;
}

function buildConferenceForm(input: Record<string, unknown>): URLSearchParams {
  const form = new URLSearchParams();
  appendFormValue(form, "name", input.name);
  appendFormValue(form, "room_type", input.roomType);
  appendFormValue(form, "permanent_room", input.permanentRoom);
  appendFormValue(form, "access_type", input.accessType);
  appendFormValue(form, "custom_room_url_name", input.customRoomUrlName);
  appendFormValue(form, "lobby_description", input.lobbyDescription);
  appendFormValue(form, "lobby_enabled", input.lobbyEnabled);
  appendFormValue(form, "starts_at", input.startsAt);
  appendFormValue(form, "duration", input.duration);
  appendFormValue(form, "timezone", input.timezone);
  appendFormValue(form, "skin_id", input.skinId);
  appendFormValue(form, "password", input.password);
  appendFormValue(form, "status", input.status);
  appendNestedForm(form, "registration", input.registration, {
    enabled: "enabled",
    template: "template",
  });
  appendNestedForm(form, "settings", input.settings, {
    showOnPersonalPage: "show_on_personal_page",
    thankYouEmailsEnabled: "thank_you_emails_enabled",
    connectionTesterEnabled: "connection_tester_enabled",
    phonegatewayEnabled: "phonegateway_enabled",
    recorderAutostartEnabled: "recorder_autostart_enabled",
    roomInviteButtonEnabled: "room_invite_button_enabled",
    socialMediaSharingEnabled: "social_media_sharing_enabled",
    connectionStatusEnabled: "connection_status_enabled",
    thankYouPageUrl: "thank_you_page_url",
    encryptionEnabled: "encryption_enabled",
  });
  return form;
}

function buildRegistrationForm(input: Record<string, unknown>): URLSearchParams {
  const form = new URLSearchParams();
  appendFormValue(form, "registration[1]", input.firstName);
  appendFormValue(form, "registration[2]", input.lastName);
  appendFormValue(form, "registration[3]", input.email);
  appendFormValue(form, "registration[10]", input.company);

  const confirmationEmail = optionalRecord(input.confirmationEmail);
  if (confirmationEmail) {
    appendFormValue(form, "confirmation_email[enabled]", confirmationEmail.enabled);
    appendFormValue(form, "confirmation_email[lang]", confirmationEmail.lang);
  }
  return form;
}

function formFromEntries(entries: Record<string, unknown>): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    appendFormValue(form, key, value);
  }
  return form;
}

function appendNestedForm(
  form: URLSearchParams,
  key: string,
  value: unknown,
  childKeyByInputKey: Record<string, string>,
): void {
  const record = optionalRecord(value);
  if (!record) {
    return;
  }

  for (const [inputKey, formKey] of Object.entries(childKeyByInputKey)) {
    appendFormValue(form, `${key}[${formKey}]`, record[inputKey]);
  }
}

function appendFormValue(form: URLSearchParams, key: string, value: unknown): void {
  if (value == null || value === "") {
    return;
  }

  if (typeof value === "boolean") {
    form.set(key, value ? "1" : "0");
    return;
  }

  form.set(key, String(value));
}

function normalizePing(payload: unknown): { ping: string } {
  const record = optionalRecord(payload);
  const ping = optionalString(record?.ping);
  if (!ping) {
    throw new ProviderRequestError(502, "ClickMeeting ping response did not include ping");
  }

  return { ping };
}

function normalizeConferences(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["conferences", "conference", "rooms", "room"]).map(normalizeConference);
}

function normalizeConference(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readOptionalInteger(record.id),
    name: readNullableString(record.name),
    status: readNullableString(record.status),
    roomType: readNullableString(record.room_type),
    accessType: readOptionalInteger(record.access_type),
    permanentRoom: readNullableBoolean(record.permanent_room),
    roomUrl: readNullableString(record.room_url),
    embedRoomUrl: readNullableString(record.embed_room_url),
    startsAt: readNullableString(record.starts_at),
    endsAt: readNullableString(record.ends_at),
    createdAt: readNullableString(record.created_at),
    updatedAt: readNullableString(record.updated_at),
    timezone: readNullableString(record.timezone),
    registrationEnabled: readNullableBoolean(record.registration_enabled),
    raw: record,
  });
}

function normalizeAccessTokens(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["access_tokens", "tokens"]).map((record) =>
    compactObject({
      token: readNullableString(record.token),
      sentToEmail: readNullableString(record.sent_to_email),
      firstUseDate: readNullableString(record.first_use_date),
      raw: record,
    }),
  );
}

function normalizeSessions(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["sessions", "session"]).map(normalizeSession);
}

function normalizeSession(record: Record<string, unknown>): Record<string, unknown> {
  const attendees = Array.isArray(record.attendees)
    ? record.attendees.map((attendee) => normalizeSessionAttendee(recordFromValue(attendee)))
    : undefined;

  return compactObject({
    id: readOptionalInteger(record.id),
    startDate: readNullableString(record.start_date),
    endDate: readNullableString(record.end_date),
    maxVisitors: readOptionalInteger(record.max_visitors),
    totalVisitors: readOptionalInteger(record.total_visitors),
    attendees,
    raw: record,
  });
}

function normalizeSessionAttendees(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["attendees", "visitors"]).map(normalizeSessionAttendee);
}

function normalizeSessionAttendee(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    uid: readNullableString(record.uid),
    email: readNullableString(record.email),
    nickname: readNullableString(record.nickname),
    role: readNullableString(record.role),
    rating: readNullableString(record.rating),
    ratingComment: readNullableString(record.rating_comment),
    raw: record,
  });
}

function normalizeRegistrations(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["registrations", "registration"]).map((record) =>
    compactObject({
      id: readOptionalInteger(record.id),
      sessionId: readOptionalInteger(record.session_id),
      email: readNullableString(record.email),
      visitorNickname: readNullableString(record.visitor_nickname),
      registrationDate: readNullableString(record.registration_date),
      registrationConfirmed: readNullableString(record.registration_confirmed),
      fields: optionalRecord(record.fields),
      raw: record,
    }),
  );
}

function normalizeRecordings(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["recordings", "recording"]).map((record) =>
    compactObject({
      id: readOptionalInteger(record.id),
      recordingUrl: readNullableString(record.recording_url),
      recordingDuration: readOptionalInteger(record.recording_duration),
      conferenceId: readOptionalInteger(record.conference_id),
      recorderStarted: readNullableString(record.recorder_started),
      recorderStartDate: readNullableString(record.recorder_start_date),
      recordingFileSize: readNullableScalarString(record.recording_file_size),
      recordingName: readNullableString(record.recording_name),
      raw: record,
    }),
  );
}

function normalizeChats(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["chats", "chat"]).map((record) =>
    compactObject({
      id: readOptionalInteger(record.id),
      name: readNullableString(record.name),
      date: readNullableString(record.date),
      time: readNullableString(record.time),
      timezone: readNullableString(record.timezone),
      downloadLink: readNullableString(record.download_link),
      raw: record,
    }),
  );
}

function normalizePhoneGateways(payload: unknown): Array<Record<string, unknown>> {
  return recordArrayFromPayload(payload, ["phone_gateways", "phoneGateways"]).map((record) =>
    compactObject({
      code: readNullableString(record.code),
      location: readNullableString(record.location),
      value: readNullableString(record.value),
      geo: optionalRecord(record.geo),
      raw: record,
    }),
  );
}

function normalizeStringList(payload: unknown, label: string): string[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `ClickMeeting ${label} response was not an array`);
  }

  return payload.map((item) => String(item));
}

function normalizeResult(payload: unknown): string {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return "OK";
  }

  for (const key of ["result", "status", "response", "STATUS"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  return "OK";
}

function unwrapRecord(payload: unknown, wrapperKeys: string[]): Record<string, unknown> {
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const record = optionalRecord(item);
      if (!record) {
        continue;
      }
      for (const key of wrapperKeys) {
        const wrapped = optionalRecord(record[key]);
        if (wrapped) {
          return wrapped;
        }
      }
      return record;
    }
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "ClickMeeting response was not an object");
  }

  for (const key of wrapperKeys) {
    const wrapped = optionalRecord(record[key]);
    if (wrapped) {
      return wrapped;
    }
  }

  return record;
}

function recordArrayFromPayload(payload: unknown, wrapperKeys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map(recordFromValue);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "ClickMeeting response was not an array");
  }

  for (const key of wrapperKeys) {
    const wrapped = record[key];
    if (Array.isArray(wrapped)) {
      return wrapped.map(recordFromValue);
    }
  }

  const recordValues: Array<Record<string, unknown>> = [];
  for (const value of Object.values(record)) {
    const valueRecord = optionalRecord(value);
    if (valueRecord) {
      recordValues.push(valueRecord);
    }
  }

  if (recordValues.length > 0) {
    return recordValues;
  }

  throw new ProviderRequestError(502, "ClickMeeting response did not include records");
}

function recordFromValue(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "ClickMeeting record was not an object");
  }
  return record;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return value;
}

function stringifyOptionalPositiveInteger(value: unknown, fieldName: string): string | undefined {
  if (value == null) {
    return undefined;
  }

  return String(readPositiveInteger(value, fieldName));
}

function readOptionalInteger(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return typeof value === "string" ? value : undefined;
}

function readNullableScalarString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return undefined;
}

function readNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1 ? true : value === 0 ? false : undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return true;
    }
    if (normalized === "0" || normalized === "false") {
      return false;
    }
  }

  return undefined;
}
