import type { ProviderDefinition } from "../../core/types.ts";

import { poperActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "poper",
  displayName: "Poper",
  description: "List Poper popups and the responses they collect.",
  categories: ["Marketing", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "POPER_API_KEY",
      description:
        "Poper API key sent as the api_key form field. Create it under Settings > API Keys: https://support.poper.ai/en/articles/10095376-create-api-key",
    },
  ],
  homepageUrl: "https://www.poper.ai",
  actions: poperActions,
};
