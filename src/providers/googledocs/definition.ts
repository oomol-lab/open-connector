import type { ProviderDefinition } from "../../core/types.ts";

import { googledocsActions } from "./actions.ts";
import { googledocsOAuthScopes } from "./scopes.ts";

const service = "googledocs";

/**
 * Google Docs provider backed by Google Docs, Drive, and Sheets APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Docs",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googledocsOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://workspace.google.com/products/docs/",
  actions: googledocsActions,
};
