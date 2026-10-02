import type { ProviderDefinition } from "../../core/types.ts";

import { dynalistActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "dynalist",
  displayName: "Dynalist",
  homepageUrl: "https://dynalist.io/",
  iconUrl: "https://dynalist.io/assets/icon/android-chrome-192x192.png",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API secret token",
      placeholder: "Dynalist API secret token",
      description:
        "Get your API secret token from https://dynalist.io/developer. It grants access to your Dynalist account.",
    },
  ],
  actions: dynalistActions,
};
