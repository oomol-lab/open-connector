import type { ProviderDefinition } from "../../core/types.ts";

import { onfleetActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "onfleet",
  displayName: "Onfleet",
  categories: ["Productivity", "Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ONFLEET_API_KEY",
      description:
        "Onfleet API key used as the Basic Auth username. Create or manage it in Configuration > API & Webhook: https://docs.onfleet.com/reference/scope-api-key.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://onfleet.com/",
  actions: onfleetActions,
};
