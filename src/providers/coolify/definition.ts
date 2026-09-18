import type { ProviderDefinition } from "../../core/types.ts";

import { coolifyActions } from "./actions.ts";

const service = "coolify";

export const provider: ProviderDefinition = {
  service,
  displayName: "Coolify",
  description: "Inspect applications and manage deployments on a Coolify instance.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "Enter your Coolify API token",
      description: "A token created in Coolify under Keys & Tokens > API tokens. The token is sent as a Bearer token.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://app.coolify.io",
          description:
            "The HTTP or HTTPS URL of your Coolify instance. Public addresses work by default; private-network instances require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK in the self-hosted runtime.",
        },
      ],
    },
  ],
  homepageUrl: "https://coolify.io",
  actions: coolifyActions,
};
