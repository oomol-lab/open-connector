import type { ProviderDefinition } from "../../core/types.ts";

import { shopeeActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "shopee",
  displayName: "Shopee",
  description: "Manage Shopee products, orders, logistics, returns, and merchant data.",
  categories: ["E-commerce"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "{+authorizationBaseUrl}/auth",
      tokenUrl: "{+apiBaseUrl}/api/v2/auth/token/get",
      refreshTokenUrl: "{+apiBaseUrl}/api/v2/auth/access_token/get",
      scopes: ["all"],
      tokenEndpointAuthMethod: "none",
      authorizationParams: { auth_type: "seller" },
      authorizationRequestFields: { clientId: "partner_id", scope: false },
      clientConfigFields: [
        {
          key: "authorizationBaseUrl",
          label: "Authorization Base URL",
          required: true,
          secret: false,
          inputType: "text",
          location: "extra",
          defaultValue: "https://open.shopee.cn",
          description:
            "Use https://open.shopee.cn for production or https://open.sandbox.test-stable.shopee.cn for sandbox.",
        },
        {
          key: "apiBaseUrl",
          label: "API Base URL",
          required: true,
          secret: false,
          inputType: "text",
          location: "extra",
          defaultValue: "https://partner.shopeemobile.com",
          description:
            "Use https://partner.shopeemobile.com for production or https://openplatform.sandbox.test-stable.shopee.sg for sandbox.",
        },
      ],
      clientSetup: {
        docsUrl: "https://open.shopee.com/",
        steps: [
          "Create a Shopee Open Platform app and register the callback URL shown below.",
          "Copy the Partner ID into Client ID and the Partner Key into Client Secret.",
          "Keep both endpoint fields on production, or switch both to their documented sandbox values.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.shopee.com/",
  actions: shopeeActions,
};
