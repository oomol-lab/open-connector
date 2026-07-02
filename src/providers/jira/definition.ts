import type { ProviderDefinition } from "../../core/types.ts";

import { jiraActions } from "./actions.ts";
import { jiraOAuthScopes } from "./scopes.ts";

const service = "jira";

/**
 * Jira provider backed by Atlassian OAuth 2.0 and Jira Cloud REST API v3.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Jira",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["oauth2"],
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
  ],
  homepageUrl: "https://www.atlassian.com/software/jira",
  actions: jiraActions,
};
