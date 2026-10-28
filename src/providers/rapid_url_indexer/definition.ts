import type { ProviderDefinition } from "../../core/types.ts";

import actions from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "rapid_url_indexer",
  displayName: "Rapid URL Indexer",
  description: "Submit URLs for indexing and track project progress, reports, and credits.",
  homepageUrl: "https://rapidurlindexer.com/",
  categories: ["Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "RAPID_URL_INDEXER_API_KEY",
      description:
        "Get your API key from My Projects: https://rapidurlindexer.com/my-account/rui-projects/ . The key is sent in the X-API-Key header.",
    },
  ],
  actions,
};
