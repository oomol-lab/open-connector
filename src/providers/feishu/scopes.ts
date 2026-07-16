/**
 * Feishu OAuth scopes for the user-authorized (user_access_token) provider.
 *
 * These are Feishu Open Platform permission identifiers requested during the
 * OAuth consent. The connector reads a user's own resources, so it requests
 * read-only document and Bitable scopes plus offline access for token refresh.
 * See https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token
 */
export const feishuProviderScopes = {
  offlineAccess: "offline_access",
  docxReadonly: "docx:document:readonly",
  bitableAppReadonly: "bitable:app:readonly",
} as const;

export const feishuOAuthScopes: string[] = [
  feishuProviderScopes.offlineAccess,
  feishuProviderScopes.docxReadonly,
  feishuProviderScopes.bitableAppReadonly,
];
