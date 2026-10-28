import type { ProviderDefinition } from "../../core/types.ts";

import actions from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "pingback",
  displayName: "Pingback",
  description: "Manage newsletter subscribers and segmentation memberships",
  homepageUrl: "https://pingback.com",
  categories: ["Marketing", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "PINGBACK_API_KEY",
      description:
        "Create your Pingback API key at https://pingback.com/publish/settings/account/api-key (Pro or Ultra plan). It is sent in x-api-key. Connection checks only that the key is nonempty; the first API call verifies access.",
    },
  ],
  actions,
};
