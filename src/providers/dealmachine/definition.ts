import type { ProviderDefinition } from "../../core/types.ts";

import { dealMachineActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "dealmachine",
  displayName: "DealMachine",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "dm_sk_live_xxx",
      description:
        "DealMachine API key sent as a Bearer token. Create or view keys at https://dealmachine.com/settings/developer.",
    },
  ],
  homepageUrl: "https://dealmachine.com",
  actions: dealMachineActions,
};
