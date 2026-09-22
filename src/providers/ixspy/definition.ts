import type { ProviderDefinition } from "../../core/types.ts";

import { ixspyActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "ixspy",
  displayName: "IXSPY",
  description: "Research AliExpress products, categories, rankings, trends, and markets with IXSPY.",
  categories: ["Data", "Marketing", "E-commerce"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "YOUR_IXSPY_API_KEY",
      description:
        "IXSPY Open API key sent as a Bearer token. Copy it from My Keys at https://open.ixspy.com/#/account/keys.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://ixspy.com/",
  actions: ixspyActions,
};
