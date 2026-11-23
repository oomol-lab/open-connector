import type { ProviderDefinition } from "../../core/types.ts";

import { wavespeedActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "wavespeed",
  displayName: "WaveSpeedAI",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "wsk_...",
      description:
        "WaveSpeedAI API key used with the Authorization Bearer header. Create or manage keys on the official access key page: https://wavespeed.ai/accesskey.",
    },
  ],
  homepageUrl: "https://wavespeed.ai",
  actions: wavespeedActions,
};
