import type { ProviderDefinition } from "../../core/types.ts";

import { apiSportsActions } from "./actions.ts";

const service = "api_sports";

export const provider: ProviderDefinition = {
  service,
  displayName: "API-SPORTS",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "api_sports_api_key",
      description:
        "API-SPORTS API key sent with the x-apisports-key header. Sign up and manage it from the official API-SPORTS dashboard: https://api-sports.io/.",
    },
  ],
  homepageUrl: "https://api-sports.io",
  actions: apiSportsActions,
};
