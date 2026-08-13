import type { ProviderDefinition } from "../../core/types.ts";

import { miroActions } from "./actions.ts";
import { miroOAuthScopes } from "./scopes.ts";

const service = "miro";

/**
 * Miro provider backed by the public Miro REST API v2.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Miro",
  description: "Read Miro boards and create lightweight board content.",
  categories: ["Design", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://miro.com/oauth/authorize",
      tokenUrl: "https://api.miro.com/v1/oauth/token",
      scopes: miroOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "form",
      authorizationRequestFields: {
        scope: false,
      },
    },
  ],
  homepageUrl: "https://miro.com",
  iconUrl: "/provider-icons/miro.svg",
  actions: miroActions,
};
