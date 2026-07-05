import type { ProviderDefinition } from "../../core/types.ts";

import { fiberAiActions } from "./actions.ts";

const service = "fiber_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Fiber AI",
  categories: ["Data", "Marketing", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "sk_live_...",
      description:
        "Fiber AI API key used to authenticate requests. Create or copy a key from the Fiber AI API settings page: https://fiber.ai/app/api.",
    },
  ],
  homepageUrl: "https://fiber.ai",
  actions: fiberAiActions,
};
