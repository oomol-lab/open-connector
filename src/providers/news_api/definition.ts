import type { ProviderDefinition } from "../../core/types.ts";

import { newsApiActions } from "./actions.ts";

const service = "news_api";

export const provider: ProviderDefinition = {
  service,
  displayName: "News API",
  categories: ["Data", "Social"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "NEWS_API_KEY",
      description:
        "News API key used with the X-Api-Key request header. Register for one at https://newsapi.org/register.",
    },
  ],
  homepageUrl: "https://newsapi.org",
  actions: newsApiActions,
};
