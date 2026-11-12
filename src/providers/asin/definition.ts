import type { ProviderDefinition } from "../../core/types.ts";

import { asinActions } from "./actions.ts";

const service = "asin";

export const provider: ProviderDefinition = {
  service,
  displayName: "Asin",
  categories: ["Data", "E-commerce"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ASIN_API_KEY",
      description:
        "Asin API key sent with the Authorization Bearer header. Create or copy it from your Asin dashboard: https://www.asin.dev/",
    },
  ],
  homepageUrl: "https://www.asin.dev",
  actions: asinActions,
};
