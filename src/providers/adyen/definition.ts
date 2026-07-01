import type { ProviderDefinition } from "../../core/types.ts";

import { adyenActions } from "./actions.ts";

const service = "adyen";

export const provider: ProviderDefinition = {
  service,
  displayName: "Adyen",
  categories: ["Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ADYEN_API_KEY",
      description:
        "Adyen Management API key sent in the X-API-Key header. Generate or view API keys in your Adyen Customer Area: https://docs.adyen.com/development-resources/api-credentials#generate-api-key",
      extraFields: [
        {
          key: "environment",
          label: "Environment",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "test",
          description:
            "Adyen Management API environment for this key. Use test for Customer Area test keys or live for live Customer Area keys.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.adyen.com",
  actions: adyenActions,
};
