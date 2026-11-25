import type { ProviderDefinition } from "../../core/types.ts";

import { teamorouterActions } from "./actions.ts";

/** TeamoRouter's OpenAI-compatible model API: one key for Claude, GPT, Gemini, DeepSeek, GLM, Kimi and Qwen models. */
export const provider: ProviderDefinition = {
  service: "teamorouter",
  displayName: "TeamoRouter",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk-teamo-...",
      description:
        "Create an API key in the TeamoRouter dashboard at https://teamorouter.com/dashboard. Requests use Bearer authentication; inference is billed per token from a prepaid balance.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://teamorouter.com",
  actions: teamorouterActions,
};
