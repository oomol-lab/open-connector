import type { ProviderDefinition } from "../../core/types.ts";

import { snipcartActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "snipcart",
  displayName: "Snipcart",
  categories: ["Finance"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret API Key",
      placeholder: "YOUR_SECRET_API_KEY",
      description:
        "Snipcart secret API key used as the HTTP Basic Auth username. See https://docs.snipcart.com/v3/api-reference/authentication.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://snipcart.com/",
  actions: snipcartActions,
};
