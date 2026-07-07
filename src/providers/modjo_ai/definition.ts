import type { ProviderDefinition } from "../../core/types.ts";

import { modjoAiActions } from "./actions.ts";

const service = "modjo_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Modjo AI",
  categories: ["Communication", "AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "modjo_api_key",
      description:
        "Modjo API key sent as a Bearer token in the Authorization header. Create an API key from Modjo settings as described in the Public API docs: https://api.modjo.ai/v2/docs.",
    },
  ],
  homepageUrl: "https://www.modjo.ai",
  actions: modjoAiActions,
};
