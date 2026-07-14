import type { ProviderDefinition } from "../../core/types.ts";

import { tailscaleActions, tailscaleDeviceReadScope } from "./actions.ts";

const service = "tailscale";

export const provider: ProviderDefinition = {
  service,
  displayName: "Tailscale",
  description: "Manage devices in a Tailscale tailnet through the official REST API.",
  categories: ["Security", "Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      flow: "client_credentials",
      tokenUrl: "https://api.tailscale.com/api/v2/oauth/token",
      scopes: [tailscaleDeviceReadScope],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://tailscale.com",
  actions: tailscaleActions,
};
