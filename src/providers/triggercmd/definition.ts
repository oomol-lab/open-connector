import type { ProviderDefinition } from "../../core/types.ts";

import { triggercmdActions } from "./actions.ts";

const service = "triggercmd";

export const provider: ProviderDefinition = {
  service,
  displayName: "TRIGGERcmd",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "TRIGGERCMD_TOKEN",
      description:
        "TRIGGERcmd token sent with Bearer authentication. Copy it from the official Instructions page after signing in: https://www.triggercmd.com/user/computer/create",
    },
  ],
  homepageUrl: "https://www.triggercmd.com/",
  actions: triggercmdActions,
};
