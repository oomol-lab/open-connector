import type { ProviderDefinition } from "../../core/types.ts";

import { alphaVantageActions } from "./actions.ts";

const service = "alpha_vantage";

export const provider: ProviderDefinition = {
  service,
  displayName: "Alpha Vantage",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Your Alpha Vantage API key",
      description:
        "Alpha Vantage API key sent with the apikey query parameter. Claim your free key at https://www.alphavantage.co/support/#api-key.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.alphavantage.co",
  actions: alphaVantageActions,
};
