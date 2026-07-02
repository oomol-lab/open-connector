import type { ProviderDefinition } from "../../core/types.ts";

import { googlesheetsActions } from "./actions.ts";
import { googlesheetsOAuthScopes } from "./scopes.ts";

const service = "googlesheets";

/**
 * Google Sheets provider backed by the Google Sheets and Drive APIs with a user-provided Google OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Sheets",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googlesheetsOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://workspace.google.com/products/sheets/",
  actions: googlesheetsActions,
};
