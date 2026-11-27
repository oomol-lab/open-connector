import type { ProviderDefinition } from "../../core/types.ts";

import { straitlyActions } from "./actions.ts";

/** Straitly is an AI gateway: one OpenAI-compatible API key for 100+ models including Claude, GPT, Gemini, Grok and DeepSeek. */
export const provider: ProviderDefinition = {
  service: "straitly",
  displayName: "Straitly",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description: "Create an API key at https://straitly.ai/app/keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://straitly.ai",
  actions: straitlyActions,
};
