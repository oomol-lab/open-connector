import type { ProviderDefinition } from "../../core/types.ts";

import { firstbaseActions } from "./actions.ts";

const service = "firstbase";

export const provider: ProviderDefinition = {
  service,
  displayName: "Firstbase",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FIRSTBASE_API_KEY",
      description:
        "Firstbase API key sent in the Authorization header as ApiKey. Create or view API credentials from the Firstbase API setup guide: https://support.firstbase.com/hc/en-us/articles/34906537518487-Getting-Started-with-the-Firstbase-API.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.firstbase.com",
  actions: firstbaseActions,
};
