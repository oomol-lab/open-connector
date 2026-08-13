export const webflowSitesReadScope = "sites:read";
export const webflowSitesWriteScope = "sites:write";
export const webflowCmsReadScope = "cms:read";
export const webflowCmsWriteScope = "cms:write";
export const webflowAuthorizedUserReadScope = "authorized_user:read";

/** Scopes needed by every runnable Webflow action exposed by this provider. */
export const webflowOAuthScopes: string[] = [
  webflowSitesReadScope,
  webflowSitesWriteScope,
  webflowCmsReadScope,
  webflowCmsWriteScope,
  webflowAuthorizedUserReadScope,
];
