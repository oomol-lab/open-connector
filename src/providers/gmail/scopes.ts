export const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
export const gmailModifyScope = "https://www.googleapis.com/auth/gmail.modify";
export const gmailComposeScope = "https://www.googleapis.com/auth/gmail.compose";
export const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";
export const gmailLabelsScope = "https://www.googleapis.com/auth/gmail.labels";
export const gmailSettingsBasicScope = "https://www.googleapis.com/auth/gmail.settings.basic";
export const gmailSettingsSharingScope = "https://www.googleapis.com/auth/gmail.settings.sharing";

export const gmailReadScopes: string[] = [gmailReadonlyScope];
export const gmailModifyScopes: string[] = [gmailModifyScope];
export const gmailComposeScopes: string[] = [gmailComposeScope];
export const gmailSendScopes: string[] = [gmailSendScope];
export const gmailLabelScopes: string[] = [gmailLabelsScope];
export const gmailSettingsBasicScopes: string[] = [gmailSettingsBasicScope];
export const gmailSettingsSharingScopes: string[] = [gmailSettingsSharingScope];

export const gmailOAuthScopes: string[] = [
  gmailReadonlyScope,
  gmailModifyScope,
  gmailComposeScope,
  gmailSendScope,
  gmailLabelsScope,
  gmailSettingsBasicScope,
  gmailSettingsSharingScope,
];
