import type { ProviderDefinition } from "../../core/types.ts";

import { amapActions } from "./actions.ts";

const service = "amap";

export const provider: ProviderDefinition = {
  service,
  displayName: "AMap",
  categories: ["Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "amap_api_key",
      description:
        "AMap API key sent as the key query parameter. Create it in the AMap Open Platform console: https://lbs.amap.com/api/webservice/guide/create-project/get-key .",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.amap.com",
  actions: amapActions,
};
