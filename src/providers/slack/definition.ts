import type { OAuthAuthorizationOption, ProviderDefinition } from "../../core/types.ts";

import { slackActions } from "./actions.ts";
import { slackUserOAuthScopes } from "./scopes.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-message-posted.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "slack";
const slackAuthorizationOptions: OAuthAuthorizationOption[] = [
  {
    id: "search:read.public",
    label: "Search public channels",
    description: "Available to internal apps and apps listed in the Slack Marketplace.",
    risk: "sensitive",
  },
  {
    id: "search:read.private",
    label: "Search private channels",
    description: "Search messages in private channels you can access. Requires your consent in Slack.",
    risk: "sensitive",
  },
];

/**
 * User-authorized Slack provider backed by the Slack Web API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Slack",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["channels:read"],
      authorizationUrl: "https://slack.com/oauth/v2_user/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.user.access",
      refreshTokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: slackUserOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationOptions: slackAuthorizationOptions,
    },
    {
      type: "api_key",
      label: "Access token",
      placeholder: "xoxb-... or xoxp-...",
      description:
        "Slack bot or user token used with the Authorization Bearer header. Create a Slack app, install it to the workspace, then copy the bot token or user token from OAuth & Permissions.",
    },
  ],
  homepageUrl: "https://slack.com",
  actions: slackActions,
  triggers: [triggerSnapshot0_0],
  triggerPermissions,
};
