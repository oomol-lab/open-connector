import type { ProviderDefinition } from "../../core/types.ts";

import { edgeOneMakersActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "edgeone_makers",
  displayName: "EdgeOne Makers",
  homepageUrl: "https://edgeone.ai/zh/products/pages",
  iconUrl: "https://edgeone.ai/favicon.ico",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Makers API Token",
      placeholder: "Enter your EdgeOne Makers API Token",
      description:
        "Account-level EdgeOne Makers API Token used for projects and deployments. Create a token with an expiration time in the Makers console: https://console.cloud.tencent.com/edgeone/pages/token",
      extraFields: [
        {
          key: "region",
          inputType: "text",
          secret: false,
          label: "Region",
          required: true,
          placeholder: "china or global",
          description: "Site that issued the token. Use china for the China site or global for the international site.",
        },
      ],
    },
  ],
  actions: edgeOneMakersActions,
};
