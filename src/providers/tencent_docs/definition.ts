import type { ProviderDefinition } from "../../core/types.ts";

import { tencentDocsActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "tencent_docs",
  displayName: "Tencent Docs",
  description:
    "Tencent Docs access depends on the permissions approved for your app. Reauthorize after changing the app permissions.",
  categories: ["Productivity", "Storage"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://docs.qq.com/oauth/v2/authorize",
      tokenUrl: "https://docs.qq.com/oauth/v2/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationRequestFields: {
        scope: false,
      },
      authorizationParams: {
        scope: "all",
      },
    },
  ],
  homepageUrl: "https://docs.qq.com",
  actions: tencentDocsActions,
};
