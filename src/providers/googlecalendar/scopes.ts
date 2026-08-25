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
];
