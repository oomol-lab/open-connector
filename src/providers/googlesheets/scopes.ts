import { googleIdentityScopes } from "../googleads/scopes.ts";

export const googleSheetsReadonlyScope = "https://www.googleapis.com/auth/spreadsheets.readonly";
export const googleSheetsFullScope = "https://www.googleapis.com/auth/spreadsheets";
export const googleDriveReadonlyScope = "https://www.googleapis.com/auth/drive.readonly";
export const googleDriveFullScope = "https://www.googleapis.com/auth/drive";

export const googlesheetsReadScopes: string[] = [googleSheetsReadonlyScope, googleDriveReadonlyScope];
export const googlesheetsWriteScopes: string[] = [googleSheetsFullScope, googleDriveFullScope];
export const googlesheetsOAuthScopes: string[] = [
  googleSheetsReadonlyScope,
  googleSheetsFullScope,
  googleDriveReadonlyScope,
  googleDriveFullScope,
  ...googleIdentityScopes,
];
