export const googleAnalyticsReadonlyScope = "https://www.googleapis.com/auth/analytics.readonly";
export const googleAnalyticsEditScope = "https://www.googleapis.com/auth/analytics.edit";

export const googleAnalyticsReadScopes: string[] = [googleAnalyticsReadonlyScope];
export const googleAnalyticsWriteScopes: string[] = [googleAnalyticsEditScope];
export const googleAnalyticsOAuthScopes: string[] = [googleAnalyticsReadonlyScope, googleAnalyticsEditScope];
