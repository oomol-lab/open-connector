export const googleMeetSpaceCreatedScope = "https://www.googleapis.com/auth/meetings.space.created";
export const googleMeetSpaceReadonlyScope = "https://www.googleapis.com/auth/meetings.space.readonly";
export const googleMeetSpaceSettingsScope = "https://www.googleapis.com/auth/meetings.space.settings";
export const googleOpenIdScope = "openid";
export const googleEmailScope = "email";
export const googleProfileScope = "profile";

export const googleMeetCreateScopes: string[] = [googleMeetSpaceCreatedScope];
export const googleMeetReadScopes: string[] = [googleMeetSpaceReadonlyScope];
export const googleMeetSettingsScopes: string[] = [googleMeetSpaceSettingsScope];

export const googleMeetOAuthScopes: string[] = [
  googleMeetSpaceCreatedScope,
  googleMeetSpaceReadonlyScope,
  googleMeetSpaceSettingsScope,
  googleOpenIdScope,
  googleEmailScope,
  googleProfileScope,
];
