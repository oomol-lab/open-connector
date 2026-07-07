import type { ProviderDefinition } from "../../core/types.ts";

import { blandAiActions } from "./actions.ts";

const service = "bland_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Bland AI",
  categories: ["AI", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BLAND_API_KEY",
      description:
        "Bland AI API key sent in the authorization header. Create or view API keys in the Bland dashboard under Settings > API Keys: https://app.bland.ai/dashboard/settings/api-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.bland.ai/",
  actions: blandAiActions,
};
