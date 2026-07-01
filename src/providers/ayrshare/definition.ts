import type { ProviderDefinition } from "../../core/types.ts";

import { ayrshareActions } from "./actions.ts";

const service = "ayrshare";

export const provider: ProviderDefinition = {
  service,
  displayName: "Ayrshare",
  categories: ["Social", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "AYRSHARE_API_KEY",
      description:
        "Ayrshare Primary Profile API key sent as Authorization: Bearer API_KEY. Find it in the Ayrshare dashboard API Key page: https://app.ayrshare.com/api-key.",
      extraFields: [
        {
          key: "profileKey",
          label: "Profile Key",
          inputType: "password",
          placeholder: "AYRSHARE_PROFILE_KEY",
          description:
            "Optional Ayrshare User Profile key sent as the Profile-Key header for Business and Enterprise profile requests. Find it from the Ayrshare dashboard user profile management page: https://app.ayrshare.com/profiles.",
          required: false,
          secret: true,
        },
      ],
    },
  ],
  homepageUrl: "https://www.ayrshare.com/",
  actions: ayrshareActions,
};
