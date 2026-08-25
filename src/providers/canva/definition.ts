import type { ProviderDefinition } from "../../core/types.ts";

import { canvaActions, canvaOAuthScopes } from "./actions.ts";

const service = "canva";

export const provider: ProviderDefinition = {
  service,
  displayName: "Canva",
  categories: ["Design & Media", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://www.canva.com/api/oauth/authorize",
      tokenUrl: "https://api.canva.com/rest/v1/oauth/token",
      scopes: canvaOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
      pkce: {
        method: "S256",
      },
    },
  ],
  homepageUrl: "https://www.canva.com",
  actions: canvaActions,
};
