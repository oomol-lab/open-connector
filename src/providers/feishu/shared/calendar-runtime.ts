import type { FeishuJsonRequest } from "./client.ts";

import { optionalNumber } from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";

interface CalendarActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

interface CalendarAttendeeInput {
  readonly type: string;
  readonly id: string;
  readonly approvalReason?: string;
}

export function createFeishuCalendarActionHandlers(request: FeishuJsonRequest): Record<string, CalendarActionHandler> {
  return {
    list_calendar_agenda(input) {
      return listAgenda(input, request);
    },
    search_calendar_events(input) {
      return searchEvents(input, request);
    },
    get_calendar_event(input) {
      return getEvent(input, request);
    },
    create_calendar_event(input) {
      return createEvent(input, request);
    },
    update_calendar_event(input) {
      return updateEvent(input, request);
    },
    delete_calendar_event(input) {
      return deleteEvent(input, request);
    },
    query_calendar_freebusy(input) {
      return queryFreebusy(input, request);
    },
    find_calendar_rooms(input) {
      return findRooms(input, request);
    },
    suggest_calendar_times(input) {
      return suggestTimes(input, request);
    },
    reply_calendar_event(input) {
      return replyEvent(input, request);
    },
    get_calendar_meeting_info(input) {
      return getMeetingInfo(input, request);
    },
  };
}

async function listAgenda(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const start = unixSeconds(input.startTime, "startTime");
  const end = unixSeconds(input.endTime, "endTime");
  if (end < start) {
    throw providerInputError("endTime must be later than startTime");
  }

  const windows = splitUnixRange(start, end, 40 * 24 * 60 * 60);
  const pages = await Promise.all(
    windows.map(([windowStart, windowEnd]) =>
      request({
        path: `/calendar/v4/calendars/${encode(calendarId)}/events/instance_view`,
        query: {
          start_time: windowStart,
          end_time: windowEnd,
        },
      }),
    ),
  );
  const items = dedupeEvents(pages.flatMap((data) => recordArray(data.items)));
  return { items, hasMore: false, pageToken: null };
}

async function searchEvents(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const filter: Record<string, unknown> = {};
  if (input.startTime != null || input.endTime != null) {
    if (input.startTime == null || input.endTime == null) {
      throw providerInputError("startTime and endTime must be provided together");
    }
    filter.time_range = {
      start_time: rfc3339(input.startTime, "startTime"),
      end_time: rfc3339(input.endTime, "endTime"),
    };
  }
  const attendeeIds = stringArray(input.attendeeIds);
  if (attendeeIds.length > 0) {
    filter.attendee_user_ids = attendeeIds.filter((id) => id.startsWith("ou_"));
    filter.attendee_chat_ids = attendeeIds.filter((id) => id.startsWith("oc_"));
    filter.meeting_room_ids = attendeeIds.filter((id) => id.startsWith("omm_"));
  }

  const data = await request({
    method: "POST",
    path: `/calendar/v4/calendars/${encode(calendarId)}/events/search_event`,
    query: {
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
    body: {
      query: optionalString(input.query) ?? "",
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    },
  });
  return normalizePage(data);
}

async function getEvent(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const eventId = requiredString(input.eventId, "eventId");
  const data = await request({
    path: `/calendar/v4/calendars/${encode(calendarId)}/events/${encode(eventId)}`,
  });
  return { item: recordValue(data.event) };
}

async function createEvent(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const data = await request({
    method: "POST",
    path: `/calendar/v4/calendars/${encode(calendarId)}/events`,
    body: buildEventBody(input, true),
  });
  const event = recordValue(data.event);
  const eventId = optionalString(event.event_id);
  if (!eventId) {
    throw new ProviderRequestError(502, "invalid Feishu response: created calendar event has no event_id");
  }

  const attendees = attendeeArray(input.attendees);
  if (attendees.length > 0) {
    try {
      await request({
        method: "POST",
        path: `/calendar/v4/calendars/${encode(calendarId)}/events/${encode(eventId)}/attendees`,
        query: { user_id_type: "open_id" },
        body: {
          attendees: attendees.map(toFeishuAttendee),
          need_notification: input.notifyAttendees !== false,
        },
      });
    } catch (error) {
      try {
        await request({
          method: "DELETE",
          path: `/calendar/v4/calendars/${encode(calendarId)}/events/${encode(eventId)}`,
          query: { need_notification: false },
        });
      } catch (rollbackError) {
        throw new ProviderRequestError(
          502,
          `failed to add attendees and rollback event ${eventId}: ${errorMessage(error)}; rollback: ${errorMessage(rollbackError)}`,
        );
      }
      throw error;
    }
  }
  return { item: event };
}

async function updateEvent(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const eventId = requiredString(input.eventId, "eventId");
  const eventPath = `/calendar/v4/calendars/${encode(calendarId)}/events/${encode(eventId)}`;
  const eventBody = buildEventBody(input, false);
  let event: Record<string, unknown>;
  if (Object.keys(eventBody).length > 0) {
    const data = await request({
      method: "PATCH",
      path: eventPath,
      query: { user_id_type: "open_id" },
      body: eventBody,
    });
    event = recordValue(data.event);
  } else {
    const data = await request({ path: eventPath });
    event = recordValue(data.event);
  }

  const removeIds = stringArray(input.removeAttendeeIds);
  if (removeIds.length > 0) {
    await request({
      method: "POST",
      path: `${eventPath}/attendees/batch_delete`,
      query: { user_id_type: "open_id" },
      body: {
        delete_ids: removeIds.map(toAttendeeDeleteId),
        need_notification: input.notifyAttendees !== false,
      },
    });
  }

  const addAttendees = attendeeArray(input.addAttendees);
  if (addAttendees.length > 0) {
    await request({
      method: "POST",
      path: `${eventPath}/attendees`,
      query: { user_id_type: "open_id" },
      body: {
        attendees: addAttendees.map(toFeishuAttendee),
        need_notification: input.notifyAttendees !== false,
      },
    });
  }

  return {
    item: event,
    attendeesAdded: addAttendees.length,
    attendeesRemoved: removeIds.length,
  };
}

async function deleteEvent(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const eventId = requiredString(input.eventId, "eventId");
  await request({
    method: "DELETE",
    path: `/calendar/v4/calendars/${encode(calendarId)}/events/${encode(eventId)}`,
    query: { need_notification: input.notifyAttendees !== false },
  });
  return { deleted: true, eventId };
}

async function queryFreebusy(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/calendar/v4/freebusy/list",
    query: { user_id_type: optionalString(input.userIdType) ?? "open_id" },
    body: {
      time_min: rfc3339(input.startTime, "startTime"),
      time_max: rfc3339(input.endTime, "endTime"),
      user_id: requiredString(input.userId, "userId"),
      need_rsvp_status: input.includeRsvpStatus !== false,
    },
  });
  const items = recordArray(data.freebusy_list ?? data.items);
  return { items, hasMore: false, pageToken: null };
}

