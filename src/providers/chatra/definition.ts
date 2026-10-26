import type { ProviderDefinition } from "../../core/types.ts";

import { chatraActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "chatra",
  displayName: "Chatra",
  description: "Customer live chat, agent replies, and visitor management",
  homepageUrl: "https://chatra.com/",
  categories: ["Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Private API Key",
      description:
        "Copy your private API key from https://app.chatra.io/settings/preferences#apiKeys. Connecting checks only that both keys are present; Chatra verifies them when you run an action.",
      extraFields: [
        {
          key: "publicKey",
          inputType: "text",
          label: "Public API Key",
          required: true,
          secret: false,
          description:
            "Copy the public API key paired with your private key from https://app.chatra.io/settings/preferences#apiKeys.",
        },
      ],
    },
  ],
  actions: chatraActions,
};
