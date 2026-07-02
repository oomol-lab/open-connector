import type { ProviderDefinition } from "../../core/types.ts";

import { googleFormsActions } from "./actions.ts";
import { googleFormsOAuthScopes } from "./scopes.ts";

const service = "googleforms";

export const provider: ProviderDefinition = {
  service,
  displayName: "Google Forms",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleFormsOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://workspace.google.com/products/forms/",
  actions: googleFormsActions,
};
