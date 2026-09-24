import { googleIdentityScopes } from "../google-oauth-scopes.ts";

export const googleMeetSpaceCreatedScope = "https://www.googleapis.com/auth/meetings.space.created";
export const googleMeetSpaceReadonlyScope = "https://www.googleapis.com/auth/meetings.space.readonly";
export const googleMeetSpaceSettingsScope = "https://www.googleapis.com/auth/meetings.space.settings";

export const googleMeetCreateScopes: string[] = [googleMeetSpaceCreatedScope];
export const googleMeetReadScopes: string[] = [googleMeetSpaceReadonlyScope];
export const googleMeetSettingsScopes: string[] = [googleMeetSpaceSettingsScope];

export const googleMeetOAuthScopes: string[] = [
  googleMeetSpaceCreatedScope,
  googleMeetSpaceReadonlyScope,
  googleMeetSpaceSettingsScope,
  ...googleIdentityScopes,
];
