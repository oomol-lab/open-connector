import type { ProviderDefinition } from "../../core/types.ts";

import { uberllmActions } from "./actions.ts";

/** MartLLM's OpenAI-compatible model API. */
export const provider: ProviderDefinition = {
  service: "uberllm",
  displayName: "MartLLM",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ull_...",
      description:
        "Create an API key at https://martllm.com/signup. Requests use Bearer authentication; marketplace inference generally requires account credit; BYOK requests do not use MartLLM credit.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://martllm.com",
  actions: uberllmActions,
};
