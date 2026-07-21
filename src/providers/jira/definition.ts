import type { ProviderDefinition } from "../../core/types.ts";

import { jiraActions } from "./actions.ts";
import { jiraOAuthScopes } from "./scopes.ts";

const service = "jira";

/**
 * Jira provider backed by Jira Cloud OAuth 2.0 and Jira Data Center personal access tokens.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Jira",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: jiraOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
      authorizationParams: {
        audience: "api.atlassian.com",
        prompt: "consent",
      },
    },
    {
      type: "custom_credential",
      fields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://jira.example.com",
          description:
            "Jira Data Center or Server instance root URL (a deployment context path is supported), without an API endpoint path. Public addresses work by default; private targets (RFC 1918, Tailscale, NetBird, private hostnames) require the self-hosted runtime to enable OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK. Unsafe local, reserved, and cloud-metadata targets always remain blocked.",
        },
        {
          key: "personalAccessToken",
          label: "Personal access token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "JIRA_PAT",
          description: "Jira Data Center or Server personal access token.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.atlassian.com/software/jira",
  actions: jiraActions,
};
