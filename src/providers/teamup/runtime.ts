import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  values: Record<string, string>;
  actionName: string;
  input: Record<string, unknown>;
}

export const teamupApiBaseUrl = "https://api.teamup.com";
const teamupValidationPath = "/check-access";

type TeamupRequestPhase = "validate" | "execute";

interface TeamupRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: TeamupRequestPhase;
  method?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

export async function validateTeamupCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  const payload = await requestTeamupJson({
    apiKey: input.apiKey,
    path: teamupValidationPath,
    fetcher,
    phase: "validate",
  });
  const access = optionalString(payload.access);
  if (access !== "ok") {
    throw new ProviderRequestError(401, "Teamup API key validation failed");
  }

  return {
    accountLabel: "Teamup API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: teamupApiBaseUrl,
      validationEndpoint: teamupValidationPath,
    },
  };
}

export async function executeTeamupAction(input: ApiKeyProviderActionInput, fetcher: typeof fetch): Promise<unknown> {
  const apiKey = input.apiKey;
  const calendarKey = requireString(input.input.calendarKey, "calendarKey");
  const pathPrefix = `/${encodeURIComponent(calendarKey)}`;

  switch (input.actionName as string) {
    case "list_events":
      return listEvents(input, apiKey, pathPrefix, fetcher);
    case "get_event":
      return getEvent(input, apiKey, pathPrefix, fetcher);
    case "create_event":
      return createEvent(input, apiKey, pathPrefix, fetcher);
    case "update_event":
      return updateEvent(input, apiKey, pathPrefix, fetcher);
    case "delete_event":
      return deleteEvent(input, apiKey, pathPrefix, fetcher);
    case "list_subcalendars":
      return listSubcalendars(input, apiKey, pathPrefix, fetcher);
    default:
      throw new ProviderRequestError(400, `unknown teamup action: ${input.actionName}`);
  }
}

async function listEvents(input: ApiKeyProviderActionInput, apiKey: string, pathPrefix: string, fetcher: typeof fetch) {
  const payload = await requestTeamupJson({
    apiKey,
    path: `${pathPrefix}/events`,
    query: jsonObject({
      startDate: optionalString(input.input.startDate),
      endDate: optionalString(input.input.endDate),
      tz: optionalString(input.input.timezone),
    }),
    fetcher,
    phase: "execute",
  });
  return { events: requireObjectArray(payload.events, "events") };
}

async function getEvent(input: ApiKeyProviderActionInput, apiKey: string, pathPrefix: string, fetcher: typeof fetch) {
  const eventId = requireString(input.input.eventId, "eventId");
  const payload = await requestTeamupJson({
    apiKey,
    path: `${pathPrefix}/events/${encodeURIComponent(eventId)}`,
    query: jsonObject({ tz: optionalString(input.input.timezone) }),
    fetcher,
    phase: "execute",
  });
  return { event: requireObject(payload.event, "event") };
}

async function createEvent(
  input: ApiKeyProviderActionInput,
  apiKey: string,
  pathPrefix: string,
  fetcher: typeof fetch,
) {
  const payload = await requestTeamupJson({
    apiKey,
    path: `${pathPrefix}/events`,
    method: "POST",
    query: jsonObject({ tz: optionalString(input.input.timezone) }),
    body: buildEventBody(input.input),
    fetcher,
    phase: "execute",
  });
  return { event: requireObject(payload.event, "event") };
}

async function updateEvent(
  input: ApiKeyProviderActionInput,
  apiKey: string,
  pathPrefix: string,
  fetcher: typeof fetch,
) {
  const eventId = requireString(input.input.eventId, "eventId");
  assertHasEventUpdate(input.input);
  const eventPath = `${pathPrefix}/events/${encodeURIComponent(eventId)}`;
  const originalPayload = await requestTeamupJson({
    apiKey,
    path: eventPath,
    query: jsonObject({ tz: optionalString(input.input.timezone) }),
    fetcher,
    phase: "execute",
  });
  const originalEvent = requireObject(originalPayload.event, "event");
  const payload = await requestTeamupJson({
    apiKey,
    path: eventPath,
    method: "PUT",
    query: jsonObject({ tz: optionalString(input.input.timezone) }),
    body: {
      ...pickWritableEventFields(originalEvent),
      ...buildEventBody(input.input),
      id: eventId,
    },
    fetcher,
    phase: "execute",
  });
  return {
    event: requireObject(payload.event, "event"),
    undoId: optionalString(payload.undo_id) ?? null,
  };
}

