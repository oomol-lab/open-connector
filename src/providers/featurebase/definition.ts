import type { ProviderDefinition } from "../../core/types.ts";

import { featurebaseActions } from "./actions.ts";

const service = "featurebase";

/**
 * Featurebase provider backed by the public Featurebase REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Featurebase",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk_...",
      description:
        "Featurebase API key sent as a Bearer token. Create or view API keys from your Featurebase workspace settings: https://docs.featurebase.app/rest-api.",
    },
  ],
  homepageUrl: "https://www.featurebase.app/",
  actions: featurebaseActions,
};
