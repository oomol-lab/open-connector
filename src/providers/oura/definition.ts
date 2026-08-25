import type { ProviderDefinition } from "../../core/types.ts";

import { ouraActions } from "./actions.ts";
import { ouraOauthScopes } from "./collections.ts";

const service = "oura";

export const provider: ProviderDefinition = {
  service,
  displayName: "Oura",
  description: "Read Oura Ring sleep, readiness, activity, and biometric data from the Oura API v2 user collections.",
  categories: ["Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://cloud.ouraring.com/oauth/authorize",
      tokenUrl: "https://api.ouraring.com/oauth/token",
      scopes: ouraOauthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      clientSetup: {
        docsUrl: "https://developer.ouraring.com/",
        steps: [
          "Sign in with the Oura account that owns the app and create a new application.",
          "Copy the Callback URL below into the application's Redirect URI field; Oura requires an exact match.",
          "Enable every scope this runtime requests. Oura silently drops scopes the application does not enable, and actions that need them fail with 401 at run time.",
          "Copy the generated Client ID and Client Secret into the fields below.",
        ],
      },
    },
  ],
  homepageUrl: "https://ouraring.com",
  actions: ouraActions,
};
