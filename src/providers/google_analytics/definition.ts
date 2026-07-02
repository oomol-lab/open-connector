import type { ProviderDefinition } from "../../core/types.ts";

import { googleAnalyticsActions } from "./actions.ts";
import { googleAnalyticsOAuthScopes } from "./scopes.ts";

const service = "google_analytics";

/**
 * Google Analytics provider backed by the Google Analytics Admin and Data APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Analytics",
  categories: ["Data", "Marketing"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleAnalyticsOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://analytics.google.com",
  actions: googleAnalyticsActions,
};
