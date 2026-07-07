import type { ProviderDefinition } from "../../core/types.ts";

import { nangoActions } from "./actions.ts";

const service = "nango";

export const provider: ProviderDefinition = {
  service,
  displayName: "Nango",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "NANGO_API_KEY",
      description:
        "Nango API key sent as a Bearer token. Create or view keys in Environment Settings > API Keys at https://app.nango.dev.",
    },
  ],
  homepageUrl: "https://nango.dev",
  actions: nangoActions,
};
