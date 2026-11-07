import type { ProviderDefinition } from "../../core/types.ts";

import { karbonActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "karbon",
  displayName: "Karbon",
  description: "Search accounting clients, read contact details and inspect practice settings",
  categories: ["Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Authorization Token",
      description:
        "Create an API application in Karbon Settings > Connected Apps > API Applications and paste its Authorization token (GUID). API access requires a Business or Enterprise plan: https://developers.karbonhq.com/guides/authentication/",
      extraFields: [
        {
          key: "accessKey",
          label: "Access Key",
          required: true,
          secret: true,
          description:
            "Paste the AccessKey (JWT) from the same Karbon API application as the Authorization token: https://developers.karbonhq.com/guides/authentication/",
          inputType: "password",
        },
      ],
    },
  ],
  homepageUrl: "https://karbonhq.com/",
  actions: karbonActions,
};
