import type { ProviderDefinition } from "../../core/types.ts";

import { instatusActions } from "./actions.ts";

const service = "instatus";

export const provider: ProviderDefinition = {
  service,
  displayName: "Instatus",
  categories: ["Developer Tools", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "instatus_api_key",
      description:
        "Instatus API key sent as a Bearer token in the Authorization header. Create or view it in User settings developer settings: https://dashboard.instatus.com/developer",
    },
  ],
  homepageUrl: "https://instatus.com",
  actions: instatusActions,
};
