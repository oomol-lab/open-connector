import type { ProviderDefinition } from "../../core/types.ts";

import { slackActions } from "./actions.ts";
import { slackOAuthScopes } from "./scopes.ts";

const service = "slack";

/**
 * Slack provider backed by the Slack Web API and a user-provided Slack OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Slack",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: slackOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://slack.com",
  actions: slackActions,
};
