import type { ProviderDefinition } from "../../core/types.ts";

import { apaleoActions } from "./actions.ts";

const service = "apaleo";

export const provider: ProviderDefinition = {
  service,
  displayName: "apaleo",
  categories: ["Productivity", "Finance"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://identity.apaleo.com/connect/authorize",
      tokenUrl: "https://identity.apaleo.com/connect/token",
      scopes: ["openid", "profile", "offline_access", "setup.read", "setup.manage"],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://apaleo.com",
  actions: apaleoActions,
};
