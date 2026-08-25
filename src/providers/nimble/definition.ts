import type { ProviderDefinition } from "../../core/types.ts";

import { nimbleActions } from "./actions.ts";

const service = "nimble";

export const provider: ProviderDefinition = {
  service,
  displayName: "Nimble",
  description: "List, search, create, and update contacts in Nimble CRM.",
  categories: ["Marketing", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "nimble_api_key",
      description:
        "Nimble API key sent as a Bearer token. Account administrators can generate it in Nimble under Settings > API Token: https://support.nimble.com/en/articles/822159-generate-an-api-key-to-access-the-nimble-api",
    },
  ],
  homepageUrl: "https://www.nimble.com/",
  actions: nimbleActions,
};
