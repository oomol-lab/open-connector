import type { ProviderDefinition } from "../../core/types.ts";

import { statsigActions } from "./actions.ts";

const service = "statsig";

export const provider: ProviderDefinition = {
  service,
  displayName: "Statsig",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Console API Key",
      placeholder: "console-xxxxxxxxxxxxxxxx",
      description:
        "Statsig Console API key sent with the STATSIG-API-KEY header. Create or view it from Project Settings > Environments & Keys in the Statsig Console: https://console.statsig.com/api_keys.",
    },
  ],
  homepageUrl: "https://www.statsig.com/",
  actions: statsigActions,
};
