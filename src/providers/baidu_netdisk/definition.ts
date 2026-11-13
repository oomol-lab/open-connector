import type { ProviderDefinition } from "../../core/types.ts";

import { baiduNetdiskActions } from "./actions.ts";

export const baiduNetdiskOAuthScopes: string[] = ["basic", "netdisk"];

export const provider: ProviderDefinition = {
  service: "baidu_netdisk",
  displayName: "Baidu Netdisk",
  categories: ["Storage", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["basic", "netdisk"],
      authorizationUrl: "https://openapi.baidu.com/oauth/2.0/authorize",
      tokenUrl: "https://openapi.baidu.com/oauth/2.0/token",
      scopes: baiduNetdiskOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFields: { clientId: "client_id", clientSecret: "client_secret" },
    },
  ],
  homepageUrl: "https://pan.baidu.com",
  actions: baiduNetdiskActions,
};
