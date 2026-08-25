import type { ProviderDefinition } from "../../core/types.ts";

import { markettimeActions } from "./actions.ts";

const service = "markettime";

export const provider: ProviderDefinition = {
  service,
  displayName: "MarketTime",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "MARKETTIME_API_KEY",
      description:
        "MarketTime Public API key sent as x-api-key. Generate it from Billing & Payment > API Key: https://support.markettime.com/hc/en-us/articles/43441619857947-Generating-an-API-Key-for-your-MarketTime-Account",
      extraFields: [
        {
          key: "accountId",
          label: "Account ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "R123 or M123",
          description: "Your MarketTime RepGroup ID (R...) or Manufacturer ID (M...) used as whoAmI in API paths.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.markettime.com/",
  actions: markettimeActions,
};
