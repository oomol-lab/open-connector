import type { ProviderDefinition } from "../../core/types.ts";

import { salesforgeActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "salesforge",
  displayName: "Salesforge",
  description: "Manage outreach contacts, workspace tags, and do-not-contact lists",
  homepageUrl: "https://www.salesforge.ai",
  categories: ["Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Salesforge API key",
      description:
        "Create an API key under Settings > API at https://app.salesforge.ai. Sent as Authorization without a Bearer prefix. API access requires an eligible plan.",
    },
  ],
  actions: salesforgeActions,
};
