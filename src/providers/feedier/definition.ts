import type { ProviderDefinition } from "../../core/types.ts";

import { feedierActions } from "./actions.ts";

const service = "feedier";

export const provider: ProviderDefinition = {
  service,
  displayName: "Feedier",
  categories: ["Data", "Marketing"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Private API Key",
      placeholder: "FEEDIER_PRIVATE_API_KEY",
      description:
        "Feedier private API key sent as a Bearer token. Create or view it in Organization Settings > API: https://dashboard.feedier.com.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.feedier.ai",
  actions: feedierActions,
};
