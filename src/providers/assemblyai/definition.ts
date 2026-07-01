import type { ProviderDefinition } from "../../core/types.ts";

import { assemblyaiActions } from "./actions.ts";

const service = "assemblyai";

export const provider: ProviderDefinition = {
  service,
  displayName: "AssemblyAI",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ASSEMBLYAI_API_KEY",
      description:
        "AssemblyAI API key sent in the Authorization header. Create or manage API keys in the AssemblyAI Dashboard: https://www.assemblyai.com/dashboard.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.assemblyai.com/",
  actions: assemblyaiActions,
};
