import type { ProviderDefinition } from "../../core/types.ts";

import { customgptActions } from "./actions.ts";

const service = "customgpt";

export const provider: ProviderDefinition = {
  service,
  displayName: "CustomGPT.ai",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "CUSTOMGPT_API_KEY",
      description:
        "CustomGPT API key sent as an Authorization Bearer token. Create it in the CustomGPT profile API tab: https://app.customgpt.ai/profile#api.",
    },
  ],
  homepageUrl: "https://customgpt.ai",
  actions: customgptActions,
};
