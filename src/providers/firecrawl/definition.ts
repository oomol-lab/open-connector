import type { ProviderDefinition } from "../../core/types.ts";

import { firecrawlActions } from "./actions.ts";

const service = "firecrawl";

/**
 * Firecrawl provider backed by the Firecrawl REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Firecrawl",
  categories: ["Data", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fc-...",
      description:
        "Firecrawl API key used with the Authorization Bearer header. Create it in Firecrawl API Keys: https://firecrawl.dev/app/api-keys.",
    },
  ],
  homepageUrl: "https://www.firecrawl.dev",
  actions: firecrawlActions,
};
