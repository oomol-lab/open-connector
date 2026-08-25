/**
 * Feishu OAuth scopes for the user-authorized (user_access_token) provider.
 *
 * These are the Feishu Open Platform permissions used by the provider's
 * foundational document and Bitable actions. The full OAuth scope list is
 * derived from every action in `definition.ts`.
 * See https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token
 */
interface FeishuProviderScopes {
  offlineAccess: string;
  userIdRead: string;
  docxReadonly: string;
  bitableAppReadonly: string;
}

export const feishuProviderScopes: FeishuProviderScopes = {
  offlineAccess: "offline_access",
  userIdRead: "auth:user.id:read",
  docxReadonly: "docx:document:readonly",
  bitableAppReadonly: "bitable:app:readonly",
};
