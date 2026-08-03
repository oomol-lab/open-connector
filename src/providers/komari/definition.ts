import type { ProviderDefinition } from "../../core/types.ts";

import { komariActions } from "./actions.ts";

const service = "komari";

export const provider: ProviderDefinition = {
  service,
  displayName: "Komari",
  description: "Read server inventory and monitoring metrics from a self-hosted Komari instance.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Enter your Komari API key",
      description:
        "The API key configured in the Komari dashboard. Komari accepts it as a Bearer token and currently grants administrator-level API access, so use a dedicated secret and restrict exposed actions in OpenConnector.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://komari.example.com",
          description:
            "The HTTP or HTTPS root URL of your Komari 1.3.2 or newer instance. Public addresses work by default; private-network targets require a self-hosted OpenConnector runtime with OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK enabled. Loopback, link-local, reserved, and cloud-metadata targets remain blocked.",
        },
      ],
    },
  ],
  homepageUrl: "https://github.com/komari-monitor/komari",
  actions: komariActions,
};
