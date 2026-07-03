import type { ProviderDefinition } from "../../core/types.ts";

import { bestbuyActions } from "./actions.ts";

const service = "bestbuy";

export const provider: ProviderDefinition = {
  service,
  displayName: "Best Buy",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BESTBUY_API_KEY",
      description:
        "Best Buy developer API key sent as the apiKey query parameter. Get one from the Best Buy Developer Portal: https://developer.bestbuy.com/",
    },
  ],
  homepageUrl: "https://www.bestbuy.com",
  actions: bestbuyActions,
};
