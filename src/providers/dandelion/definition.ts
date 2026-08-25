import type { ProviderDefinition } from "../../core/types.ts";

import { dandelionActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "dandelion",
  displayName: "Dandelion API",
  categories: ["AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "DANDELION_API_TOKEN",
      description: "Dandelion API token. Create and manage it at https://dandelion.eu/profile/plans-and-pricing/.",
    },
  ],
  homepageUrl: "https://dandelion.eu/",
  actions: dandelionActions,
};
