import type { ProviderDefinition } from "../../core/types.ts";

import { mrscraperActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "mrscraper",
  displayName: "MrScraper",
  description: "Webpage HTML, Markdown, structured data extraction, and site URL discovery",
  homepageUrl: "https://mrscraper.com/",
  categories: ["Data & Analytics", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "MRSCRAPER_API_TOKEN",
      description:
        "Create an API token at https://app.mrscraper.com/api-tokens and copy it here. The token authenticates scraping requests and account verification.",
    },
  ],
  actions: mrscraperActions,
};
