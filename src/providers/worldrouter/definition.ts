import type { ProviderDefinition } from "../../core/types.ts";

import { worldrouterActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "worldrouter",
  displayName: "WorldRouter",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description: "Create an API key at https://www.worldrouter.ai/dashboard/api-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.worldrouter.ai",
  actions: worldrouterActions,
};
