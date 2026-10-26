import type { ProviderDefinition } from "../../core/types.ts";

import { theCompaniesApiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "the_companies_api",
  displayName: "The Companies API",
  description: "Company enrichment and segmentation search",
  homepageUrl: "https://www.thecompaniesapi.com",
  categories: ["Data & Analytics", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      description:
        "Create an API token at https://www.thecompaniesapi.com/settings/api-tokens. Connecting reads your user profile to verify access; company lookups and searches consume your team's credits.",
    },
  ],
  actions: theCompaniesApiActions,
};
