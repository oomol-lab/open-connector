export const outlookProviderScopes = {
  userRead: "User.Read",
  mailReadWrite: "Mail.ReadWrite",
  mailSend: "Mail.Send",
  mailboxSettingsReadWrite: "MailboxSettings.ReadWrite",
  mailRead: "Mail.Read",
  mailReadBasic: "Mail.ReadBasic",
  mailboxSettingsRead: "MailboxSettings.Read",
  calendarsRead: "Calendars.Read",
  offlineAccess: "offline_access",
} as const;

// Reading the mailbox — the profile, the root folders, the message list and one
// message — needs Mail.Read, the read-only permission Microsoft Graph documents
// for GET /me/mailFolders and GET /me/messages (Mail.ReadWrite is its write
// superset; Mail.ReadBasic omits the body). A host that requests the read-only
// subset of the declared scopes therefore satisfies every read action.
export const outlookReadScopes: string[] = [outlookProviderScopes.userRead, outlookProviderScopes.mailRead];
export const outlookWriteScopes: string[] = [outlookProviderScopes.mailReadWrite];
export const outlookSendScopes: string[] = [outlookProviderScopes.mailSend];
export const outlookSettingsReadScopes: string[] = [outlookProviderScopes.mailboxSettingsReadWrite];
export const outlookSettingsWriteScopes: string[] = [outlookProviderScopes.mailboxSettingsReadWrite];
// The default grant (every declared scope) keeps the write permissions; the two
// read-only permissions are declared so a host may request them instead
// (requestedScopes must be a subset of this list). Calendars.Read is declared
// for a host whose read-only Microsoft app grants mail and calendar reading in
// one consent; no mail action requires it (calendar actions live on
// outlook_calendar).
export const outlookOAuthScopes: string[] = [
  outlookProviderScopes.userRead,
  outlookProviderScopes.mailRead,
  outlookProviderScopes.mailReadWrite,
  outlookProviderScopes.mailSend,
  outlookProviderScopes.mailboxSettingsReadWrite,
  outlookProviderScopes.calendarsRead,
  outlookProviderScopes.offlineAccess,
];
