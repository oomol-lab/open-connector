import { googleIdentityScopes } from "../google-oauth-scopes.ts";

export const presentationsReadonlyScope = "https://www.googleapis.com/auth/presentations.readonly";
export const presentationsScope = "https://www.googleapis.com/auth/presentations";
export const googleDriveReadonlyScope = "https://www.googleapis.com/auth/drive.readonly";
export const googleDriveFullScope = "https://www.googleapis.com/auth/drive";

export const googleSlidesReadScopes: string[] = [presentationsReadonlyScope, googleDriveReadonlyScope];
export const googleSlidesWriteScopes: string[] = [presentationsScope, googleDriveFullScope];
export const googleSlidesOAuthScopes: string[] = [
  presentationsReadonlyScope,
  presentationsScope,
  googleDriveReadonlyScope,
  googleDriveFullScope,
  ...googleIdentityScopes,
];
