import type { ProviderDefinition } from "../../core/types.ts";

import { canvaOAuthScopes, createCanvaActions } from "../canva/actions.ts";

const service = "canva_cn";

/**
 * Canva China uses a separate OAuth application and regional API endpoints
 * from the international Canva platform.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Canva China",
  categories: ["Design & Media", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://www.canva.cn/api/oauth/authorize",
      tokenUrl: "https://api.canva.cn/rest/v1/oauth/token",
      scopes: canvaOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
      pkce: {
        method: "S256",
      },
    },
  ],
  homepageUrl: "https://www.canva.cn",
  actions: createCanvaActions(service),
};
