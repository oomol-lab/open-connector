import type { ProviderDefinition } from "../../core/types.ts";

import { freshstatusActions } from "./actions.ts";

const service = "freshstatus";

export const provider: ProviderDefinition = {
  service,
  displayName: "Freshstatus",
  description: "Build and organize a Freshstatus status page through its public API.",
  categories: ["Communication", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "freshstatus_api_key",
      description:
        "Freshstatus organization API key used as the HTTP Basic username. Copy it from Settings > Account: https://support.freshstatus.io/support/solutions/articles/50000003646-freshstatus-api-documentation",
      extraFields: [
        {
          key: "subdomain",
          label: "Freshstatus Subdomain",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "your-status-page",
          description:
            "Freshstatus account subdomain used as the HTTP Basic password. For https://example.freshstatus.io, enter example.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.freshworks.com/statuspage",
  actions: freshstatusActions,
};
