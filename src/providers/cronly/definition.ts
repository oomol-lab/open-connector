import type { ProviderDefinition } from "../../core/types.ts";

import { cronlyActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "cronly",
  displayName: "Cronly",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "YOUR_CRONLY_API_TOKEN",
      description: "Cronly API token sent with Bearer authentication: https://docs.cronly.app/api/how-to-use-the-api.",
    },
  ],
  homepageUrl: "https://cronly.app/",
  actions: cronlyActions,
};
