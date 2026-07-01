import type { ProviderDefinition } from "../../core/types.ts";

import { balldontlieWorldcupActions } from "./actions.ts";

const service = "balldontlie_worldcup";

export const provider: ProviderDefinition = {
  service,
  displayName: "BALLDONTLIE World Cup",
  categories: ["Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "BALLDONTLIE_API_KEY",
      description:
        "BALLDONTLIE API key sent in the Authorization header. Create a free account and view your API key from the official BALLDONTLIE dashboard: https://www.balldontlie.io/.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://fifa.balldontlie.io/",
  actions: balldontlieWorldcupActions,
};
