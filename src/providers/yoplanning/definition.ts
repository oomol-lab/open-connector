import type { ProviderDefinition } from "../../core/types.ts";

import { yoplanningActions } from "./actions.ts";

const service = "yoplanning";

export const provider: ProviderDefinition = {
  service,
  displayName: "YoPlanning",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "YOUR_YOPLANNING_API_TOKEN",
      description:
        "YoPlanning API token sent in the Authorization header. Request it from Settings > Advanced after signing in; see the official authentication guide: https://yoplanning.pro/api/v3.1/docs/#auth.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.yoplanning.com/",
  actions: yoplanningActions,
};
