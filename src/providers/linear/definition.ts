import type { ProviderDefinition } from "../../core/types.ts";

import { linearActions } from "./actions.ts";
import { linearOAuthScopes } from "./scopes.ts";

const service = "linear";

/**
 * Linear provider backed by the Linear GraphQL API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Linear",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://linear.app/oauth/authorize",
      tokenUrl: "https://api.linear.app/oauth/token",
      scopes: linearOAuthScopes,
      scopeSeparator: ",",
      // Public client: Linear documents client_secret as optional for a PKCE exchange and for
      // refreshing PKCE-issued tokens, so no secret ships with the app.
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationParams: {},
    },
    {
      type: "api_key",
      label: "Personal API Key",
      description:
        "Linear personal API key sent as the raw Authorization header value. Create or revoke it from Settings > Account > Security & Access.",
      placeholder: "lin_api_...",
      extraFields: [],
    },
  ],
  homepageUrl: "https://linear.app",
  actions: linearActions,
};
