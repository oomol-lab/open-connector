import type { ProviderDefinition } from "../../core/types.ts";

import { viggleActions } from "./actions.ts";

const service = "viggle";

export const provider: ProviderDefinition = {
  service,
  displayName: "Viggle",
  categories: ["AI", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "VIGGLE_API_KEY",
      description:
        "Viggle API key sent as a Bearer token. Create or manage keys in the Viggle Dashboard API Keys page: https://portal.viggle.ai/api-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://viggle.ai",
  actions: viggleActions,
};
