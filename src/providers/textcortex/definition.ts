import type { ProviderDefinition } from "../../core/types.ts";

import { textcortexActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "textcortex",
  displayName: "TextCortex",
  categories: ["AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "TEXTCORTEX_API_KEY",
      description:
        "TextCortex API key sent as a Bearer token. Create or copy it from your TextCortex API keys page: https://app.textcortex.com/user/api-keys.",
    },
  ],
  homepageUrl: "https://textcortex.com/",
  actions: textcortexActions,
};