async function findRooms(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const slots = recordArray(input.timeSlots);
  const pages = await Promise.all(
    slots.map(async (slot) => {
      const data = await request({
        method: "POST",
        path: "/calendar/v4/freebusy/room_find",
        body: {
          event_start_time: rfc3339(slot.startTime, "timeSlots.startTime"),
          event_end_time: rfc3339(slot.endTime, "timeSlots.endTime"),
          attendee_user_ids: stringArray(input.attendeeUserIds),
          attendee_chat_ids: stringArray(input.attendeeChatIds),
          city: optionalString(input.city),
          building: optionalString(input.building),
          floor: optionalString(input.floor),
          room_name: optionalString(input.roomName),
          min_capacity: optionalNumber(input.minCapacity),
          max_capacity: optionalNumber(input.maxCapacity),
          timezone: optionalString(input.timezone),
          event_rrule: optionalString(input.recurrence),
        },
      });
      return {
        start_time: slot.startTime,
        end_time: slot.endTime,
        rooms: recordArray(data.available_rooms ?? data.items),
      };
    }),
  );
  return { items: pages, hasMore: false, pageToken: null };
}

async function suggestTimes(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const ranges = recordArray(input.timeRanges);
  const pages = await Promise.all(
    ranges.map(async (range) => {
      const data = await request({
        method: "POST",
        path: "/calendar/v4/freebusy/suggestion",
        body: {
          search_start_time: rfc3339(range.startTime, "timeRanges.startTime"),
          search_end_time: rfc3339(range.endTime, "timeRanges.endTime"),
          duration_minutes: requiredNumber(input.durationMinutes, "durationMinutes"),
          attendee_user_ids: stringArray(input.attendeeUserIds),
          attendee_chat_ids: stringArray(input.attendeeChatIds),
        },
      });
      return recordArray(data.suggestions ?? data.items);
    }),
  );
  return { items: pages.flat(), hasMore: false, pageToken: null };
}

async function replyEvent(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const eventId = requiredString(input.eventId, "eventId");
  const status = requiredString(input.status, "status");
  await request({
    method: "POST",
    path: `/calendar/v4/calendars/${encode(calendarId)}/events/${encode(eventId)}/reply`,
    body: { rsvp_status: status },
  });
  return { eventId, status };
}

async function getMeetingInfo(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const calendarId = requiredString(input.calendarId, "calendarId");
  const data = await request({
    method: "POST",
    path: `/calendar/v4/calendars/${encode(calendarId)}/events/mget_instance_relation_info`,
    body: {
      instance_ids: stringArray(input.instanceIds),
      need_meeting_instance_ids: true,
      need_meeting_notes: true,
      need_ai_meeting_notes: true,
    },
  });
  const items = recordArray(data.instance_relation_infos ?? data.items);
  return { items, hasMore: false, pageToken: null };
}

