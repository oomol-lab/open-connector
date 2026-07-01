import type { ProviderDefinition } from "../../core/types.ts";

import { amplemarketActions } from "./actions.ts";

const service = "amplemarket";

export const provider: ProviderDefinition = {
  service,
  displayName: "Amplemarket",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "amplemarket_api_key",
      description:
        "Amplemarket API key used as a Bearer token. Create or view it in the Amplemarket Dashboard under Settings > API: https://docs.amplemarket.com/guides/quickstart.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.amplemarket.com",
  actions: amplemarketActions,
};
