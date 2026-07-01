import type { ProviderDefinition } from "../../core/types.ts";

import { firefliesActions } from "./actions.ts";

const service = "fireflies";

/**
 * Fireflies provider backed by the Fireflies GraphQL API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Fireflies",
  categories: ["AI", "Productivity", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fireflies_api_key",
      description: "Fireflies API key sent with the Authorization Bearer header to the GraphQL endpoint.",
    },
  ],
  homepageUrl: "https://www.fireflies.ai",
  actions: firefliesActions,
};
