import type { OAuthAuthorizationOption, ProviderDefinition } from "../../core/types.ts";

import { slackActions } from "./actions.ts";
import { slackUserOAuthScopes } from "./scopes.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-message-posted.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "slack";
const slackAuthorizationOptions: OAuthAuthorizationOption[] = [
  {
    id: "channels:read",
    label: "Public channels",
    description: "List public Slack channels and read their metadata.",
    risk: "standard",
  },
  {
    id: "channels:history",
    label: "Public channel messages",
    description: "Read message history in public Slack channels.",
    risk: "sensitive",
  },
  {
    id: "groups:read",
    label: "Private channels",
    description: "List private channels that the connected user can access.",
    risk: "sensitive",
  },
  {
    id: "groups:history",
    label: "Private channel messages",
    description: "Read message history in private Slack channels.",
    risk: "sensitive",
  },
  {
    id: "users:read",
    label: "User directory",
    description: "Read Slack user profiles and directory information.",
    risk: "standard",
  },
  {
    id: "im:read",
    label: "Direct messages",
    description: "Read direct-message conversation metadata.",
    risk: "sensitive",
  },
  {
    id: "im:history",
    label: "Direct message history",
    description: "Read direct-message history.",
    risk: "sensitive",
  },
  {
    id: "mpim:read",
    label: "Group direct messages",
    description: "Read group direct-message conversation metadata.",
    risk: "sensitive",
  },
  {
    id: "mpim:history",
    label: "Group direct message history",
    description: "Read group direct-message history.",
    risk: "sensitive",
  },
  {
    id: "files:read",
    label: "Files",
    description: "Read files shared in Slack.",
    risk: "sensitive",
  },
  {
    id: "reactions:read",
    label: "Reactions",
    description: "Read reactions on Slack messages.",
    risk: "standard",
  },
  {
    id: "chat:write",
    label: "Send messages",
    description: "Send messages as the connected Slack user.",
    risk: "sensitive",
  },
  {
    id: "im:write",
    label: "Send direct messages",
    description: "Send direct messages as the connected Slack user.",
    risk: "sensitive",
  },
  {
    id: "files:write",
    label: "Upload files",
    description: "Upload files to Slack.",
    risk: "sensitive",
  },
  {
    id: "reactions:write",
    label: "Manage reactions",
    description: "Add and remove reactions on Slack messages.",
    risk: "sensitive",
  },
  {
    id: "search:read",
    label: "Legacy message search",
    description: "Search messages with Slack's legacy search API.",
    risk: "sensitive",
  },
  {
    id: "search:read.public",
    label: "Public message search",
    description: "Search public-channel messages with Slack Real-time Search.",
    risk: "sensitive",
  },
  {
    id: "search:read.private",
    label: "Private message search",
    description: "Search private-channel messages with Slack Real-time Search.",
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
