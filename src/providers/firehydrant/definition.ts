import type { ProviderDefinition } from "../../core/types.ts";

import { firehydrantActions } from "./actions.ts";

const service = "firehydrant";

/**
 * FireHydrant provider backed by the FireHydrant REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "FireHydrant",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FIREHYDRANT_API_KEY",
      description:
        "FireHydrant API key sent as a Bearer token. Create one from Settings > API Keys in FireHydrant, documented at https://docs.firehydrant.com/docs/api-keys.",
    },
  ],
  homepageUrl: "https://firehydrant.com",
  actions: firehydrantActions,
};
