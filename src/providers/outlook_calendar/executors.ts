import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { compactJson, encodePathSegment } from "../../core/request.ts";
import { microsoftGraphJson, microsoftGraphRequest } from "../outlook/microsoft-graph.ts";
import { defineOAuthProviderExecutors, defineProviderProxy, requiredInputString } from "../provider-runtime.ts";

const service = "outlook_calendar";
const graphBaseUrl = "https://graph.microsoft.com/v1.0";

type Handler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: graphBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

const handlers: ProviderActionHandlers<"outlook_calendar", Handler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_calendars(input, context) {
    return listCalendars(input, context);
  },
  get_calendar(input, context) {
    return getCalendar(input, context);
  },
  list_events(input, context) {
    return listEvents(input, context, false);
  },
  list_calendar_view(input, context) {
    return listEvents(input, context, true);
  },
  get_event(input, context) {
    return getEvent(input, context);
  },
  get_schedule(input, context) {
    return getSchedule(input, context);
  },
  find_meeting_times(input, context) {
    return findMeetingTimes(input, context);
  },
  create_event(input, context) {
    return createEvent(input, context);
  },
  update_event(input, context) {
    return updateEvent(input, context);
  },
  delete_event(input, context) {
    return eventMutation(input, context, "delete");
  },
  cancel_event(input, context) {
    return eventMutation(input, context, "cancel");
  },
  accept_event(input, context) {
    return eventMutation(input, context, "accept");
  },
  decline_event(input, context) {
    return eventMutation(input, context, "decline");
  },
  tentatively_accept_event(input, context) {
    return eventMutation(input, context, "tentativelyAccept");
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile = await microsoftGraphJson<Record<string, unknown>>("me", {
      accessToken: input.accessToken,
      fetcher,
      signal,
      query: { $select: "id,displayName,mail,userPrincipalName" },
      label: "Outlook Calendar credential validation",
    });
    const accountId = requiredString(profile.id, "Outlook Calendar current account id");
    return {
      profile: {
        accountId,
        displayName:
          optionalString(profile.mail) ??
          optionalString(profile.userPrincipalName) ??
          optionalString(profile.displayName) ??
          accountId,
      },
      metadata: { currentAccount: profile },
    };
  },
};

async function getCurrentUser(context: OAuthProviderContext): Promise<unknown> {
  return microsoftGraphJson(
    "me",
    requestOptions(context, "get current user", {
      $select: "id,displayName,mail,userPrincipalName",
    }),
  );
}

async function listCalendars(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const nextLinkValue = optionalString(input.nextLink);
  const payload = await microsoftGraphJson<Record<string, unknown>>(
    nextLinkValue ?? "me/calendars",
    requestOptions(context, "list calendars", nextLinkValue ? undefined : listQuery(input), allowCalendarNextLink),
  );
  return listOutput(payload, "calendars");
}

async function getCalendar(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const id = requiredInputString(input.calendarId, "calendarId");
  return microsoftGraphJson(
    `me/calendars/${encodePathSegment(id)}`,
    requestOptions(context, "get calendar", { $select: stringList(input.select) }),
  );
}

async function listEvents(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  calendarView: boolean,
): Promise<unknown> {
  const nextLinkValue = optionalString(input.nextLink);
  const calendar = optionalString(input.calendarId);
  const collection = calendarView ? "calendarView" : "events";
  const path = calendar ? `me/calendars/${encodePathSegment(calendar)}/${collection}` : `me/${collection}`;
  const query = nextLinkValue
    ? undefined
    : compactObject({
        ...listQuery(input),
        startDateTime: calendarView ? optionalString(input.startDateTime) : undefined,
        endDateTime: calendarView ? optionalString(input.endDateTime) : undefined,
      });
  const payload = await microsoftGraphJson<Record<string, unknown>>(
    nextLinkValue ?? path,
    requestOptions(
      context,
      `list ${calendarView ? "calendar view" : "events"}`,
      query,
      allowEventNextLink,
      preferTimeZone(input),
    ),
  );
  return listOutput(payload, "events");
}

async function getEvent(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const id = requiredInputString(input.eventId, "eventId");
  return microsoftGraphJson(
    `me/events/${encodePathSegment(id)}`,
    requestOptions(context, "get event", { $select: stringList(input.select) }, undefined, preferTimeZone(input)),
  );
}

