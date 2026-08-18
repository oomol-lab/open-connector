import {
  compactObject,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
  requiredRecord,
  optionalString,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  googlecalendarApiBaseUrl,
  googlecalendarJsonRequest,
  googlecalendarRequest,
  resolveCalendarId,
  resolveEventId,
} from "./runtime-shared.ts";

type GooglecalendarEventRuntimeDeps = {
  accessToken: string;
  fetcher: typeof fetch;
};

type GooglecalendarEventActionHandler = (
  input: Record<string, unknown>,
  deps: GooglecalendarEventRuntimeDeps,
) => Promise<unknown>;

type QueriedCalendar = {
  calendarId: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  timeZone?: string;
};

type TimeZoneDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(400, message));
}

const eventWritableKeys = [
  "summary",
  "description",
  "location",
  "start",
  "end",
  "attendees",
  "recurrence",
  "conferenceData",
  "reminders",
  "colorId",
  "visibility",
  "transparency",
  "status",
  "extendedProperties",
  "attachments",
  "source",
  "iCalUID",
] as const;
const conferenceDataKeys = ["conferenceId", "notes", "entryPoints", "conferenceSolution", "createRequest"] as const;
const sourceKeys = ["url", "title"] as const;
const attendeeKeys = [
  "email",
  "displayName",
  "optional",
  "resource",
  "responseStatus",
  "comment",
  "additionalGuests",
] as const;
const timeZoneFormatterById = new Map<string, Intl.DateTimeFormat>();

export type GooglecalendarEventActionName =
  | "list_events"
  | "get_event"
  | "create_event"
  | "update_event"
  | "patch_event"
  | "delete_event"
  | "import_event"
  | "move_event"
  | "list_event_instances"
  | "quick_add_event"
  | "sync_events"
  | "list_events_all_calendars"
  | "find_event"
  | "add_attendee"
  | "remove_attendee";

export const googlecalendarEventActionHandlers: Record<
  GooglecalendarEventActionName,
  GooglecalendarEventActionHandler
> = {
  list_events(input, deps) {
    return listEvents(input, deps);
  },
  get_event(input, deps) {
    return getEvent(input, deps);
  },
  create_event(input, deps) {
    return createEvent(input, deps);
  },
  update_event(input, deps) {
    return updateEvent(input, deps);
  },
  patch_event(input, deps) {
    return patchEvent(input, deps);
  },
  delete_event(input, deps) {
    return deleteEvent(input, deps);
  },
  import_event(input, deps) {
    return importEvent(input, deps);
  },
  move_event(input, deps) {
    return moveEvent(input, deps);
  },
  list_event_instances(input, deps) {
    return listEventInstances(input, deps);
  },
  quick_add_event(input, deps) {
    return quickAddEvent(input, deps);
  },
  sync_events(input, deps) {
    return syncEvents(input, deps);
  },
  list_events_all_calendars(input, deps) {
    return listEventsAllCalendars(input, deps);
  },
  find_event(input, deps) {
    return findEvent(input, deps);
  },
  add_attendee(input, deps) {
    return addAttendee(input, deps);
  },
  remove_attendee(input, deps) {
    return removeAttendee(input, deps);
  },
};

async function listEvents(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const query = buildListEventsQuery(input);
  return googlecalendarJsonRequest(eventsUrl(resolveCalendarId(input)), {
    accessToken,
    fetcher,
    query,
    syncTokenAware: query.syncToken !== undefined,
  });
}

async function getEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  return googlecalendarJsonRequest(eventUrl(resolveCalendarId(input), resolveEventId(input)), {
    accessToken,
    fetcher,
  });
}

async function createEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const sendUpdates = pickSendUpdates(input);
  const event = pickEventWritableFields(asObject(input.event));
  return googlecalendarJsonRequest(eventsUrl(resolveCalendarId(input)), {
    accessToken,
    fetcher,
    query: buildEventWriteQuery(event, sendUpdates),
    body: event,
  });
}

