import type { ProviderDefinition } from "../../core/types.ts";

import { betterProposalsActions } from "./actions.ts";

const service = "better_proposals";

export const provider: ProviderDefinition = {
  service,
  displayName: "Better Proposals",
  categories: ["Productivity", "Communication"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "better_proposals_api_key",
      description:
        "Better Proposals API key sent with the Bptoken header. Find your key in Better Proposals after enabling API access: https://betterproposals.io/resources/api/.",
    },
  ],
  homepageUrl: "https://betterproposals.io",
  actions: betterProposalsActions,
};
