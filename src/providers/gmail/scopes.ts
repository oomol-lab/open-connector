export const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
export const gmailModifyScope = "https://www.googleapis.com/auth/gmail.modify";
export const gmailComposeScope = "https://www.googleapis.com/auth/gmail.compose";
export const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";
export const gmailLabelsScope = "https://www.googleapis.com/auth/gmail.labels";
export const gmailSettingsBasicScope = "https://www.googleapis.com/auth/gmail.settings.basic";

export const gmailReadScopes: string[] = [gmailReadonlyScope];
export const gmailModifyScopes: string[] = [gmailModifyScope];
export const gmailComposeScopes: string[] = [gmailComposeScope];
export const gmailSendScopes: string[] = [gmailSendScope];
export const gmailLabelScopes: string[] = [gmailLabelsScope];
export const gmailSettingsBasicScopes: string[] = [gmailSettingsBasicScope];

/**
 * The scopes a SERVICE ACCOUNT token is minted for, and the ones the proxy
 * resolves with. Unchanged: a domain-wide-delegation grant lists these exact
 * scopes in the Workspace admin console, and a token request naming a scope the
 * admin has not authorized fails outright — so this list cannot grow without
 * breaking every existing service-account connection.
 */
export const gmailOAuthScopes: string[] = [gmailModifyScope, gmailLabelsScope, gmailSettingsBasicScope];

/**
 * Default user OAuth scopes. Together with gmailOptionalScopes, these form
 * the scopes a user OAuth authorization may request — the menu, not a minimum.
 *
 * `gmail.readonly` is here and not in {@link gmailOAuthScopes} because the two
 * lists answer different questions. That one asks "what does a service account
 * token need to cover every action"; `modify` subsumes `readonly` there, so
 * adding it would be redundant at best and, through domain-wide delegation,
 * breaking at worst.
 *
 * `filterDeclaredScopes` intersects a caller's `requestedScopes` against this
 * list and gmailOptionalScopes, so a scope absent from both cannot be requested.
 * Leaving `readonly` out therefore forced every read-only integration to
 * authorize `gmail.modify` — write, label and trash on the user's mailbox — in
 * order to call actions that declare `gmailReadScopes`. That is the opposite of
 * least privilege, and it is invisible: consent succeeds, so nothing reports
 * that more was granted than the integration can use.
 *
 * Note for anyone storing a client config WITHOUT `requestedScopes`:
 * `getEffectiveScopes` falls back to this whole list, so such a config asks
 * for the same four default scopes. `readonly` is subsumed by `modify`, so no
 * new capability is granted — but the consent screen gains a line, and a
 * deployment that wants the narrow set should say so explicitly with
 * `requestedScopes`, which is the correct posture regardless.
 */
export const gmailAuthorizableScopes: string[] = [
  gmailReadonlyScope,
  gmailModifyScope,
  gmailLabelsScope,
  gmailSettingsBasicScope,
];

/** Narrow compose and send grants, available only through requestedScopes. */
export const gmailOptionalScopes: string[] = [gmailComposeScope, gmailSendScope];