async function updateEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const sendUpdates = pickSendUpdates(input);
  const url = eventUrl(resolveCalendarId(input), resolveEventId(input));
  const next = pickEventWritableFields(asObject(input.event));
  let current = await googlecalendarJsonRequest<Record<string, unknown>>(url, {
    accessToken,
    fetcher,
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const etag = optionalString(current.etag);
    if (!etag) {
      throw new ProviderRequestError(502, "googlecalendar returned an event without an etag");
    }

    const body = mergeEventUpdate(current, next);
    try {
      return await googlecalendarJsonRequest(url, {
        accessToken,
        fetcher,
        method: "PUT",
        query: buildEventWriteQuery(body, sendUpdates),
        headers: { "If-Match": etag },
        body,
      });
    } catch (error) {
      if (attempt > 0 || !(error instanceof ProviderRequestError) || error.status !== 412) {
        throw error;
      }
      current = await googlecalendarJsonRequest<Record<string, unknown>>(url, {
        accessToken,
        fetcher,
      });
    }
  }

  throw new ProviderRequestError(412, "event changed while updating");
}

async function patchEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const sendUpdates = pickSendUpdates(input);
  const event = pickEventWritableFields(asObject(input.event));
  return googlecalendarJsonRequest(eventUrl(resolveCalendarId(input), resolveEventId(input)), {
    accessToken,
    fetcher,
    method: "PATCH",
    query: buildEventWriteQuery(event, sendUpdates),
    body: event,
  });
}

async function deleteEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const sendUpdates = pickSendUpdates(input);
  try {
    await googlecalendarRequest(eventUrl(resolveCalendarId(input), resolveEventId(input)), {
      accessToken,
      fetcher,
      method: "DELETE",
      query: { sendUpdates },
    });
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) {
      return { success: true };
    }
    throw error;
  }

  return { success: true };
}

async function importEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  return googlecalendarJsonRequest(`${eventsUrl(resolveCalendarId(input))}/import`, {
    accessToken,
    fetcher,
    body: pickEventWritableFields(asObject(input.event)),
  });
}

async function moveEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const sendUpdates = pickSendUpdates(input);
  return googlecalendarJsonRequest(`${eventUrl(resolveCalendarId(input), resolveEventId(input))}/move`, {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      destination: requireInputString(input, "destinationCalendarId", "destinationCalendarId"),
      sendUpdates,
    },
  });
}

async function listEventInstances(
  input: Record<string, unknown>,
  { accessToken, fetcher }: GooglecalendarEventRuntimeDeps,
) {
  return googlecalendarJsonRequest(`${eventUrl(resolveCalendarId(input), resolveEventId(input))}/instances`, {
    accessToken,
    fetcher,
    query: compactObject({
      timeMin: pickOptionalString(input, "timeMin"),
      timeMax: pickOptionalString(input, "timeMax"),
      timeZone: optionalString(input.timeZone),
      pageToken: pickOptionalString(input, "pageToken"),
      maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults")),
      showDeleted: stringifyBoolean(pickOptionalBoolean(input, "showDeleted")),
      maxAttendees: stringifyInteger(pickOptionalInteger(input, "maxAttendees")),
    }),
  });
}

async function quickAddEvent(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const sendUpdates = pickSendUpdates(input);
  return googlecalendarJsonRequest(`${eventsUrl(resolveCalendarId(input))}/quickAdd`, {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      text: requireInputString(input, "text", "text"),
      sendUpdates,
    },
  });
}

