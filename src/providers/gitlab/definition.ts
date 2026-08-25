import type { ProviderDefinition } from "../../core/types.ts";

import { gitlabActions } from "./actions.ts";
import { gitlabOAuthScopes } from "./scopes.ts";

const service = "gitlab";
const defaultGitlabInstanceUrl = "https://gitlab.com";

/**
 * GitLab provider backed by the GitLab REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "GitLab",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "{+instanceUrl}/oauth/authorize",
      tokenUrl: "{+instanceUrl}/oauth/token",
      scopes: gitlabOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: {
        method: "S256",
      },
      clientConfigFields: [
        {
          key: "instanceUrl",
          label: "GitLab instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: defaultGitlabInstanceUrl,
          description: "GitLab.com or the public base URL of a self-managed GitLab instance.",
          defaultValue: defaultGitlabInstanceUrl,
        },
      ],
    },
    {
      type: "api_key",
      label: "Personal access token",
      placeholder: "glpat-xxxxxxxxxxxxxxxxxxxx",
      description:
        "GitLab personal access token sent with the Authorization Bearer header. Create one in GitLab user preferences under Access tokens.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://gitlab.example.com",
          description:
            "Optional base URL of a self-hosted GitLab instance, without the /api/v4 path. Leave empty for GitLab.com. Private/overlay targets (RFC 1918, Tailscale, NetBird, private hostnames) require the self-hosted runtime to enable OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK.",
        },
      ],
    },
  ],
  homepageUrl: "https://gitlab.com",
  actions: gitlabActions,
};
