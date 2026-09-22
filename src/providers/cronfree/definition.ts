import type { ProviderDefinition } from "../../core/types.ts";

import { cronfreeActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "cronfree",
  displayName: "Cronfree",
  description: "Create and delete recurring webhook schedules with Cronfree.",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "License Key",
      placeholder: "CRONFREE_LICENSE_KEY",
      description:
        "Cronfree license key used to manage webhook schedules. Sign in or create an account at https://cronfree.com, then copy the License Key shown in the dashboard.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://cronfree.com",
  actions: cronfreeActions,
};
