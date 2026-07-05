import type { ProviderDefinition } from "../../core/types.ts";

import { freshteamActions } from "./actions.ts";

const service = "freshteam";

export const provider: ProviderDefinition = {
  service,
  displayName: "Freshteam",
  categories: ["Productivity", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FRESHTEAM_API_KEY",
      description:
        "Freshteam API key sent as a Bearer token. Copy it from Freshteam API Settings as documented by Freshworks: https://developers.freshteam.com/api/#authentication.",
      extraFields: [
        {
          key: "domain",
          label: "Domain",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your-company",
          description: "Freshteam account domain used to build https://<domain>.freshteam.com API requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.freshworks.com/freshteam/",
  actions: freshteamActions,
};
