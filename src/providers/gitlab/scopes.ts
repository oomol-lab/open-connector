export const gitlabApiScope = "api";
export const gitlabReadApiScope = "read_api";

/** Full API access is needed because this provider includes issue creation. */
export const gitlabOAuthScopes: string[] = [gitlabApiScope];
