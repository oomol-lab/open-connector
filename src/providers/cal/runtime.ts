import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { OAuthProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import { readOAuthScopes } from "../../oauth/oauth-scopes.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

export const calApiBaseUrl = "https://api.cal.com";
const calMeApiVersion = "2024-08-13";
const calBookingsApiVersion = "2024-08-13";
const calCalendarsApiVersion = "2024-08-13";
const calEventTypesApiVersion = "2024-06-14";
const calSchedulesApiVersion = "2024-06-11";
const calSlotsApiVersion = "2024-09-04";

export function resolveCalProxyApiVersion(pathname: string): string | undefined {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "v2") return undefined;

  switch (segments[1]) {
    case "me":
      return calMeApiVersion;
    case "bookings":
      return calBookingsApiVersion;
    case "calendars":
    case "destination-calendars":
      return calCalendarsApiVersion;
    case "event-types":
      return calEventTypesApiVersion;
    case "schedules":
      return calSchedulesApiVersion;
    case "slots":
      return calSlotsApiVersion;
    default:
      return undefined;
  }
}

type CalActionContext = Pick<OAuthProviderContext, "accessToken" | "tokenType" | "fetcher" | "signal">;
type CalActionHandler = ProviderRuntimeHandler<OAuthProviderContext>;

interface CalEnvelope<T> {
  status?: string;
  pagination?: Record<string, unknown>;
  data?: T;
  error?: { message?: string } | string;
  message?: string;
}

export const calActionHandlers: ProviderActionHandlers<"cal", CalActionHandler> = {
  get_my_profile(_input, context) {
    return calGetMyProfile(context);
  },
  retrieve_my_information(_input, context) {
    return calGetMyProfile(context);
  },
  update_my_profile(input, context) {
    return calUpdateMyProfile(input, context);
  },
  update_user_profile_details(input, context) {
    return calUpdateMyProfile(input, context);
  },
  list_event_types(input, context) {
    return calListEventTypes(input, context);
  },
  get_event_type(input, context) {
    return calGetEventType(input, context);
  },
  retrieve_event_type_by_id(input, context) {
    return calGetEventType(input, context);
  },
  fetch_event_type_details(input, context) {
    return calGetEventType(input, context);
  },
  create_event_type(input, context) {
    return calCreateEventType(input, context);
  },
  update_event_type(input, context) {
    return calUpdateEventType(input, context);
  },
  delete_event_type(input, context) {
    return calDeleteEventType(input, context);
  },
  delete_event_type_by_id(input, context) {
    return calDeleteEventType(input, context);
  },
  get_event_type_private_links(input, context) {
    return calGetEventTypePrivateLinks(input, context);
  },
  get_available_slots_info(input, context) {
    return calGetAvailableSlots(input, context);
  },
  retrieve_calendar_list(_input, context) {
    return calRetrieveCalendarList(context);
  },
  retrieve_calendar_busy_times(input, context) {
    return calRetrieveCalendarBusyTimes(input, context);
  },
  update_destination_calendar_integration(input, context) {
    return calUpdateDestinationCalendarIntegration(input, context);
  },
  list_bookings(input, context) {
    return calListBookings(input, context);
  },
  fetch_all_bookings(input, context) {
    return calFetchAllBookings(input, context);
  },
  get_booking(input, context) {
    return calGetBooking(input, context);
  },
  retrieve_booking_details_by_uid(input, context) {
    return calGetBooking(input, context);
  },
  create_booking(input, context) {
    return calCreateBooking(input, context);
  },
  post_new_booking_request(input, context) {
    return calCreateBooking(input, context);
  },
  list_attendees(input, context) {
    return calListAttendees(input, context);
  },
  add_attendee(input, context) {
    return calAddAttendee(input, context);
  },
  list_booking_references(input, context) {
    return calListBookingReferences(input, context);
  },
  get_booking_references(input, context) {
    return calListBookingReferences(input, context);
  },
  confirm_booking_by_uid(input, context) {
    return calConfirmBooking(input, context);
  },
  decline_booking_with_reason(input, context) {
    return calDeclineBooking(input, context);
  },
  mark_booking_absent_for_uid(input, context) {
    return calMarkBookingAbsent(input, context);
  },
  reassign_booking_with_uid(input, context) {
    return calReassignBooking(input, context);
  },
  cancel_booking(input, context) {
    return calCancelBooking(input, context);
  },
  cancel_booking_via_uid(input, context) {
    return calCancelBooking(input, context);
  },
  reschedule_booking(input, context) {
    return calRescheduleBooking(input, context);
  },
  reschedule_booking_by_uid(input, context) {
    return calRescheduleBooking(
      {
        ...input,
        reason: input.reschedulingReason,
      },
      context,
    );
  },
  list_schedules(input, context) {
    return calListSchedules(input, context);
  },
  retrieve_schedules_list(_input, context) {
    return calListSchedules({}, context);
  },
  get_schedule(input, context) {
    return calGetSchedule(input, context);
  },
  fetch_schedule_by_id(input, context) {
    return calGetSchedule(input, context);
  },
  create_schedule(input, context) {
    return calCreateSchedule(input, context);
  },
  create_user_availability_schedule(input, context) {
    return calCreateSchedule(input, context);
  },
  update_schedule(input, context) {
    return calUpdateSchedule(input, context);
  },
  update_schedule_by_id(input, context) {
    return calUpdateSchedule(input, context);
  },
  delete_schedule(input, context) {
    return calDeleteSchedule(input, context);
  },
  delete_schedule_by_id(input, context) {
    return calDeleteSchedule(input, context);
  },
  get_default_schedule(_input, context) {
    return calGetDefaultSchedule(context);
  },
  get_default_schedule_details(_input, context) {
    return calGetDefaultSchedule(context);
  },
};

