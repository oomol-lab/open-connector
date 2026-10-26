import type { ProviderDefinition } from "../../core/types.ts";

import { topazActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "topaz",
  displayName: "Topaz",
  description: "AI image and video upscaling, enhancement and frame interpolation",
  homepageUrl: "https://www.topazlabs.com",
  categories: ["Design & Media", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Create an API key at https://account.topazlabs.com/manage-api. Connecting checks your API credit balance; enhancement jobs consume API credits.",
    },
  ],
  actions: topazActions,
};
