import type { ProviderDefinition } from "../../core/types.ts";

import { consensusActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "consensus",
  displayName: "Consensus",
  categories: ["AI", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "CONSENSUS_API_KEY",
      description:
        "Consensus API key sent with the x-api-key header. Manage API access at https://consensus.app/home/api/.",
    },
  ],
  homepageUrl: "https://consensus.app",
  actions: consensusActions,
};
