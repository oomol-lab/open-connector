import type { ProviderDefinition } from "../../core/types.ts";

import { anthropicActions } from "./actions.ts";

const service = "anthropic";

export const provider: ProviderDefinition = {
  service,
  displayName: "Anthropic",
  categories: ["AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "anthropic_api_key",
      description:
        "Anthropic API key used with the x-api-key header. Create or manage API keys in the Anthropic Console: https://console.anthropic.com/settings/keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.anthropic.com",
  actions: anthropicActions,
};