async function syncEvents(input: Record<string, unknown>, { accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const query = buildListEventsQuery(input, { syncMode: true });
  return googlecalendarJsonRequest(eventsUrl(resolveCalendarId(input)), {
    accessToken,
    fetcher,
    query,
    syncTokenAware: query.syncToken !== undefined,
  });
}

async function findEvent(input: Record<string, unknown>, deps: GooglecalendarEventRuntimeDeps) {
  return listEvents(
    compactObject({
      calendarId: pickOptionalString(input, "calendarId") ?? "primary",
      q: pickOptionalString(input, "query"),
      timeMin: pickOptionalString(input, "timeMin"),
      timeMax: pickOptionalString(input, "timeMax"),
      updatedMin: pickOptionalString(input, "updatedMin"),
      eventTypes: pickRepeatedString(input, "eventTypes"),
      orderBy: optionalString(input.orderBy),
      singleEvents: pickOptionalBoolean(input, "singleEvents"),
      showDeleted: pickOptionalBoolean(input, "showDeleted"),
      maxResults: pickOptionalInteger(input, "maxResults"),
      pageToken: pickOptionalString(input, "pageToken"),
    }),
    deps,
  );
}

async function listEventsAllCalendars(input: Record<string, unknown>, deps: GooglecalendarEventRuntimeDeps) {
  const timeMin = requireInputString(input, "timeMin", "timeMin");
  const timeMax = requireInputString(input, "timeMax", "timeMax");
  const timeZone = pickOptionalString(input, "timeZone") ?? "UTC";
  assertValidTimeZone(timeZone);
  const singleEvents = pickOptionalBoolean(input, "singleEvents") ?? true;
  const maxResultsPerCalendar = pickOptionalInteger(input, "maxResultsPerCalendar") ?? 250;
  const hasExplicitCalendarIds = Object.hasOwn(input, "calendarIds");
  const explicitCalendarIds = Array.from(new Set(pickStringArray(input, "calendarIds")));
  const calendarsQueried: QueriedCalendar[] = hasExplicitCalendarIds
    ? explicitCalendarIds.map((calendarId) => ({
        calendarId,
        summary: calendarId,
      }))
    : await listVisibleCalendars(deps);

  if (calendarsQueried.length === 0) {
    return {
      events: [],
      summaryView: [],
      calendarsQueried: [],
      errorsByCalendar: {},
    };
  }

  const events: Array<Record<string, unknown>> = [];
  const errorsByCalendar: Record<string, { code: string; message: string }> = {};
  let succeeded = 0;
  let firstRecoverableError: ProviderRequestError | null = null;

  for (const calendar of calendarsQueried) {
    try {
      const items = await collectCalendarEvents(
        calendar.calendarId,
        {
          q: optionalString(input.q),
          timeMin,
          timeMax,
          timeZone,
          eventTypes: pickRepeatedString(input, "eventTypes"),
          showDeleted: pickOptionalBoolean(input, "showDeleted"),
          singleEvents,
        },
        maxResultsPerCalendar,
        deps,
      );

      succeeded += 1;
      events.push(
        ...items.map((event) => ({
          ...event,
          sourceCalendar: compactObject({
            calendarId: calendar.calendarId,
            summary: calendar.summary,
            primary: calendar.primary,
            accessRole: calendar.accessRole,
          }),
        })),
      );
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status === 401) {
        throw error;
      }

      const mapped = mapCalendarError(error);
      errorsByCalendar[calendar.calendarId] = mapped;
      if (!firstRecoverableError) {
        firstRecoverableError =
          error instanceof ProviderRequestError ? error : new ProviderRequestError(502, mapped.message);
      }
    }
  }

  if (succeeded === 0) {
    throw firstRecoverableError ?? new ProviderRequestError(502, "all calendar queries failed");
  }

  const calendarTimeZoneById = Object.fromEntries(
    calendarsQueried.flatMap((calendar) =>
      calendar.timeZone === undefined ? [] : [[calendar.calendarId, calendar.timeZone]],
    ),
  );
  const sortedEvents = events.sort((left, right) =>
    compareAggregatedEvents(left, right, timeZone, calendarTimeZoneById),
  );
  const summaryView = sortedEvents.flatMap((event) => {
    const summaryItem = buildSummaryItem(event, timeZone);
    return summaryItem ? [summaryItem] : [];
  });

  return {
    events: sortedEvents,
    summaryView,
    calendarsQueried: calendarsQueried.map((calendar) =>
      compactObject({
        calendarId: calendar.calendarId,
        summary: calendar.summary,
        primary: calendar.primary,
        accessRole: calendar.accessRole,
      }),
    ),
    errorsByCalendar,
  };
}

async function addAttendee(input: Record<string, unknown>, deps: GooglecalendarEventRuntimeDeps) {
  const calendarId = pickOptionalString(input, "calendarId") ?? "primary";
  const eventId = resolveEventId(input);
  const attendeeEmail = requireInputString(input, "attendeeEmail", "attendeeEmail");
  const sendUpdates = pickOptionalString(input, "sendUpdates") ?? "all";
  if (sendUpdates !== "all" && sendUpdates !== "externalOnly" && sendUpdates !== "none") {
    throw new ProviderRequestError(400, "sendUpdates must be all, externalOnly, or none");
  }

  const event = (await getEvent(
    {
      calendarId,
      eventId,
    },
    deps,
  )) as Record<string, unknown>;
  const attendees = readEventAttendees(event);
  if (attendees.some((attendee) => optionalString(attendee.email)?.toLowerCase() === attendeeEmail.toLowerCase())) {
    return event;
  }

  return googlecalendarJsonRequest(eventUrl(calendarId, eventId), {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    method: "PATCH",
    query: { sendUpdates },
    body: {
      attendees: [
        ...attendees,
        compactObject({
          email: attendeeEmail,
          displayName: pickOptionalString(input, "displayName"),
          optional: pickOptionalBoolean(input, "optional"),
        }),
      ],
    },
  });
}

