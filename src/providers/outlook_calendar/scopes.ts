const outlookCalendarProviderScopes = {
  userRead: "User.Read",
  calendarsReadWrite: "Calendars.ReadWrite",
  calendarsReadWriteShared: "Calendars.ReadWrite.Shared",
  offlineAccess: "offline_access",
};

export const outlookCalendarProfileScopes: string[] = [outlookCalendarProviderScopes.userRead];
export const outlookCalendarScopes: string[] = [outlookCalendarProviderScopes.calendarsReadWrite];
export const outlookCalendarSharedScopes: string[] = [outlookCalendarProviderScopes.calendarsReadWriteShared];
export const outlookCalendarOAuthScopes: string[] = [
  outlookCalendarProviderScopes.userRead,
  outlookCalendarProviderScopes.calendarsReadWrite,
  outlookCalendarProviderScopes.calendarsReadWriteShared,
  outlookCalendarProviderScopes.offlineAccess,
];
