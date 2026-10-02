import type { ProviderDefinition } from "../../core/types.ts";

import { cheaperinferenceActions } from "./actions.ts";

const service = "cheaperinference";

/**
 * Cheaper Inference provider backed by Cheaper Inference API keys.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Cheaper Inference",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ci_live_...",
      description:
        "Cheaper Inference API key used with the Authorization Bearer header. Get it from https://cheaperinference.com/signup.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://cheaperinference.com",
  actions: cheaperinferenceActions,
};
