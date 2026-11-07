import type { ProviderDefinition } from "../../core/types.ts";

import { ebayActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "ebay",
  displayName: "eBay",
  description: "Review seller orders and record shipment tracking",
  categories: ["Cross-border E-commerce"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://auth.ebay.com/oauth2/authorize",
      tokenUrl: "https://api.ebay.com/identity/v1/oauth2/token",
      scopes: [
        "https://api.ebay.com/oauth/api_scope",
        "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
        "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
      ],
      tokenEndpointAuthMethod: "client_secret_basic",
      clientConfigFields: [
        {
          key: "ruName",
          label: "RuName",
          inputType: "text",
          required: true,
          description:
            "OAuth-enabled RuName from https://developer.ebay.com/my/keys. Set its Auth accepted URL to this runtime callback URL.",
          secret: false,
        },
      ],
    },
  ],
  homepageUrl: "https://www.ebay.com",
  actions: ebayActions,
};
