import type { ProviderDefinition } from "../../core/types.ts";

import { benzingaActions } from "./actions.ts";

const service = "benzinga";

export const provider: ProviderDefinition = {
  service,
  displayName: "Benzinga",
  categories: ["Finance", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BENZINGA_API_KEY",
      description:
        "Benzinga API key passed as the token query parameter. Create an account and manage API access from the Benzinga API dashboard: https://www.benzinga.com/apis/",
    },
  ],
  homepageUrl: "https://www.benzinga.com/",
  actions: benzingaActions,
};
