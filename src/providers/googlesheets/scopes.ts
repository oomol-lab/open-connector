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

const googleDriveFileScope = "https://www.googleapis.com/auth/drive.file";

/**
 * Scopes a client config may request beyond {@link googlesheetsOAuthScopes}; none joins a consent
 * unless named. `drive.file` is Google's non-sensitive scope for the files that a user creates with
 * the app or selects for it in the Google Picker. The Sheets API accepts it for those spreadsheets,
 * so a host whose users select each spreadsheet can leave the sensitive `spreadsheets` scope and the
 * restricted Drive scopes out of its consent. Actions on other spreadsheets fail upstream with the
 * Google API error. The service-account mint list stays {@link googlesheetsOAuthScopes}.
 */
export const googlesheetsOptionalScopes: string[] = [googleDriveFileScope];
