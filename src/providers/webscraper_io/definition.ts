import type { ProviderDefinition } from "../../core/types.ts";

import { webscraperIoActions } from "./actions.ts";

const service = "webscraper_io";

export const provider: ProviderDefinition = {
  service,
  displayName: "WebScraper.io",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "WEBSCRAPER_IO_API_TOKEN",
      description:
        "Web Scraper Cloud API token passed as the api_token query parameter. Get it from the Web Scraper Cloud API page after signing in: https://cloud.webscraper.io/api",
      extraFields: [],
    },
  ],
  homepageUrl: "https://webscraper.io/",
  actions: webscraperIoActions,
};
