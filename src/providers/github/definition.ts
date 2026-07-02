import type { ProviderDefinition } from "../../core/types.ts";

import { githubActions } from "./actions.ts";
import { githubOAuthScopes } from "./scopes.ts";

const service = "github";

/**
 * GitHub provider backed by the GitHub REST API.
 *
 * Open-source users can either configure a personal access token or bring
 * their own GitHub OAuth app with localhost callback support.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "GitHub",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: githubOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal access token",
      placeholder: "github_pat_...",
      description:
        "GitHub personal access token used with the Authorization Bearer header. Fine-grained tokens are recommended.",
    },
  ],
  homepageUrl: "https://github.com",
  actions: githubActions,
};
