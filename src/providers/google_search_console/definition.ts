import type { ProviderDefinition } from "../../core/types.ts";

import { googleSearchConsoleActions } from "./actions.ts";
import { googleSearchConsoleOAuthScopes } from "./scopes.ts";

const service = "google_search_console";

/**
 * Google Search Console provider backed by the Search Console and URL Inspection APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Search Console",
  categories: ["Data", "Marketing"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleSearchConsoleOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://search.google.com/search-console",
  actions: googleSearchConsoleActions,
};
