import type { ProviderDefinition } from "../../core/types.ts";

import { intrinioActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "intrinio",
  displayName: "Intrinio",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "INTRINIO_API_KEY",
      description:
        "Intrinio API key sent as a Bearer token. View or create it on your Intrinio account page: https://account.intrinio.com/account/api_keys.",
    },
  ],
  homepageUrl: "https://intrinio.com/",
  actions: intrinioActions,
};
