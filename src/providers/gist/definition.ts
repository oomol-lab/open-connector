import type { ProviderDefinition } from "../../core/types.ts";

import { gistActions, gistOAuthScopes } from "./actions.ts";

const service = "gist";

/**
 * GitHub Gist provider backed by GitHub's REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Gist",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: gistOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "github_pat_...",
      description:
        "GitHub personal access token used with the Authorization Bearer header. Create or manage it at https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens.",
    },
  ],
  homepageUrl: "https://gist.github.com",
  actions: gistActions,
};
