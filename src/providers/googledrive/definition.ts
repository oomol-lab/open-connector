import type { ProviderDefinition } from "../../core/types.ts";

import { googledriveActions } from "./actions.ts";
import { googledriveOAuthScopes } from "./scopes.ts";

const service = "googledrive";

/**
 * Google Drive provider backed by the Google Drive API and user-provided Google OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Drive",
  categories: ["Storage", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googledriveOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://workspace.google.com/products/drive/",
  actions: googledriveActions,
};
