import { googleIdentityScopes } from "../google-oauth-scopes.ts";

export const googleAdsScope = "https://www.googleapis.com/auth/adwords";

export const googleAdsOAuthScopes: string[] = [googleAdsScope, ...googleIdentityScopes];