async function removeAttendee(input: Record<string, unknown>, deps: GooglecalendarEventRuntimeDeps) {
  const calendarId = pickOptionalString(input, "calendarId") ?? "primary";
  const eventId = resolveEventId(input);
  const attendeeEmail = requireInputString(input, "attendeeEmail", "attendeeEmail").toLowerCase();
  const event = (await getEvent(
    {
      calendarId,
      eventId,
    },
    deps,
  )) as Record<string, unknown>;
  const attendees = readEventAttendees(event);
  const remaining = attendees.filter((attendee) => optionalString(attendee.email)?.toLowerCase() !== attendeeEmail);

  if (remaining.length === attendees.length) {
    throw new ProviderRequestError(
      400,
      `attendee not found: ${requireInputString(input, "attendeeEmail", "attendeeEmail")}`,
    );
  }

  return patchEvent(
    {
      calendarId,
      eventId,
      event: {
        attendees: remaining,
      },
    },
    deps,
  );
}

function readEventAttendees(event: Record<string, unknown>) {
  return Array.isArray(event.attendees)
    ? event.attendees
        .filter((attendee): attendee is Record<string, unknown> => !!attendee && typeof attendee === "object")
        .map((attendee) => pickKnownFields(attendee, attendeeKeys))
    : [];
}

function buildListEventsQuery(input: Record<string, unknown>, options?: { syncMode?: boolean }) {
  const syncToken = pickOptionalString(input, "syncToken");

  if (options?.syncMode && syncToken) {
    return compactObject({
      timeZone: optionalString(input.timeZone),
      pageToken: pickOptionalString(input, "pageToken"),
      syncToken,
      eventTypes: pickRepeatedString(input, "eventTypes"),
      maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults")),
      showDeleted: "true",
      maxAttendees: stringifyInteger(pickOptionalInteger(input, "maxAttendees")),
      singleEvents: stringifyBoolean(pickOptionalBoolean(input, "singleEvents")),
      showHiddenInvitations: stringifyBoolean(pickOptionalBoolean(input, "showHiddenInvitations")),
    });
  }

  return compactObject({
    q: optionalString(input.q),
    iCalUID: optionalString(input.iCalUID),
    orderBy: optionalString(input.orderBy),
    timeMin: pickOptionalString(input, "timeMin"),
    timeMax: pickOptionalString(input, "timeMax"),
    timeZone: optionalString(input.timeZone),
    pageToken: pickOptionalString(input, "pageToken"),
    syncToken,
    eventTypes: pickRepeatedString(input, "eventTypes"),
    maxResults: stringifyInteger(pickOptionalInteger(input, "maxResults")),
    updatedMin: pickOptionalString(input, "updatedMin"),
    showDeleted: stringifyBoolean(pickOptionalBoolean(input, "showDeleted")),
    maxAttendees: stringifyInteger(pickOptionalInteger(input, "maxAttendees")),
    singleEvents: stringifyBoolean(pickOptionalBoolean(input, "singleEvents")),
    showHiddenInvitations: stringifyBoolean(pickOptionalBoolean(input, "showHiddenInvitations")),
    sharedExtendedProperty: pickRepeatedString(input, "sharedExtendedProperty"),
    privateExtendedProperty: pickRepeatedString(input, "privateExtendedProperty"),
  });
}

function buildEventWriteQuery(event: Record<string, unknown>, sendUpdates: string | undefined) {
  return compactObject({
    conferenceDataVersion: event.conferenceData === undefined ? undefined : "1",
    supportsAttachments: event.attachments === undefined ? undefined : "true",
    sendUpdates,
  });
}

function pickSendUpdates(input: Record<string, unknown>) {
  const sendUpdates = input.sendUpdates;
  if (sendUpdates === undefined) {
    return undefined;
  }
  if (sendUpdates !== "all" && sendUpdates !== "externalOnly" && sendUpdates !== "none") {
    throw new ProviderRequestError(400, "sendUpdates must be all, externalOnly, or none");
  }
  return sendUpdates;
}

function pickEventWritableFields(input: Record<string, unknown>) {
  return pickKnownFields(input, eventWritableKeys);
}

