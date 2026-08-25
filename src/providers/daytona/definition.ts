import type { ProviderDefinition } from "../../core/types.ts";

import { daytonaActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "daytona",
  displayName: "Daytona",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "DAYTONA_API_KEY",
      description:
        "Daytona organization API key sent as a Bearer token. Create one in the Daytona Dashboard: https://app.daytona.io/dashboard/keys",
    },
  ],
  homepageUrl: "https://www.daytona.io/",
  actions: daytonaActions,
};
