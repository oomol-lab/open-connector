import type { ProviderDefinition } from "../../core/types.ts";

import { helpscoutActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "helpscout",
  displayName: "Help Scout",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://secure.helpscout.net/authentication/authorizeClientApplication",
      tokenUrl: "https://api.helpscout.net/v2/oauth2/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://www.helpscout.com",
  actions: helpscoutActions,
};
