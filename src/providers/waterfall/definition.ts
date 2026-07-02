import type { ProviderDefinition } from "../../core/types.ts";

import { waterfallActions } from "./actions.ts";

const service = "waterfall";

export const provider: ProviderDefinition = {
  service,
  displayName: "Waterfall",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WATERFALL_API_KEY",
      description: "Waterfall API key sent in the x-api-key header. API keys are provided in your Waterfall contract.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.waterfall.io",
  actions: waterfallActions,
};
