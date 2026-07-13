import type { ProviderDefinition } from "../../core/types.ts";

import { speechmaticsActions } from "./actions.ts";

const service = "speechmatics";

export const provider: ProviderDefinition = {
  service,
  displayName: "Speechmatics",
  description:
    "Query Speechmatics workspace projects, live service capabilities, and documented cloud deployment endpoints.",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Management Token",
      placeholder: "SPEECHMATICS_MANAGEMENT_TOKEN",
      description:
        "Speechmatics workspace Management Token sent as a Bearer token. Create one with View projects permission under Manage workspace > Management tokens in the Speechmatics Portal: https://portal.speechmatics.com.",
    },
  ],
  homepageUrl: "https://www.speechmatics.com/",
  actions: speechmaticsActions,
};
