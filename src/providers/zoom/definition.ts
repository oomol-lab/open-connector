import type { ProviderDefinition } from "../../core/types.ts";

import { zoomActions } from "./actions.ts";
import { zoomProviderScopes } from "./scopes.ts";

const service = "zoom";

export const provider: ProviderDefinition = {
  service,
  displayName: "Zoom",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://zoom.us/oauth/authorize",
      tokenUrl: "https://zoom.us/oauth/token",
      refreshTokenUrl: "https://zoom.us/oauth/token",
      scopes: zoomProviderScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://www.zoom.com",
  actions: zoomActions,
};
