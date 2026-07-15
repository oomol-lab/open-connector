import type { ProviderDefinition } from "../../core/types.ts";

import { feishuActions } from "./actions.ts";
import { feishuOAuthScopes } from "./scopes.ts";

const service = "feishu";

/**
 * Feishu provider backed by the user_access_token, so an agent reads the
 * authorized user's own Feishu resources without a bot being added to them.
 * Uses a user-provided Feishu custom app and the OAuth authorization-code flow.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Feishu",
  categories: ["Productivity", "Storage"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.feishu.cn/open-apis/authen/v1/authorize",
      tokenUrl: "https://open.feishu.cn/open-apis/authen/v2/oauth/token",
      scopes: feishuOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      // Feishu's v2 token endpoint requires an application/json body; the
      // framework otherwise defaults to form encoding and the exchange fails.
      tokenRequestFormat: "json",
    },
  ],
  homepageUrl: "https://www.feishu.cn",
  actions: feishuActions,
};
