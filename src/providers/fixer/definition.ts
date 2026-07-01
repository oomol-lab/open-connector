import type { ProviderDefinition } from "../../core/types.ts";

import { fixerActions } from "./actions.ts";

const service = "fixer";

/**
 * Fixer provider backed by the Fixer exchange-rate API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Fixer",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FIXER_API_KEY",
      description:
        "Fixer API key used as the access_key query parameter. Get it from your Fixer dashboard: https://fixer.io/dashboard.",
    },
  ],
  homepageUrl: "https://fixer.io",
  actions: fixerActions,
};
