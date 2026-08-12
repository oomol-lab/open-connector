import type { ProviderDefinition } from "../../core/types.ts";

import { esaActions } from "./actions.ts";
import { esaOAuthScopes } from "./scopes.ts";

const service = "esa";

/**
 * esa provider backed by the public esa API v1.
 *
 * Open-source users can connect with either a personal access token or their
 * own esa OAuth app configured with the local runtime callback URL.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "esa",
  description: "Search, read, and manage esa team knowledge through the public esa API.",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.esa.io/oauth/authorize",
      tokenUrl: "https://api.esa.io/oauth/token",
      scopes: esaOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
    },
    {
      type: "api_key",
      label: "Personal access token",
      placeholder: "ep2_...",
      description:
        "esa PAT v2 used with the Authorization Bearer header. Connection validation requires read:user; actions require their corresponding PAT v2 resource scopes. To restrict accessible teams, configure the token and API access policy in esa.",
    },
  ],
  homepageUrl: "https://esa.io",
  actions: esaActions,
};
