import type { ProviderDefinition } from "../../core/types.ts";

import { googleSlidesActions } from "./actions.ts";
import { googleSlidesOAuthScopes } from "./scopes.ts";

const service = "googleslides";

export const provider: ProviderDefinition = {
  service,
  displayName: "Google Slides",
  categories: ["Productivity", "Design"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleSlidesOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://workspace.google.com/products/slides/",
  actions: googleSlidesActions,
};
