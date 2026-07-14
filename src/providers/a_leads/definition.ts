import type { ProviderDefinition } from "../../core/types.ts";

import { aLeadsActions } from "./actions.ts";

const service = "a_leads";

/**
 * A-Leads provider backed by the public A-Leads gateway API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "A-Leads",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "A_LEADS_API_KEY",
      description:
        "A-Leads API key sent with the x-api-key header. Create or view it in your A-Leads account, and see the API docs at https://docs.a-leads.co/docs.",
    },
  ],
  homepageUrl: "https://a-leads.co",
  actions: aLeadsActions,
};
