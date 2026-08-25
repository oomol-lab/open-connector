import type { ProviderDefinition } from "../../core/types.ts";

import { planetScaleActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "planetscale",
  displayName: "PlanetScale",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Service Token",
      placeholder: "PLANETSCALE_SERVICE_TOKEN",
      description:
        "PlanetScale service token. Create one under Organization Settings > Service tokens: https://planetscale.com/docs/api/reference/service-tokens",
      extraFields: [
        {
          key: "serviceTokenId",
          label: "Service Token ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "PLANETSCALE_SERVICE_TOKEN_ID",
          description: "ID generated with the PlanetScale service token.",
        },
      ],
    },
  ],
  homepageUrl: "https://planetscale.com",
  actions: planetScaleActions,
};
