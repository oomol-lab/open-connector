import type { ProviderDefinition } from "../../core/types.ts";

import { ahrefsActions } from "./actions.ts";

const service = "ahrefs";

export const provider: ProviderDefinition = {
  service,
  displayName: "Ahrefs",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "AHREFS_API_KEY",
      description:
        "Ahrefs API key used as a Bearer token. Create or manage API keys in Account settings / API keys after signing in: https://docs.ahrefs.com/en/api/docs/api-keys-creation-and-management.",
    },
  ],
  homepageUrl: "https://ahrefs.com/",
  actions: ahrefsActions,
};
