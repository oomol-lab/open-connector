import type { ProviderDefinition } from "../../core/types.ts";

import { theHive5Actions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "thehive5",
  displayName: "TheHive 5",
  description: "Create and inspect alerts and cases in a TheHive 5 instance.",
  categories: ["Security"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Your TheHive 5 API key",
      description:
        "The API key sent as a Bearer token. Organization administrators create user keys from Organization > Create API Key; super administrators use Users > Create API Key. See https://docs.strangebee.com/thehive/administration/authentication/configure-authentication/.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://thehive.example.com",
          description:
            "The root HTTP or HTTPS URL of your TheHive 5 instance. Private-network instances require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK in the self-hosted runtime; reserved, local, and cloud-metadata targets remain blocked.",
        },
      ],
    },
  ],
  homepageUrl: "https://strangebee.com/thehive",
  actions: theHive5Actions,
};
