import type { ProviderDefinition } from "../../core/types.ts";

import { baremetricsActions } from "./actions.ts";

const service = "baremetrics";

export const provider: ProviderDefinition = {
  service,
  displayName: "Baremetrics",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BAREMETRICS_API_KEY",
      description:
        "Baremetrics API key used as a Bearer token. Create or view it in Baremetrics API settings: https://app.baremetrics.com/settings/api.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://baremetrics.com",
  actions: baremetricsActions,
};
