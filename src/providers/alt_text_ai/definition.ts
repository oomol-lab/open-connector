import type { ProviderDefinition } from "../../core/types.ts";

import { altTextAiActions } from "./actions.ts";

const service = "alt_text_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "AltText.ai",
  categories: ["AI", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ALT_TEXT_AI_API_KEY",
      description:
        "AltText.ai API key sent with the X-API-Key header. Create or view API keys in your AltText.ai account: https://alttext.ai/account/api_keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://alttext.ai",
  actions: altTextAiActions,
};
