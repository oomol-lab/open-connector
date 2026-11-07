import type { ProviderDefinition } from "../../core/types.ts";

import { amazonSpApiActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "amazon_sp_api",
  displayName: "Amazon Selling Partner API",
  description: "Search Amazon catalogs, maintain seller listings, and review FBA inventory",
  categories: ["Cross-border E-commerce"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://sellercentral.amazon.com/apps/authorize/consent",
      tokenUrl: "https://api.amazon.com/auth/o2/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestCallbackParameters: ["selling_partner_id"],
      clientConfigFields: [
        {
          key: "applicationId",
          label: "SP-API Application ID",
          inputType: "text",
          required: true,
          description:
            "Public SP-API application ID from https://solutionproviderportal.amazon.com/. Use the matching LWA Client ID and Client Secret and register this runtime callback URL.",
          secret: false,
        },
        {
          key: "country",
          label: "Seller Central country",
          inputType: "text",
          required: false,
          defaultValue: "US",
          description: "Seller Central country code. Connect each selling region separately.",
          secret: false,
        },
        {
          key: "version",
          label: "Draft application version",
          inputType: "text",
          required: false,
          description: "beta for a draft application; leave empty for a published application.",
          secret: false,
        },
      ],
    },
  ],
  homepageUrl: "https://developer.amazonservices.com/",
  actions: amazonSpApiActions,
};
