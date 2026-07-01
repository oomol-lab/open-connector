import type { ProviderDefinition } from "../../core/types.ts";

import { ashbyActions } from "./actions.ts";

const service = "ashby";

export const provider: ProviderDefinition = {
  service,
  displayName: "Ashby",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ASHBY_API_KEY",
      description:
        "Ashby API key used as the Basic Auth username. Create or manage API keys in Ashby Admin > Integrations > API Keys: https://app.ashbyhq.com/admin/api/keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.ashbyhq.com",
  actions: ashbyActions,
};
