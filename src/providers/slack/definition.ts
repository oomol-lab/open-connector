import type { OAuthAuthorizationOption, ProviderDefinition } from "../../core/types.ts";

import { slackActions } from "./actions.ts";

const service = "slack";
const slackAuthorizationOptions: OAuthAuthorizationOption[] = [
  {
    id: "channels:read",
    label: "Public channels",
    description: "List public Slack channels and read their metadata.",
    required: true,
    defaultSelected: true,
    risk: "standard",
  },
  {
    id: "channels:history",
    label: "Public channel messages",
    description: "Read message history in public Slack channels.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
    requires: ["channels:read"],
  },
  {
    id: "groups:read",
    label: "Private channels",
    description: "List private channels that the connected user can access.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "groups:history",
    label: "Private channel messages",
    description: "Read message history in private Slack channels.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
    requires: ["groups:read"],
  },
  {
    id: "users:read",
    label: "User directory",
    description: "Read Slack user profiles and directory information.",
    required: false,
    defaultSelected: true,
    risk: "standard",
  },
  {
    id: "im:read",
    label: "Direct messages",
    description: "Read direct-message conversation metadata.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "im:history",
    label: "Direct message history",
    description: "Read direct-message history.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
    requires: ["im:read"],
  },
  {
    id: "mpim:read",
    label: "Group direct messages",
    description: "Read group direct-message conversation metadata.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "mpim:history",
    label: "Group direct message history",
    description: "Read group direct-message history.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
    requires: ["mpim:read"],
  },
  {
    id: "files:read",
    label: "Files",
    description: "Read files shared in Slack.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "reactions:read",
    label: "Reactions",
    description: "Read reactions on Slack messages.",
    required: false,
    defaultSelected: true,
    risk: "standard",
  },
  {
    id: "chat:write",
    label: "Send messages",
    description: "Send messages as the connected Slack user.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "im:write",
    label: "Send direct messages",
    description: "Send direct messages as the connected Slack user.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
    requires: ["im:read"],
  },
  {
    id: "files:write",
    label: "Upload files",
    description: "Upload files to Slack.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "reactions:write",
    label: "Manage reactions",
    description: "Add and remove reactions on Slack messages.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "search:read",
    label: "Legacy message search",
    description: "Search messages with Slack's legacy search API.",
    required: false,
    defaultSelected: true,
    risk: "sensitive",
  },
  {
    id: "search:read.public",
    label: "Public message search",
    description: "Search public-channel messages with Slack Real-time Search.",
    required: false,
    defaultSelected: false,
    risk: "sensitive",
  },
  {
    id: "search:read.private",
    label: "Private message search",
    description: "Search private-channel messages with Slack Real-time Search.",
    required: false,
    defaultSelected: false,
    risk: "sensitive",
    requires: ["search:read.public"],
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
      authorizationUrl: "https://slack.com/oauth/v2_user/authorize",
      // A public client: the user-token exchange AND the refresh ride
      // oauth.v2.user.access with PKCE and no client secret (Slack app with
      // token rotation on; no refreshTokenUrl, so refresh uses tokenUrl).
      tokenUrl: "https://slack.com/api/oauth.v2.user.access",
      scopes: slackAuthorizationOptions.map((option) => option.id),
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
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
};
