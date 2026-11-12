import type { ProviderDefinition } from "../../core/types.ts";

import { veilleActions } from "./actions.ts";

const service = "veille";

export const provider: ProviderDefinition = {
  service,
  displayName: "Veille",
  categories: ["Security", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "VEILLE_API_KEY",
      description:
        "Veille API key sent with the x-api-key header. Create or copy it from your Veille dashboard: https://app.veille.io/",
    },
  ],
  homepageUrl: "https://www.veille.io",
  actions: veilleActions,
};
