import type { ProviderDefinition } from "../../core/types.ts";

import { postalyticsActions } from "./actions.ts";

const service = "postalytics";

/**
 * Postalytics provider backed by the public Postalytics API v1.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Postalytics",
  categories: ["Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "postalytics_api_key",
      description:
        "Postalytics API key used as the HTTP Basic username. Find it in the Connect section of your Postalytics account: https://docs.postalytics.com/getting-started/quick-start",
    },
  ],
  homepageUrl: "https://www.postalytics.com/",
  actions: postalyticsActions,
};
