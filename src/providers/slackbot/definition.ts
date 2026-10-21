import type { ProviderDefinition } from "../../core/types.ts";

import { slackBotOAuthScopes } from "../slack/scopes.ts";
import { slackbotActions } from "./actions.ts";
import { snapshot } from "./trigger-on-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "slackbot";

/**
 * Bot-authorized Slack provider backed by the Slack Web API.
 */
export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Slack Bot",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: slackBotOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://slack.com",
  actions: slackbotActions,
};
