import type { ProviderDefinition } from "../../core/types.ts";

import { affinityActions } from "./actions.ts";

const service = "affinity";

export const provider: ProviderDefinition = {
  service,
  displayName: "Affinity",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "affinity_api_key",
      description:
        "Affinity API key used with the Authorization Bearer header. Create it in Settings -> Manage Apps -> API Keys.",
    },
  ],
  homepageUrl: "https://www.affinity.co",
  actions: affinityActions,
};
