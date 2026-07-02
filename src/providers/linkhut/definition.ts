import type { ProviderDefinition } from "../../core/types.ts";

import { linkhutActions, linkhutOAuthScopes } from "./actions.ts";

const service = "linkhut";

export const provider: ProviderDefinition = {
  service,
  displayName: "Linkhut",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://ln.ht/_/oauth/authorize",
      tokenUrl: "https://api.ln.ht/v1/oauth/token",
      scopes: linkhutOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://ln.ht",
  actions: linkhutActions,
};