export async function validateCalCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const profile = await calRequest<Record<string, unknown>>({
    context: {
      accessToken: credential.accessToken,
      tokenType: credential.tokenType,
      fetcher,
      signal,
    },
    path: "/v2/me",
    apiVersion: calMeApiVersion,
  });
  const id = optionalInteger(profile.id);

  return {
    profile: {
      accountId: id !== undefined ? String(id) : "cal:oauth2",
      displayName:
        optionalString(profile.name) ??
        optionalString(profile.username) ??
        optionalString(profile.email) ??
        (id !== undefined ? String(id) : "Cal.com Account"),
    },
    grantedScopes: readOAuthScopes(credential.metadata.scope),
    metadata: compactObject({
      ...credential.metadata,
      id,
      username: optionalString(profile.username),
      email: optionalString(profile.email),
      name: optionalString(profile.name),
      timeZone: optionalString(profile.timeZone),
      defaultScheduleId: optionalInteger(profile.defaultScheduleId),
    }),
  };
}

async function calGetMyProfile(context: CalActionContext): Promise<Record<string, unknown>> {
  const profile = await calRequest<Record<string, unknown>>({
    context,
    path: "/v2/me",
    apiVersion: calMeApiVersion,
  });

  return { profile };
}

async function calUpdateMyProfile(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const profile = await calRequest<Record<string, unknown>>({
    context,
    path: "/v2/me",
    method: "PATCH",
    apiVersion: calMeApiVersion,
    body: input,
  });

  return { profile };
}

async function calListEventTypes(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: "/v2/event-types",
    apiVersion: calEventTypesApiVersion,
    query: compactObject({
      teamId: input.teamId,
      username: input.username,
      status: input.status,
      schedulingType: input.schedulingType,
      onlyActive: input.onlyActive,
    }),
  });

  return {
    eventTypes: looseArray(data),
  };
}

