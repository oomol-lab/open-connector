import type { ProviderDefinition } from "../../core/types.ts";

import { pulseticActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "pulsetic",
  displayName: "Pulsetic",
  description: "Inspect Pulsetic monitors, checks, events, statistics, and downtime.",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PULSETIC_API_KEY",
      description:
        "Pulsetic API key sent in the Authorization header. Create or manage keys at https://app.pulsetic.com/account/api.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://pulsetic.com",
  actions: pulseticActions,
};
