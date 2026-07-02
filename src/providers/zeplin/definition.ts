import type { ProviderDefinition } from "../../core/types.ts";

import { zeplinActions } from "./actions.ts";
import { zeplinProviderScopes } from "./scopes.ts";

const service = "zeplin";

export const provider: ProviderDefinition = {
  service,
  displayName: "Zeplin",
  categories: ["Design & Media", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.zeplin.dev/v1/oauth/authorize",
      tokenUrl: "https://api.zeplin.dev/v1/oauth/token",
      scopes: zeplinProviderScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://zeplin.io",
  actions: zeplinActions,
};