async function calGetEventType(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/event-types/${String(input.eventTypeId)}`,
    apiVersion: calEventTypesApiVersion,
    query: compactObject({
      username: input.username,
      teamId: input.teamId,
    }),
  });

  return { eventType: recordOrEmpty(data) };
}

async function calCreateEventType(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: "/v2/event-types",
    method: "POST",
    apiVersion: calEventTypesApiVersion,
    body: input,
  });

  return { eventType: recordOrEmpty(data) };
}

async function calUpdateEventType(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const { eventTypeId, ...body } = input;
  const data = await calRequest<unknown>({
    context,
    path: `/v2/event-types/${String(eventTypeId)}`,
    method: "PATCH",
    apiVersion: calEventTypesApiVersion,
    body,
  });

  return { eventType: recordOrEmpty(data) };
}

async function calDeleteEventType(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/event-types/${String(input.eventTypeId)}`,
    method: "DELETE",
    apiVersion: calEventTypesApiVersion,
  });

  return { eventType: recordOrEmpty(data) };
}

async function calGetEventTypePrivateLinks(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/event-types/${String(input.eventTypeId)}/private-links`,
    apiVersion: calEventTypesApiVersion,
  });

  return { privateLinks: looseArray(data) };
}

async function calGetAvailableSlots(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  if (!input.eventTypeId && !input.eventTypeSlug && !input.usernames) {
    throw new ProviderRequestError(400, "eventTypeId, eventTypeSlug, or usernames is required");
  }
  const data = await calRequest<unknown>({
    context,
    path: "/v2/slots",
    apiVersion: calSlotsApiVersion,
    query: compactObject({
      eventTypeId: input.eventTypeId,
      eventTypeSlug: input.eventTypeSlug,
      username: input.username,
      usernames: input.usernames,
      teamSlug: input.teamSlug,
      organizationSlug: input.organizationSlug,
      start: input.start,
      end: input.end,
      timeZone: input.timeZone,
      duration: input.duration,
      format: input.format,
      bookingUidToReschedule: input.bookingUidToReschedule,
    }),
  });

  return { slots: recordOrEmpty(data) };
}

async function calRetrieveCalendarList(context: CalActionContext): Promise<Record<string, unknown>> {
  const data = await calRequest<{
    connectedCalendars?: Record<string, unknown>[];
    destinationCalendar?: Record<string, unknown> | null;
  }>({
    context,
    path: "/v2/calendars",
    apiVersion: calCalendarsApiVersion,
  });

  return {
    connectedCalendars: data.connectedCalendars ?? [],
    destinationCalendar: data.destinationCalendar ?? null,
  };
}

async function calRetrieveCalendarBusyTimes(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const url = new URL(`${calApiBaseUrl}/v2/calendars/busy-times`);
  const baseQuery = compactObject({
    timeZone: input.timeZone,
    loggedInUsersTz: input.loggedInUsersTz,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });
  for (const [key, value] of Object.entries(baseQuery)) {
    url.searchParams.set(key, String(value));
  }

  const calendars = Array.isArray(input.calendarsToLoad) ? input.calendarsToLoad : [];
  for (const [index, calendar] of calendars.entries()) {
    const record = optionalRecord(calendar);
    if (!record) {
      continue;
    }
    if (record.credentialId != null) {
      url.searchParams.set(`calendarsToLoad[${index}][credentialId]`, String(record.credentialId));
    }
    if (record.externalId != null) {
      url.searchParams.set(`calendarsToLoad[${index}][externalId]`, String(record.externalId));
    }
  }

  const response = await context.fetcher(url.toString(), {
    headers: buildCalHeaders(context, calCalendarsApiVersion),
    signal: context.signal,
  });
  await assertCalResponse(response);
  const payload = (await readCalJson(response)) as CalEnvelope<unknown>;

  return {
    busyTimes: looseArray(payload.data),
  };
}

async function calUpdateDestinationCalendarIntegration(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: "/v2/destination-calendars",
    method: "POST",
    apiVersion: calCalendarsApiVersion,
    body: input,
  });

  return {
    destinationCalendar: recordOrEmpty(data),
  };
}

async function calListBookings(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const payload = await calRequestEnvelope<unknown>({
    context,
    path: "/v2/bookings",
    apiVersion: calBookingsApiVersion,
    query: compactObject({
      status: input.status,
      attendeeEmail: input.attendeeEmail,
      eventTypeId: input.eventTypeId,
      eventTypeSlug: input.eventTypeSlug,
      sortStart: input.sortStart,
      sortEnd: input.sortEnd,
      afterStart: input.afterStart,
      beforeStart: input.beforeStart,
      afterEnd: input.afterEnd,
      beforeEnd: input.beforeEnd,
      take: input.take,
      skip: input.skip,
    }),
  });

  return {
    bookings: looseArray(payload.data),
    pagination: payload.pagination ?? null,
  };
}

async function calFetchAllBookings(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const statusInput = Array.isArray(input.status)
    ? input.status
        .map((value) => String(value).trim())
        .filter((value) => value.length > 0)
        .join(",")
    : input.status;

  const payload = await calRequestEnvelope<unknown>({
    context,
    path: "/v2/bookings",
    apiVersion: calBookingsApiVersion,
    query: compactObject({
      skip: input.skip,
      take: input.take,
      status: statusInput,
      teamId: input.teamId,
      teamsIds: input.teamsIds,
      sortStart: input.sortStart,
      sortEnd: input.sortEnd,
      sortCreated: input.sortCreated,
      afterStart: input.afterStart,
      beforeEnd: input.beforeEnd,
      attendeeName: input.attendeeName,
      attendeeEmail: input.attendeeEmail,
      eventTypeId: input.eventTypeId,
      eventTypeIds: input.eventTypeIds,
    }),
  });

  return {
    bookings: looseArray(payload.data),
    pagination: payload.pagination ?? null,
  };
}

async function calGetBooking(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}`,
    apiVersion: calBookingsApiVersion,
  });

  return {
    booking: readCalBooking(data),
  };
}

