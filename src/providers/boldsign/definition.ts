import type { ProviderDefinition } from "../../core/types.ts";

import { boldSignActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "boldsign",
  displayName: "BoldSign",
  description: "Inspect BoldSign credits, documents, and templates, and send signature requests from templates.",
  categories: ["Productivity", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BOLDSIGN_API_KEY",
      description:
        "Generate a BoldSign API key from API > API Key: https://developers.boldsign.com/authentication/api-key/",
      extraFields: [
        {
          key: "region",
          label: "Region",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "us, eu, ca, or au",
          description: "The BoldSign API region associated with the key: us, eu, ca, or au.",
        },
      ],
    },
  ],
  homepageUrl: "https://boldsign.com",
  actions: boldSignActions,
};
