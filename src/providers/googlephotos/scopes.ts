import { googleIdentityScopes } from "../google-oauth-scopes.ts";

export const photosReadonlyAppCreatedScope = "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata";
export const photosAppendonlyScope = "https://www.googleapis.com/auth/photoslibrary.appendonly";
export const photosEditAppCreatedScope = "https://www.googleapis.com/auth/photoslibrary.edit.appcreateddata";
export const photosPickerReadonlyScope = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export const googlePhotosOAuthScopes: string[] = [
  photosReadonlyAppCreatedScope,
  photosAppendonlyScope,
  photosEditAppCreatedScope,
  photosPickerReadonlyScope,
  ...googleIdentityScopes,
];
