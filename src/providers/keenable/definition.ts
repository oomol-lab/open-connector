import type { ProviderDefinition } from "../../core/types.ts";

import { keenableActions } from "./actions.ts";

const service = "keenable";

export const provider: ProviderDefinition = {
  service,
  displayName: "Keenable",
  categories: ["AI", "Data"],
  authTypes: ["no_auth", "api_key"],
  auth: [
    { type: "no_auth" },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "KEENABLE_API_KEY",
      description:
        "Optional Keenable API key sent in the X-API-Key header. Search and page fetch work without a key; a key raises the rate limits. Create one at https://keenable.ai/console.",
    },
  ],
  homepageUrl: "https://keenable.ai",
  actions: keenableActions,
};
