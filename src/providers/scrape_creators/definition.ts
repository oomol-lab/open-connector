import type { ProviderDefinition } from "../../core/types.ts";

import { scrapeCreatorsActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "scrape_creators",
  displayName: "Scrape Creators",
  description: "Discover and invoke Scrape Creators social data API endpoints.",
  categories: ["Data", "Social"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Your Scrape Creators API key",
      description:
        "API key sent with the x-api-key header. Create or view it in the Scrape Creators dashboard: https://app.scrapecreators.com.",
    },
  ],
  homepageUrl: "https://scrapecreators.com/",
  actions: scrapeCreatorsActions,
};
