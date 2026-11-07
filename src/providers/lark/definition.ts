import type { ProviderDefinition } from "../../core/types.ts";

import { feishuOAuthScopesFor } from "../feishu/actions.ts";
import { larkActions } from "./actions.ts";

const service = "lark";

/**
 * Lark provider: Feishu's international deployment.
 *
 * Lark serves the same Open Platform API as Feishu, but from its own hosts
 * and with a separate app registry, so a Lark custom app and its tokens only
 * work against open.larksuite.com. Every action reuses the Feishu
 * implementation; only the auth endpoints here and the API base (see
 * feishu/shared/cloud.ts) differ.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Lark",
  categories: ["Communication", "Productivity", "Storage"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
      tokenUrl: "https://open.larksuite.com/open-apis/authen/v2/oauth/token",
      scopes: feishuOAuthScopesFor(larkActions),
      tokenEndpointAuthMethod: "client_secret_post",
      // Same v2 token endpoint as Feishu: it requires an application/json body.
      tokenRequestFormat: "json",
    },
  ],
  homepageUrl: "https://www.larksuite.com",
  actions: larkActions,
};
