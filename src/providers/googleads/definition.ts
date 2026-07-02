import type { ProviderDefinition } from "../../core/types.ts";

import { googleAdsActions } from "./actions.ts";
import { googleAdsOAuthScopes } from "./scopes.ts";

const service = "googleads";

export const provider: ProviderDefinition = {
  service,
  displayName: "Google Ads",
  categories: ["Marketing", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleAdsOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
      clientConfigFields: [
        {
          key: "customerId",
          label: "Customer ID",
          inputType: "text",
          required: true,
          secret: false,
          description: "The Google Ads customer ID used by most read and mutate requests.",
        },
        {
          key: "developerToken",
          label: "Developer Token",
          inputType: "password",
          required: true,
          secret: true,
          location: "secretExtra",
          description: "The Google Ads API developer token sent as the developer-token header.",
        },
      ],
    },
  ],
  homepageUrl: "https://ads.google.com",
  actions: googleAdsActions,
};
