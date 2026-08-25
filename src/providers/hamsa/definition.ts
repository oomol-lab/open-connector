import type { ProviderDefinition } from "../../core/types.ts";

import { hamsaActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "hamsa",
  displayName: "Hamsa",
  categories: ["AI", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "YOUR_HAMSA_API_KEY",
      description:
        "Hamsa API key sent in the Authorization header. Create and copy a key from https://agents.tryhamsa.com/settings/api-keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://tryhamsa.com",
  actions: hamsaActions,
};
