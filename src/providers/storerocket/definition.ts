import type { ProviderDefinition } from "../../core/types.ts";

import actions from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "storerocket",
  displayName: "StoreRocket",
  description: "Manage store locator projects and locations",
  homepageUrl: "https://storerocket.io",
  categories: ["Maps & Location"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "STOREROCKET_API_TOKEN",
      description:
        "Create a token at https://storerocket.io/app/api-tokens with the location permissions you need. Location operations require project API access on the Business plan.",
    },
  ],
  actions,
};
