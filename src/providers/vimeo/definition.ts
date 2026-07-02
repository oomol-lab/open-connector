import type { ProviderDefinition } from "../../core/types.ts";

import { vimeoActions } from "./actions.ts";
import { vimeoProviderScopes } from "./scopes.ts";

const service = "vimeo";

export const provider: ProviderDefinition = {
  service,
  displayName: "Vimeo",
  categories: ["Design & Media", "Social"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.vimeo.com/oauth/authorize",
      tokenUrl: "https://api.vimeo.com/oauth/access_token",
      refreshTokenUrl: "https://api.vimeo.com/oauth/access_token",
      scopes: vimeoProviderScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
      tokenRequestFormat: "json",
    },
  ],
  homepageUrl: "https://vimeo.com",
  actions: vimeoActions,
};