function mergeEventUpdate(current: Record<string, unknown>, next: Record<string, unknown>) {
  const currentWritable = pickEventWritableFields(current);

  if (next.conferenceData === undefined && currentWritable.conferenceData !== undefined) {
    currentWritable.conferenceData = pickKnownFields(asObject(currentWritable.conferenceData), conferenceDataKeys);
  }
  if (next.source === undefined && currentWritable.source !== undefined) {
    currentWritable.source = pickKnownFields(asObject(currentWritable.source), sourceKeys);
  }

  return {
    ...currentWritable,
    ...next,
  };
}

function pickKnownFields<const T extends readonly string[]>(input: Record<string, unknown>, keys: T) {
  return Object.fromEntries(keys.flatMap((key) => (input[key] === undefined ? [] : [[key, input[key]]])));
}

function pickRepeatedString(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
    if (!Array.isArray(value)) {
      continue;
    }

    const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
    if (items.length > 0) {
      return items;
    }
  }
  return undefined;
}

function requireInputString(input: Record<string, unknown>, field: string, ...keys: string[]) {
  const value = pickOptionalString(input, ...keys);
  if (!value) {
    throw new ProviderRequestError(400, `${field} is required`);
  }
  return value;
}

function stringifyBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : String(value);
}

function stringifyInteger(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function eventsUrl(calendarId: string) {
  return `${googlecalendarApiBaseUrl}/calendars/${encodeURIComponent(calendarId)}/events`;
}

function eventUrl(calendarId: string, eventId: string) {
  return `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`;
}

async function listVisibleCalendars({ accessToken, fetcher }: GooglecalendarEventRuntimeDeps) {
  const calendars: QueriedCalendar[] = [];
  let pageToken: string | undefined;

  while (true) {
    const payload = await googlecalendarJsonRequest<{
      items?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    }>(`${googlecalendarApiBaseUrl}/users/me/calendarList`, {
      accessToken,
      fetcher,
      query: compactObject({
        pageToken,
        showHidden: "false",
        showDeleted: "false",
      }),
    });

    for (const item of payload.items ?? []) {
      const calendarId = optionalString(item.id);
      if (!calendarId) {
        continue;
      }
      calendars.push({
        calendarId,
        summary: optionalString(item.summary) ?? calendarId,
        primary: typeof item.primary === "boolean" ? item.primary : undefined,
        accessRole: optionalString(item.accessRole),
        timeZone: optionalString(item.timeZone),
      });
    }

    if (!payload.nextPageToken) {
      return calendars;
    }
    pageToken = payload.nextPageToken;
  }
}

async function collectCalendarEvents(
  calendarId: string,
  input: {
    q?: string;
    timeMin: string;
    timeMax: string;
    timeZone: string;
    eventTypes?: string | string[];
    showDeleted?: boolean;
    singleEvents?: boolean;
  },
  maxResultsPerCalendar: number,
  { accessToken, fetcher }: GooglecalendarEventRuntimeDeps,
) {
  const events: Array<Record<string, unknown>> = [];
  let pageToken: string | undefined;

  while (events.length < maxResultsPerCalendar) {
    const payload = await googlecalendarJsonRequest<{
      items?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    }>(eventsUrl(calendarId), {
      accessToken,
      fetcher,
      query: compactObject({
        q: input.q,
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        timeZone: input.timeZone,
        pageToken,
        eventTypes: input.eventTypes,
        maxResults: String(maxResultsPerCalendar),
        showDeleted: stringifyBoolean(input.showDeleted),
        singleEvents: stringifyBoolean(input.singleEvents),
      }),
    });

    const items = (payload.items ?? []).filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object",
    );
    events.push(...items.slice(0, maxResultsPerCalendar - events.length));

    if (!payload.nextPageToken || items.length === 0) {
      return events;
    }
    pageToken = payload.nextPageToken;
  }

  return events;
}

