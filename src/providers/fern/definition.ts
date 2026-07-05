import type { ProviderDefinition } from "../../core/types.ts";

import { fernActions } from "./actions.ts";

const service = "fern";

export const provider: ProviderDefinition = {
  service,
  displayName: "Fern",
  categories: ["Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FERN_API_KEY",
      description:
        "Fern API key sent as a Bearer token. Create or manage API keys in the Fern developer dashboard: https://dashboard.fernhq.com/.",
    },
  ],
  homepageUrl: "https://fernhq.com",
  actions: fernActions,
};