async function calCreateBooking(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  if (!input.eventTypeId && !input.eventTypeSlug) {
    throw new ProviderRequestError(400, "eventTypeId or eventTypeSlug is required");
  }
  if (input.eventTypeSlug && !input.username && !input.teamSlug) {
    throw new ProviderRequestError(400, "username or teamSlug is required when eventTypeSlug is provided");
  }
  const data = await calRequest<unknown>({
    context,
    path: "/v2/bookings",
    method: "POST",
    apiVersion: calBookingsApiVersion,
    body: input,
  });

  return {
    booking: readCalBooking(data),
  };
}

async function calListAttendees(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/attendees`,
    apiVersion: calBookingsApiVersion,
  });

  return { attendees: looseArray(data) };
}

async function calAddAttendee(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const { bookingUid, ...body } = input;
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(bookingUid)}/attendees`,
    method: "POST",
    apiVersion: calBookingsApiVersion,
    body,
  });

  return { attendee: recordOrEmpty(data) };
}

async function calListBookingReferences(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/references`,
    apiVersion: calBookingsApiVersion,
    query: compactObject({
      type: input.type,
    }),
  });

  return { references: looseArray(data) };
}

async function calConfirmBooking(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/confirm`,
    method: "POST",
    apiVersion: calBookingsApiVersion,
  });

  return { booking: readCalBooking(data) };
}

async function calDeclineBooking(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/decline`,
    method: "POST",
    apiVersion: calBookingsApiVersion,
    body: compactObject({ reason: input.reason }),
  });

  return { booking: readCalBooking(data) };
}

async function calMarkBookingAbsent(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/mark-absent`,
    method: "POST",
    apiVersion: calBookingsApiVersion,
    body: compactObject({
      host: input.host,
      attendees: input.attendees,
    }),
  });

  return { booking: readCalBooking(data) };
}

async function calReassignBooking(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<Record<string, unknown>>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/reassign/${String(input.userId)}`,
    method: "POST",
    apiVersion: calBookingsApiVersion,
    body: compactObject({
      reason: input.reason,
    }),
  });

  return { result: data };
}

async function calCancelBooking(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/cancel`,
    method: "POST",
    apiVersion: calBookingsApiVersion,
    body: compactObject({
      cancellationReason: input.cancellationReason,
      cancelSubsequentBookings: input.cancelSubsequentBookings,
    }),
  });

  return {
    booking: readCalBooking(data),
  };
}