function buildEventBody(input: Record<string, unknown>, required: boolean) {
  const body: Record<string, unknown> = {};
  assignString(body, "summary", input.summary, required);
  assignString(body, "description_rich", input.description);
  assignScalar(body, "visibility", input.visibility);
  assignScalar(body, "attendee_ability", input.attendeeAbility);
  assignScalar(body, "free_busy_status", input.freeBusyStatus);
  assignScalar(body, "location", input.location);
  assignScalar(body, "recurrence", input.recurrence);
  assignScalar(body, "reminders", input.reminders);
  if (input.startTime != null) {
    body.start_time = calendarTime(input.startTime, input.timezone, input.isAllDay);
  } else if (required) {
    throw providerInputError("startTime is required");
  }
  if (input.endTime != null) {
    body.end_time = calendarTime(input.endTime, input.timezone, input.isAllDay);
  } else if (required) {
    throw providerInputError("endTime is required");
  }
  if (
    input.startTime != null &&
    input.endTime != null &&
    unixSeconds(input.endTime, "endTime") <= unixSeconds(input.startTime, "startTime")
  ) {
    throw providerInputError("endTime must be later than startTime");
  }
  return body;
}

function calendarTime(value: unknown, timezone: unknown, isAllDay: unknown) {
  const result: Record<string, unknown> = {
    timestamp: unixSeconds(value, "time").toString(),
  };
  const timezoneString = optionalString(timezone);
  if (timezoneString) {
    result.timezone = timezoneString;
  }
  if (typeof isAllDay === "boolean") {
    result.is_all_day = isAllDay;
  }
  return result;
}

function toFeishuAttendee(attendee: CalendarAttendeeInput) {
  if (attendee.type === "user") {
    return compact({ type: "user", user_id: attendee.id });
  } else if (attendee.type === "chat") {
    return compact({ type: "chat", chat_id: attendee.id });
  } else if (attendee.type === "resource") {
    return compact({
      type: "resource",
      room_id: attendee.id,
      approval_reason: attendee.approvalReason,
    });
  } else {
    return compact({ type: "third_party", third_party_email: attendee.id });
  }
}

function toAttendeeDeleteId(id: string) {
  if (id.startsWith("oc_")) {
    return { type: "chat", chat_id: id };
  } else if (id.startsWith("omm_")) {
    return { type: "resource", room_id: id };
  } else {
    return { type: "user", user_id: id };
  }
}

function splitUnixRange(start: number, end: number, maxSpan: number) {
  const windows: Array<[number, number]> = [];
  let cursor = start;
  while (cursor <= end) {
    const windowEnd = Math.min(cursor + maxSpan, end);
    windows.push([cursor, windowEnd]);
    cursor = windowEnd + 1;
  }
  return windows;
}

function dedupeEvents(items: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = [
        optionalString(item.event_id) ?? "",
        optionalString(recordValue(item.start_time).timestamp) ?? "",
        optionalString(recordValue(item.end_time).timestamp) ?? "",
      ].join("|");
      if (seen.has(key)) {
        return false;
      } else {
        seen.add(key);
        return true;
      }
    })
    .sort(
      (left, right) =>
        Number(optionalString(recordValue(left.start_time).timestamp) ?? 0) -
        Number(optionalString(recordValue(right.start_time).timestamp) ?? 0),
    );
}

function normalizePage(data: Record<string, unknown>) {
  return {
    items: recordArray(data.items),
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? null,
  };
}

function attendeeArray(value: unknown): CalendarAttendeeInput[] {
  return recordArray(value).map((item) => ({
    type: requiredString(item.type, "attendee.type"),
    id: requiredString(item.id, "attendee.id"),
    approvalReason: optionalString(item.approvalReason),
  }));
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
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

function requiredNumber(value: unknown, field: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw providerInputError(`${field} must be a number`);
}

function unixSeconds(value: unknown, field: string) {
  const raw = requiredString(value, field);
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }
  const milliseconds = Date.parse(raw);
  if (Number.isFinite(milliseconds)) {
    return Math.trunc(milliseconds / 1000);
  }
  throw providerInputError(`${field} must be an RFC 3339 date-time or Unix timestamp`);
}

function rfc3339(value: unknown, field: string) {
  const raw = requiredString(value, field);
  const numeric = Number(raw);
  const milliseconds = Number.isFinite(numeric) ? numeric * 1000 : Date.parse(raw);
  if (!Number.isFinite(milliseconds)) {
    throw providerInputError(`${field} must be an RFC 3339 date-time or Unix timestamp`);
  }
  return new Date(milliseconds).toISOString();
}

function assignString(target: Record<string, unknown>, key: string, value: unknown, required = false) {
  const stringValue = optionalString(value);
  if (stringValue) {
    target[key] = stringValue;
  } else if (required) {
    throw providerInputError(`${key} is required`);
  }
}

function assignScalar(target: Record<string, unknown>, key: string, value: unknown) {
  if (value !== undefined) {
    target[key] = value;
  }
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
