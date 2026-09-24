import { googleIdentityScopes } from "../googleads/scopes.ts";

export const googleSearchConsoleReadonlyScope = "https://www.googleapis.com/auth/webmasters.readonly";
export const googleSearchConsoleFullScope = "https://www.googleapis.com/auth/webmasters";

export const googleSearchConsoleReadScopes: string[] = [googleSearchConsoleReadonlyScope];
export const googleSearchConsoleWriteScopes: string[] = [googleSearchConsoleFullScope];
export const googleSearchConsoleOAuthScopes: string[] = [
  googleSearchConsoleReadonlyScope,
  googleSearchConsoleFullScope,
  ...googleIdentityScopes,
];
