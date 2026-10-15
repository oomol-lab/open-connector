import type { ProviderDefinition } from "../../core/types.ts";

import { arcmiraActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "arcmira",
  displayName: "Arcmira",
  categories: ["AI", "Data"],
  homepageUrl: "https://arcmira.com",
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Arcmira API key",
      placeholder: "arc_sk_...",
      description:
        "Create an API key in your Arcmira dashboard. API documentation: https://arcmira.com/docs. Paid reads use credits from your plan, then your on-demand budget.",
      extraFields: [],
    },
  ],
  actions: arcmiraActions,
};
