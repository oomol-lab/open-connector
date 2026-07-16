import type { ProviderDefinition } from "../../core/types.ts";

import { duneActions } from "./actions.ts";

const service = "dune";

export const provider: ProviderDefinition = {
  service,
  displayName: "Dune",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DUNE_API_KEY",
      description:
        "Dune API key sent in the X-Dune-API-Key header. Create a key in Dune under Settings > API: https://dune.com/settings/api.",
    },
  ],
  homepageUrl: "https://dune.com/",
  actions: duneActions,
};
