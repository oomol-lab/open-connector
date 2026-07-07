import type { ProviderDefinition } from "../../core/types.ts";

import { nethuntActions } from "./actions.ts";

const service = "nethunt";

/**
 * NetHunt provider backed by the public NetHunt Integration API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "NetHunt",
  categories: ["Productivity", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "nethunt_api_key",
      description:
        "NetHunt API key used as the HTTP Basic auth password. Get it from NetHunt profile settings: https://help.nethunt.com/en/articles/4260105-where-to-get-nethunt-api-key.",
      extraFields: [
        {
          key: "email",
          label: "Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@example.com",
          description: "NetHunt account email used as the HTTP Basic auth username for Integration API requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://nethunt.com",
  actions: nethuntActions,
};
