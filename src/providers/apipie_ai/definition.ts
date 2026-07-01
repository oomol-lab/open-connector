import type { ProviderDefinition } from "../../core/types.ts";

import { apipieAiActions } from "./actions.ts";

const service = "apipie_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "APIpie AI",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "APIpie AI API key used with the Authorization Bearer header. Create or manage keys at https://apipie.ai/profile/api-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://apipie.ai",
  actions: apipieAiActions,
};
