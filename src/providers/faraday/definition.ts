import type { ProviderDefinition } from "../../core/types.ts";

import { faradayActions } from "./actions.ts";

const service = "faraday";

/**
 * Faraday provider backed by the public Faraday API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Faraday",
  categories: ["AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FARADAY_API_KEY",
      description:
        "Faraday API key used with the Authorization Bearer header. Create or manage API keys after signing in to Faraday: https://app.faraday.ai.",
    },
  ],
  homepageUrl: "https://faraday.ai",
  actions: faradayActions,
};