function mapCalendarError(error: unknown) {
  if (!(error instanceof ProviderRequestError)) {
    return {
      code: "provider_error",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (error.status === 429) {
    return {
      code: "rate_limited",
      message: error.message,
    };
  }
  if (error.status === 403) {
    return {
      code: "forbidden",
      message: error.message,
    };
  }
  if (error.status === 404) {
    return {
      code: "not_found",
      message: error.message,
    };
  }

  return {
    code: "provider_error",
    message: error.message,
  };
}

function compareAggregatedEvents(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  actionTimeZone: string,
  calendarTimeZoneById: Record<string, string>,
) {
  const leftSort = resolveEventSortTimestamp(left, actionTimeZone, calendarTimeZoneById);
  const rightSort = resolveEventSortTimestamp(right, actionTimeZone, calendarTimeZoneById);
  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }

  const leftCalendarId = optionalString(asObject(left.sourceCalendar).calendarId) ?? "";
  const rightCalendarId = optionalString(asObject(right.sourceCalendar).calendarId) ?? "";
  if (leftCalendarId !== rightCalendarId) {
    return leftCalendarId.localeCompare(rightCalendarId);
  }

  return (optionalString(left.id) ?? "").localeCompare(optionalString(right.id) ?? "");
}

function resolveEventSortTimestamp(
  event: Record<string, unknown>,
  actionTimeZone: string,
  calendarTimeZoneById: Record<string, string>,
) {
  const start = asOptionalRecord(event.start);
  if (!start) {
    return Number.POSITIVE_INFINITY;
  }

  const dateTime = optionalString(start.dateTime);
  if (dateTime) {
    return Date.parse(dateTime);
  }

  const date = optionalString(start.date);
  if (!date) {
    return Number.POSITIVE_INFINITY;
  }

  const calendarId = optionalString(asOptionalRecord(event.sourceCalendar)?.calendarId);
  const timeZone = (calendarId ? calendarTimeZoneById[calendarId] : undefined) ?? actionTimeZone;
  return resolveAllDaySortTimestamp(date, timeZone);
}

function buildSummaryItem(event: Record<string, unknown>, _actionTimeZone: string) {
  const start = asOptionalRecord(event.start);
  const end = asOptionalRecord(event.end);
  const sourceCalendar = asOptionalRecord(event.sourceCalendar);
  const calendarId = optionalString(sourceCalendar?.calendarId);
  const calendarSummary = optionalString(sourceCalendar?.summary);
  const eventId = optionalString(event.id);
  const status = optionalString(event.status);

  if (!start || !end || !calendarId || !calendarSummary || !eventId || !status) {
    return null;
  }

  return compactObject({
    calendarId,
    calendarSummary,
    eventId,
    summary: optionalString(event.summary) ?? "(untitled)",
    start,
    end,
    allDay: start.date !== undefined && start.dateTime === undefined,
    status,
    htmlLink: optionalString(event.htmlLink),
  });
}

function pickStringArray(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (!Array.isArray(value)) {
      continue;
    }

    const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
    if (items.length > 0) {
      return items;
    }
  }
  return [] as string[];
}

function asOptionalRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function resolveAllDaySortTimestamp(date: string, timeZone: string) {
  if (timeZone === "UTC") {
    return Date.parse(`${date}T00:00:00Z`);
  }

  const [year, month, day] = date.split("-").map((part) => Number(part));
  const utcMidnight = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 0, 0, 0);
  const firstPass = utcMidnight - resolveTimeZoneOffsetMs(utcMidnight, timeZone);
  return utcMidnight - resolveTimeZoneOffsetMs(firstPass, timeZone);
}

function resolveTimeZoneOffsetMs(timestampMs: number, timeZone: string) {
  const { year, month, day, hour, minute, second } = resolveTimeZoneDateTimeParts(timestampMs, timeZone);
  return Date.UTC(year, month - 1, day, hour, minute, second) - timestampMs;
}

function resolveTimeZoneDateTimeParts(timestampMs: number, timeZone: string): TimeZoneDateTimeParts {
  const formatter = getTimeZoneFormatter(timeZone);
  const parts = formatter.formatToParts(new Date(timestampMs));
  return {
    year: numberPart(parts, "year"),
    month: numberPart(parts, "month"),
    day: numberPart(parts, "day"),
    hour: numberPart(parts, "hour"),
    minute: numberPart(parts, "minute"),
    second: numberPart(parts, "second"),
  };
}

function getTimeZoneFormatter(timeZone: string) {
  const cached = timeZoneFormatterById.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  timeZoneFormatterById.set(timeZone, formatter);
  return formatter;
}

function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  const value = parts.find((part) => part.type === type)?.value;
  return Number(value ?? "0");
}

function assertValidTimeZone(timeZone: string) {
  try {
    getTimeZoneFormatter(timeZone);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new ProviderRequestError(400, "timeZone must be a valid IANA time zone");
    }
    throw error;
  }
}
