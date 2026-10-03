import { googleIdentityScopes } from "../googleads/scopes.ts";

export const googleCalendarReadonlyScope = "https://www.googleapis.com/auth/calendar.readonly";
export const googleCalendarEventsScope = "https://www.googleapis.com/auth/calendar.events";
export const googleCalendarCalendarsScope = "https://www.googleapis.com/auth/calendar.calendars";
export const googleCalendarCalendarListScope = "https://www.googleapis.com/auth/calendar.calendarlist";
export const googleCalendarSettingsReadonlyScope = "https://www.googleapis.com/auth/calendar.settings.readonly";
export const googleCalendarAclsScope = "https://www.googleapis.com/auth/calendar.acls";
export const googleCalendarAclsReadonlyScope = "https://www.googleapis.com/auth/calendar.acls.readonly";

export const googlecalendarReadScopes: string[] = [googleCalendarReadonlyScope];
export const googlecalendarEventsWriteScopes: string[] = [googleCalendarEventsScope];
export const googlecalendarCalendarsWriteScopes: string[] = [
  googleCalendarCalendarsScope,
  googleCalendarCalendarListScope,
];
export const googlecalendarSettingsReadScopes: string[] = [googleCalendarSettingsReadonlyScope];
export const googlecalendarAclReadScopes: string[] = [googleCalendarAclsReadonlyScope];
export const googlecalendarAclWriteScopes: string[] = [googleCalendarAclsScope];
export const googlecalendarOAuthScopes: string[] = [
  googleCalendarReadonlyScope,
  googleCalendarEventsScope,
  googleCalendarCalendarsScope,
  googleCalendarCalendarListScope,
  googleCalendarSettingsReadonlyScope,
  googleCalendarAclsScope,
  googleCalendarAclsReadonlyScope,
  ...googleIdentityScopes,
];

const googleCalendarScope = "https://www.googleapis.com/auth/calendar";
const googleCalendarCalendarListReadonlyScope = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const googleCalendarEventsFreeBusyScope = "https://www.googleapis.com/auth/calendar.events.freebusy";

/**
 * Scopes a client config may request beyond {@link googlecalendarOAuthScopes}; none joins a consent
 * unless named. `calendar.calendarlist.readonly` and `calendar.events.freebusy` are Google's
 * non-sensitive scopes for `calendarList.list`/`calendarList.get` and `freeBusy.query`, so a host
 * that writes events and lists calendars can leave the sensitive `calendar.readonly` out of its
 * consent. The full `calendar` scope is accepted by every Calendar API method, so a host that shares
 * and deletes calendars can request it alone instead of the union of the narrower scopes — one line
 * on Google's consent screen, and the smallest set its verification asks for. The service-account
 * mint list stays {@link googlecalendarOAuthScopes}: a domain-wide-delegation grant names those
 * exact scopes.
 */
export const googlecalendarOptionalScopes: string[] = [
  googleCalendarCalendarListReadonlyScope,
  googleCalendarEventsFreeBusyScope,
  googleCalendarScope,
];
