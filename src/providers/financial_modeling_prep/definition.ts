import type { ProviderDefinition } from "../../core/types.ts";

import { financialModelingPrepActions } from "./actions.ts";

const service = "financial_modeling_prep";

/**
 * Financial Modeling Prep provider backed by the stable Financial Modeling Prep REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Financial Modeling Prep",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Your Financial Modeling Prep API key",
      description:
        "Financial Modeling Prep API key passed as the apikey query parameter. Get or manage your key in the developer dashboard: https://site.financialmodelingprep.com/developer/docs/dashboard.",
    },
  ],
  homepageUrl: "https://financialmodelingprep.com",
  actions: financialModelingPrepActions,
};
