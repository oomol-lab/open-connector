import type { ProviderDefinition } from "../../core/types.ts";

import { beamerActions } from "./actions.ts";

const service = "beamer";

export const provider: ProviderDefinition = {
  service,
  displayName: "Beamer",
  categories: ["Communication", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BEAMER_API_KEY",
      description:
        "Beamer API key sent in the Beamer-Api-Key header. Find or manage it in Settings > API after signing in: https://app.getbeamer.com/settings.",
    },
  ],
  homepageUrl: "https://www.getbeamer.com",
  actions: beamerActions,
};
