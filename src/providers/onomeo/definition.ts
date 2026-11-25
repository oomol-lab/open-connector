import type { ProviderDefinition } from "../../core/types.ts";

import { onomeoActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "onomeo",
  displayName: "onomeo",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "Your onomeo API key",
      description:
        "Create an API key in the onomeo dashboard at https://onomeo.com/dashboard. Requests use Bearer authentication; paid models are billed per token from a prepaid balance, and new accounts can call deepseek-v4.1-flash for free within daily limits.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://onomeo.com",
  actions: onomeoActions,
};
