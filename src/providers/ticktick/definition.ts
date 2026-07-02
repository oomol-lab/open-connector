import type { ProviderDefinition } from "../../core/types.ts";

import { ticktickActions } from "./actions.ts";

const service = "ticktick";

export const provider: ProviderDefinition = {
  service,
  displayName: "TickTick",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://ticktick.com/oauth/authorize",
      tokenUrl: "https://ticktick.com/oauth/token",
      scopes: ["tasks:read", "tasks:write"],
      tokenEndpointAuthMethod: "client_secret_basic",
    },
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "ticktick_access_token",
      description: "Paste a TickTick OAuth access token. It is sent with the Authorization Bearer header.",
    },
  ],
  homepageUrl: "https://ticktick.com",
  actions: ticktickActions,
};
