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

/** Default OAuth access covers reading, composing, sending and mailbox management. */
export const gmailAuthorizableScopes: string[] = [
  gmailReadonlyScope,
  gmailModifyScope,
  gmailLabelsScope,
  gmailSettingsBasicScope,
];
