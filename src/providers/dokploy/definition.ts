import type { ProviderDefinition } from "../../core/types.ts";

import { dokployActions } from "./actions.ts";

const service = "dokploy";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dokploy",
  description: "Manage infrastructure, services, deployments, access, and settings on a self-hosted Dokploy instance.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Enter your Dokploy API key",
      description:
        "An API key created from the Dokploy dashboard under Settings > API Keys. The key is sent in the x-api-key header.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://dokploy.example.com",
          description:
            "The HTTP or HTTPS URL of your Dokploy instance, without an API endpoint path. Private-network targets require Allow Private Network to be enabled. See https://docs.dokploy.com/docs/core/api.",
        },
        {
          key: "allowPrivateNetwork",
          label: "Allow Private Network",
          inputType: "checkbox",
          required: false,
          secret: false,
          description:
            "Set to true only for a trusted self-hosted Dokploy instance on an RFC 1918, Tailscale, or NetBird network. Loopback, link-local, reserved, multicast, and IPv6 targets remain blocked.",
        },
      ],
    },
  ],
  homepageUrl: "https://dokploy.com",
  actions: dokployActions,
};
