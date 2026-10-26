import type { ProviderDefinition } from "../../core/types.ts";

import { tendataActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "tendata",
  displayName: "Tendata",
  homepageUrl: "https://www.tendata.cn/",
  categories: ["Data", "Cross-border ecommerce"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Tendata API key used to obtain short-lived access tokens. Obtain a key and activate the required data services through Tendata sales: https://open-api.tendata.cn/auth.html.",
    },
  ],
  actions: tendataActions,
};
