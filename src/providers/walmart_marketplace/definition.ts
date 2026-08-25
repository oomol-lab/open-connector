import type { ProviderDefinition } from "../../core/types.ts";

import { walmartMarketplaceActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "walmart_marketplace",
  displayName: "Walmart Marketplace",
  categories: ["Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "clientId",
          inputType: "text",
          label: "Client ID",
          required: true,
          secret: false,
          placeholder: "Walmart Marketplace Client ID",
          description:
            "The Client ID for a seller-owned Walmart Marketplace application: https://developer.walmart.com/",
        },
        {
          key: "clientSecret",
          inputType: "password",
          label: "Client Secret",
          required: true,
          secret: true,
          placeholder: "Walmart Marketplace Client Secret",
          description: "The Client Secret paired with the seller application Client ID.",
        },
      ],
    },
  ],
  homepageUrl: "https://marketplace.walmart.com",
  actions: walmartMarketplaceActions,
};
