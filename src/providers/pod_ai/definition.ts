import type { ProviderDefinition } from "../../core/types.ts";

import { podAiActions } from "./actions.ts";

const service = "pod_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Pod AI",
  categories: ["AI", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "POD_AI_API_KEY",
      description:
        "Pod AI API key sent with the X-Api-Key header. Create or manage keys from Settings > API Keys in the Pod dashboard: https://www.callpod.ai/docs/api-reference/authentication.",
    },
  ],
  homepageUrl: "https://callpod.ai/",
  actions: podAiActions,
};
