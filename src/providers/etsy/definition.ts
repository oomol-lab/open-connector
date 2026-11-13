import type { ProviderDefinition } from "../../core/types.ts";

import { etsyActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "etsy",
  displayName: "Etsy",
  description: "Review shop listings, inventory, and orders, and record shipments",
  categories: ["Cross-border E-commerce"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["shops_r"],
      authorizationUrl: "https://www.etsy.com/oauth/connect",
      tokenUrl: "https://api.etsy.com/v3/public/oauth/token",
      scopes: ["shops_r", "listings_r", "transactions_r", "transactions_w"],
      authorizationOptions: [
        "address_r",
        "address_w",
        "email_r",
        "listings_d",
        "listings_w",
        "profile_r",
        "profile_w",
        "shops_w",
      ].map((id) => ({ id, label: id, description: "", risk: "standard" as const })),
      tokenEndpointAuthMethod: "none",
      pkce: {
        method: "S256",
      },
      clientConfigFields: [
        {
          key: "sharedSecret",
          label: "Shared Secret",
          inputType: "password",
          required: true,
          secret: true,
          description:
            "App shared secret from https://www.etsy.com/developers/your-apps; use the matching keystring as Client ID.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.etsy.com",
  actions: etsyActions,
};
