import type { ProviderDefinition } from "../../core/types.ts";

import { togetherAiActions } from "./actions.ts";

const service = "together_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Together AI",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Together AI project API key used with the Authorization Bearer header. Create or manage keys in project API key settings: https://api.together.ai/settings/projects/~current/api-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.together.ai",
  actions: togetherAiActions,
};
