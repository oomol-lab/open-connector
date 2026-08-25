import type { ProviderDefinition } from "../../core/types.ts";

import { theHiveActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "thehive",
  displayName: "TheHive",
  description: "Create and inspect alerts and cases in a TheHive 4 instance.",
  categories: ["Security"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Your TheHive API key",
      description:
        "The API key sent as a Bearer token. In TheHive 4, an organization administrator can create it from Organization > Create API Key. See https://docs.thehive-project.org/thehive/legacy/thehive4/.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://thehive.example.com",
          description:
            "The root HTTP or HTTPS URL of your TheHive 4 instance. Private-network instances require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK in the self-hosted runtime; reserved, local, and cloud-metadata targets remain blocked.",
        },
      ],
    },
  ],
  homepageUrl: "https://thehive-project.org",
  actions: theHiveActions,
};
