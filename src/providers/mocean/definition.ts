import type { ProviderDefinition } from "../../core/types.ts";

import { moceanActions } from "./actions.ts";

const service = "mocean";

export const provider: ProviderDefinition = {
  service,
  displayName: "Mocean",
  categories: ["Communication", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "MOCEAN_API_TOKEN",
      description:
        "Mocean API token sent as an Authorization bearer token. Generate it from Dashboard > API Account > Generate Token: https://dashboard.moceanapi.com/.",
    },
  ],
  homepageUrl: "https://moceanapi.com",
  actions: moceanActions,
};
