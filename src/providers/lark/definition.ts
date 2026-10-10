import type { ProviderDefinition } from "../../core/types.ts";

import { larkActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "lark",
  displayName: "Lark",
  categories: ["Communication", "Productivity", "Storage"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.larksuite.com/open-apis/authen/v1/authorize",
      tokenUrl: "https://open.larksuite.com/open-apis/authen/v2/oauth/token",
      scopes: ["offline_access", ...new Set(larkActions.flatMap((action) => action.providerPermissions))],
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
    },
  ],
  homepageUrl: "https://www.larksuite.com",
  actions: larkActions,
};
