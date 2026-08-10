/**
 * Scopes requested for OAuth connections. Figma does not let public OAuth apps
 * call the projects endpoints, so the projects scopes stay out of the
 * authorization request to keep it publishable:
 * https://developers.figma.com/docs/rest-api/projects-endpoints/
 * Private OAuth app users who need the projects actions must connect with a
 * personal access token instead.
 */
export const figmaPublicOAuthScopes: string[] = [
  "current_user:read",
  "file_metadata:read",
  "file_content:read",
  "file_versions:read",
  "file_comments:read",
  "file_comments:write",
  "library_content:read",
  "library_assets:read",
  "file_dev_resources:read",
  "file_dev_resources:write",
];

export const figmaPersonalAccessTokenScopes: string[] = [
  ...figmaPublicOAuthScopes,
  "projects:read",
  "project_metadata:read",
];