async function calRescheduleBooking(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/bookings/${String(input.bookingUid)}/reschedule`,
    method: "POST",
    apiVersion: calBookingsApiVersion,
    body: compactObject({
      start: input.start,
      rescheduledBy: input.rescheduledBy,
      reason: input.reason,
    }),
  });

  return {
    booking: readCalBooking(data),
  };
}

async function calListSchedules(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: "/v2/schedules",
    apiVersion: calSchedulesApiVersion,
  });

  return {
    schedules: looseArray(data),
  };
}

async function calGetSchedule(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: `/v2/schedules/${String(input.scheduleId)}`,
    apiVersion: calSchedulesApiVersion,
  });

  return { schedule: recordOrEmpty(data) };
}

async function calCreateSchedule(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: "/v2/schedules",
    method: "POST",
    apiVersion: calSchedulesApiVersion,
    body: input,
  });

  return { schedule: recordOrEmpty(data) };
}

async function calUpdateSchedule(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  const { scheduleId, ...body } = input;
  const data = await calRequest<unknown>({
    context,
    path: `/v2/schedules/${String(scheduleId)}`,
    method: "PATCH",
    apiVersion: calSchedulesApiVersion,
    body,
  });

  return { schedule: recordOrEmpty(data) };
}

async function calDeleteSchedule(
  input: Record<string, unknown>,
  context: CalActionContext,
): Promise<Record<string, unknown>> {
  await calRequest<Record<string, unknown>>({
    context,
    path: `/v2/schedules/${String(input.scheduleId)}`,
    method: "DELETE",
    apiVersion: calSchedulesApiVersion,
  });

  return { success: true };
}

async function calGetDefaultSchedule(context: CalActionContext): Promise<Record<string, unknown>> {
  const data = await calRequest<unknown>({
    context,
    path: "/v2/schedules/default",
    apiVersion: calSchedulesApiVersion,
  });

  return { schedule: recordOrEmpty(data) };
}

interface CalRequestInput {
  context: CalActionContext;
  path: string;
  method?: string;
  apiVersion?: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

async function calRequest<T>(input: CalRequestInput): Promise<T> {
  const payload = await calRequestEnvelope<T>(input);
  return (payload.data ?? payload) as T;
}

async function calRequestEnvelope<T>(input: CalRequestInput): Promise<CalEnvelope<T>> {
  const url = new URL(`${calApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await input.context.fetcher(url.toString(), {
    method: input.method ?? (input.body ? "POST" : "GET"),
    headers: buildCalHeaders(input.context, input.apiVersion, Boolean(input.body)),
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: input.context.signal,
  });

  await assertCalResponse(response);
  return (await readCalJson(response)) as CalEnvelope<T>;
}

function readCalBooking(data: unknown): Record<string, unknown> | unknown[] {
  return Array.isArray(data) ? data : recordOrEmpty(data);
}

async function assertCalResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const message = await extractCalErrorMessage(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  throw new ProviderRequestError(response.status, message);
}

async function readCalJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Cal.com returned invalid JSON");
  }
}

async function extractCalErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `cal request failed with ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
    if (typeof parsed.error_description === "string") {
      return parsed.error_description;
    }
    if (typeof parsed.error === "string") {
      return parsed.error;
    }
    const error = optionalRecord(parsed.error);
    const errorMessage = optionalString(error?.message);
    if (errorMessage) {
      return errorMessage;
    }
  } catch {
    return text;
  }

  return text;
}

function buildCalHeaders(context: CalActionContext, apiVersion?: string, hasJsonBody = false): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `${context.tokenType ?? "Bearer"} ${context.accessToken}`,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  if (apiVersion) {
    headers["cal-api-version"] = apiVersion;
  }
  return headers;
}