async function getSchedule(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const payload = await microsoftGraphJson<Record<string, unknown>>(
    "me/calendar/getSchedule",
    requestOptions(context, "get schedule", undefined, undefined, preferTimeZone(input), {
      schedules: looseArray(input.schedules),
      startTime: optionalRecord(input.startTime),
      endTime: optionalRecord(input.endTime),
      availabilityViewInterval: optionalNumber(input.availabilityViewInterval),
    }),
  );
  return { schedules: looseArray(payload.value) };
}

async function findMeetingTimes(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  return microsoftGraphJson(
    "me/findMeetingTimes",
    requestOptions(
      context,
      "find meeting times",
      undefined,
      undefined,
      preferTimeZone(input),
      bodyFields(input, [
        "attendees",
        "locationConstraint",
        "timeConstraint",
        "meetingDuration",
        "maxCandidates",
        "isOrganizerOptional",
        "returnSuggestionReasons",
        "minimumAttendeePercentage",
      ]),
    ),
  );
}

async function createEvent(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const calendar = optionalString(input.calendarId);
  const path = calendar ? `me/calendars/${encodePathSegment(calendar)}/events` : "me/events";
  return microsoftGraphJson(
    path,
    requestOptions(
      context,
      "create event",
      undefined,
      undefined,
      preferTimeZone(input),
      optionalRecord(input.event) ?? {},
    ),
  );
}

async function updateEvent(input: Record<string, unknown>, context: OAuthProviderContext): Promise<unknown> {
  const id = requiredInputString(input.eventId, "eventId");
  return microsoftGraphJson(
    `me/events/${encodePathSegment(id)}`,
    requestOptions(
      context,
      "update event",
      undefined,
      undefined,
      preferTimeZone(input),
      optionalRecord(input.event) ?? {},
      "PATCH",
    ),
  );
}

async function eventMutation(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  operation: "delete" | "cancel" | "accept" | "decline" | "tentativelyAccept",
): Promise<unknown> {
  const id = requiredInputString(input.eventId, "eventId");
  const isDelete = operation === "delete";
  const body = isDelete
    ? undefined
    : operation === "cancel"
      ? { comment: optionalRawString(input.comment) }
      : compactJson({
          comment: optionalRawString(input.comment),
          sendResponse: optionalBoolean(input.sendResponse),
          proposedNewTime: optionalRecord(input.proposedNewTime),
        });
  await microsoftGraphRequest(
    isDelete ? `me/events/${encodePathSegment(id)}` : `me/events/${encodePathSegment(id)}/${operation}`,
    requestOptions(context, `${operation} event`, undefined, undefined, undefined, body, isDelete ? "DELETE" : "POST"),
  );
  return { success: true };
}

function requestOptions(
  context: OAuthProviderContext,
  operation: string,
  query?: Record<string, string | undefined>,
  allowNextLink?: (pathname: string) => boolean,
  headers?: Record<string, string>,
  body?: unknown,
  method?: string,
) {
  return {
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    query,
    allowNextLink,
    headers,
    body: body === undefined ? undefined : compactJson(body),
    method,
    label: `Outlook Calendar ${operation}`,
  };
}

function listQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    $top: optionalNumber(input.top)?.toString(),
    $filter: optionalString(input.filter),
    $orderby: optionalString(input.orderby),
    $select: stringList(input.select),
    $expand: optionalString(input.expand),
  };
}

function listOutput(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  return {
    [key]: looseArray(payload.value),
    nextLink: optionalString(payload["@odata.nextLink"]) ?? null,
  };
}

function stringList(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).join(",") : undefined;
}

function preferTimeZone(input: Record<string, unknown>): Record<string, string> | undefined {
  const value = optionalString(input.preferTimeZone);
  return value ? { Prefer: `outlook.timezone="${value.replaceAll('"', "")}"` } : undefined;
}

function bodyFields(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      body[field] = input[field];
    }
  }
  return body;
}

function allowCalendarNextLink(pathname: string): boolean {
  return pathname === "/v1.0/me/calendars";
}

function allowEventNextLink(pathname: string): boolean {
  if (pathname === "/v1.0/me/events" || pathname === "/v1.0/me/calendarView") {
    return true;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length === 4 &&
    segments[0] === "v1.0" &&
    segments[1] === "me" &&
    segments[2]?.startsWith("calendars('") &&
    segments[2].endsWith("')")
  ) {
    return segments[3] === "events" || segments[3] === "calendarView";
  }
  return (
    segments.length === 5 &&
    segments[0] === "v1.0" &&
    segments[1] === "me" &&
    segments[2] === "calendars" &&
    (segments[4] === "events" || segments[4] === "calendarView")
  );
}
