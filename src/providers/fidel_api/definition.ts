import type { ProviderDefinition } from "../../core/types.ts";

import { fidelApiActions } from "./actions.ts";

const service = "fidel_api";

/**
 * Fidel API provider backed by the public Fidel read APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Fidel API",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Secret API Key",
      placeholder: "FIDEL_API_SECRET_KEY",
      description:
        "Fidel API secret key used with the Fidel-Key header for read-only brands, cards, and transactions endpoints. Create or sign in to the Fidel dashboard to get your test or live secret key: https://dashboard.fidel.uk/sign-in",
    },
  ],
  homepageUrl: "https://fidel.uk",
  actions: fidelApiActions,
};
