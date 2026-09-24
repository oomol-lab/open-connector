export const googleAdsScope = "https://www.googleapis.com/auth/adwords";
export const googleIdentityScopes: string[] = ["openid", "email", "profile"];

export const googleAdsOAuthScopes: string[] = [googleAdsScope, ...googleIdentityScopes];
