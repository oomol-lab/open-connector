import type { ProviderDefinition } from "../../core/types.ts";

import { discordActions } from "./actions.ts";

const discordScopes = [
  "identify",
  "email",
  "guilds",
  "guilds.members.read",
  "connections",
  "applications.entitlements",
  "role_connections.write",
  "openid",
];

export const provider: ProviderDefinition = {
  service: "discord",
  displayName: "Discord",
  description:
    "Discord as the signed-in user: reads their profile, servers and linked accounts. It cannot send messages; to post in or manage a server, use Discord Bot.",
  categories: ["Communication", "Social"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["identify"],
      authorizationUrl: "https://discord.com/oauth2/authorize",
      tokenUrl: "https://discord.com/api/oauth2/token",
      scopes: discordScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://discord.com",
  actions: discordActions,
};
