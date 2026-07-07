import type { ProviderDefinition } from "../../core/types.ts";

import { webscrapingAiActions } from "./actions.ts";

const service = "webscraping_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "WebScraping.AI",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WEBSCRAPING_AI_API_KEY",
      description:
        "WebScraping.AI API key sent as the api_key query parameter. Create or view it from the WebScraping.AI dashboard: https://webscraping.ai/dashboard.",
    },
  ],
  homepageUrl: "https://webscraping.ai",
  actions: webscrapingAiActions,
};
