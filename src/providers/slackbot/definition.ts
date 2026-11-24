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
  description:
    "Slack as your workspace's app bot: posts, replies and sends DMs as the bot, and receives mentions and events. It cannot search messages; use Slack for that.",
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
      clientConfigFields: [
        {
          key: "appId",
          label: "Slack App ID",
          inputType: "text",
          required: false,
          secret: false,
          description:
            "Optional for event verification. Configure the deployment-default Slack App ID (A...); connection-specific values are not used by the verification endpoint.",
        },
        {
          key: "signingSecret",
          label: "Slack Signing Secret",
          inputType: "password",
          required: false,
          secret: true,
          location: "secretExtra",
          description:
            "Optional for event verification, not OAuth authorization. The verification endpoint uses this secret from the deployment-default app configuration, not individual connections.",
        },
      ],
    },
  ],
  homepageUrl: "https://slack.com",
  actions: slackbotActions,
};
