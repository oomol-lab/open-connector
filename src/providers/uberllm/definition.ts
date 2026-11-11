import type { ProviderDefinition } from "../../core/types.ts";

import { uberllmActions } from "./actions.ts";

/** UberLLM's OpenAI-compatible model API. */
export const provider: ProviderDefinition = {
  service: "uberllm",
  displayName: "UberLLM",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ull_...",
      description:
        "Create an API key at https://uberllm.dev/signup. Requests use Bearer authentication; inference is billed per token from a prepaid balance.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://uberllm.dev",
  actions: uberllmActions,
};
