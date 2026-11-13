import type { ProviderDefinition } from "../../core/types.ts";

import { calActions, calProviderScopes } from "./actions.ts";

const service = "cal";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cal.com",
  categories: ["Productivity", "Communication"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["PROFILE_READ"],
      authorizationUrl: "https://app.cal.com/auth/oauth2/authorize",
      tokenUrl: "https://api.cal.com/v2/auth/oauth2/token",
      scopes: calProviderScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
    },
  ],
  homepageUrl: "https://cal.com",
  actions: calActions,
};
