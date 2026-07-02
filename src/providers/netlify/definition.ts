import type { ProviderDefinition } from "../../core/types.ts";

import { netlifyActions, netlifyConnectorScopes } from "./actions.ts";

const service = "netlify";

/**
 * Netlify provider backed by the Netlify API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Netlify",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://app.netlify.com/authorize",
      tokenUrl: "https://api.netlify.com/oauth/token",
      scopes: [...netlifyConnectorScopes],
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal access token",
      placeholder: "nfp_...",
      description:
        "Netlify personal access token used with the Authorization Bearer header. Create or manage tokens from User settings under Applications > Personal access tokens.",
    },
  ],
  homepageUrl: "https://www.netlify.com",
  actions: netlifyActions,
};
