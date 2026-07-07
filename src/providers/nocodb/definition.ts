import type { ProviderDefinition } from "../../core/types.ts";

import { nocodbActions } from "./actions.ts";

const service = "nocodb";

export const provider: ProviderDefinition = {
  service,
  displayName: "NocoDB",
  categories: ["Data", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "nc_pat_...",
      description:
        "NocoDB API token sent in the xc-token header. Create or copy a personal API token from your NocoDB account settings: https://docs.nocodb.com/product-docs/account-settings/api-tokens.",
      extraFields: [
        {
          key: "baseUrl",
          label: "NocoDB Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://app.nocodb.com",
          description:
            "The root URL of your NocoDB Cloud or self-hosted instance, such as https://app.nocodb.com or https://nocodb.example.com.",
        },
      ],
    },
  ],
  homepageUrl: "https://nocodb.com",
  actions: nocodbActions,
};
