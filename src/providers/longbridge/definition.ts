import type { ProviderDefinition } from "../../core/types.ts";

import { longbridgeActions, longbridgeOAuthScopes } from "./actions.ts";

const service = "longbridge";

export const provider: ProviderDefinition = {
  service,
  displayName: "Longbridge",
  categories: ["Finance", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://openapi.longbridge.com/oauth2/authorize",
      tokenUrl: "https://openapi.longbridge.com/oauth2/token",
      scopes: longbridgeOAuthScopes,
      tokenEndpointAuthMethod: "none",
      pkce: {
        method: "S256",
      },
    },
  ],
  homepageUrl: "https://longbridge.com",
  actions: longbridgeActions,
};
