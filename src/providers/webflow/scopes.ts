export const webflowSitesReadScope = "sites:read";
export const webflowSitesWriteScope = "sites:write";
export const webflowCmsReadScope = "cms:read";
export const webflowCmsWriteScope = "cms:write";

/** Scopes needed by every runnable Webflow action exposed by this provider. */
export const webflowOAuthScopes: string[] = [
  webflowSitesReadScope,
  webflowSitesWriteScope,
  webflowCmsReadScope,
  webflowCmsWriteScope,
];
