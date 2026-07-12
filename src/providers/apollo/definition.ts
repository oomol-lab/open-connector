import type { ProviderDefinition } from "../../core/types.ts";

import { apolloActions } from "./actions.ts";

const service = "apollo";

export const provider: ProviderDefinition = {
  service,
  displayName: "Apollo",
  categories: ["Marketing", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "APOLLO_API_KEY",
      description:
        "Apollo API key sent with the x-api-key header. Create it in Settings > Integrations > API Keys: https://docs.apollo.io/docs/create-api-key. The first-pass actions require a master API key.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.apollo.io",
  actions: apolloActions,
};