async function deleteEvent(
  input: ApiKeyProviderActionInput,
  apiKey: string,
  pathPrefix: string,
  fetcher: typeof fetch,
) {
  const eventId = requireString(input.input.eventId, "eventId");
  const payload = await requestTeamupJson({
    apiKey,
    path: `${pathPrefix}/events/${encodeURIComponent(eventId)}`,
    method: "DELETE",
    fetcher,
    phase: "execute",
  });
  return { undoId: optionalString(payload.undo_id) ?? null };
}

async function listSubcalendars(
  input: ApiKeyProviderActionInput,
  apiKey: string,
  pathPrefix: string,
  fetcher: typeof fetch,
) {
  const payload = await requestTeamupJson({
    apiKey,
    path: `${pathPrefix}/subcalendars`,
    query: jsonObject({
      includeInactive: typeof input.input.includeInactive === "boolean" ? input.input.includeInactive : undefined,
    }),
    fetcher,
    phase: "execute",
  });
  return { subcalendars: requireObjectArray(payload.subcalendars, "subcalendars") };
}

function buildEventBody(input: Record<string, unknown>) {
  return jsonObject({
    subcalendar_ids: input.subcalendarIds,
    start_dt: input.startDateTime,
    end_dt: input.endDateTime,
    all_day: input.allDay,
    title: input.title,
    location: input.location,
    who: input.who,
    notes: input.notes,
    rrule: input.recurrenceRule,
  });
}

function pickWritableEventFields(event: Record<string, unknown>) {
  return jsonObject({
    subcalendar_ids: event.subcalendar_ids,
    start_dt: event.start_dt,
    end_dt: event.end_dt,
    all_day: event.all_day,
    title: event.title,
    location: event.location,
    who: event.who,
    notes: event.notes,
    rrule: event.rrule,
  });
}

async function requestTeamupJson(options: TeamupRequestOptions) {
  const url = new URL(options.path, teamupApiBaseUrl);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "teamup-token": options.apiKey,
        "user-agent": providerUserAgent,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Teamup request failed: ${error.message}` : "Teamup request failed",
    );
  }

  const text = await response.text();
  let payload: Record<string, unknown> = {};
  if (text.trim() !== "") {
    try {
      payload = requireObject(JSON.parse(text), "response");
    } catch {
      if (!response.ok) {
        payload = { message: text.trim() };
      } else {
        throw new ProviderRequestError(502, "Teamup returned invalid JSON");
      }
    }
  }
  if (!response.ok) throw createTeamupError(response, payload, options.phase);
  return payload;
}

function assertHasEventUpdate(input: Record<string, unknown>) {
  const writableFields = [
    "subcalendarIds",
    "startDateTime",
    "endDateTime",
    "allDay",
    "title",
    "location",
    "who",
    "notes",
    "recurrenceRule",
  ];
  if (!writableFields.some((field) => input[field] !== undefined)) {
    throw new ProviderRequestError(400, "update_event requires at least one writable event field");
  }
}

function createTeamupError(response: Response, payload: Record<string, unknown>, phase: TeamupRequestPhase) {
  const message =
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    `Teamup request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (400 <= response.status && response.status < 500) {
    return new ProviderRequestError(400, message, response.status);
  }
  return new ProviderRequestError(response.status || 502, message);
}

function requireString(value: unknown, fieldName: string) {
  const result = optionalString(value);
  if (result === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (result === undefined) {
    throw new ProviderRequestError(502, `Teamup response is missing ${fieldName}`);
  }
  return result;
}

function requireObjectArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Teamup response is missing ${fieldName}`);
  }
  return value.map((item) => requireObject(item, fieldName));
}
