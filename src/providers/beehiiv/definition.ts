import type { ProviderDefinition } from "../../core/types.ts";

import { beehiivActions } from "./actions.ts";

const service = "beehiiv";

export const provider: ProviderDefinition = {
  service,
  displayName: "Beehiiv",
  categories: ["Marketing", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "beehiiv_api_key",
      description:
        "Beehiiv API key used as a bearer token. Create it from Settings > Integrations > API in your Beehiiv account: https://developers.beehiiv.com/welcome/create-an-api-key.",
    },
  ],
  homepageUrl: "https://www.beehiiv.com",
  actions: beehiivActions,
};
