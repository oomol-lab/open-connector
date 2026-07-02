import type { ProviderDefinition } from "../../core/types.ts";

import { googlePhotosActions } from "./actions.ts";
import { googlePhotosOAuthScopes } from "./scopes.ts";

const service = "googlephotos";

export const provider: ProviderDefinition = {
  service,
  displayName: "Google Photos",
  categories: ["Storage", "Design"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googlePhotosOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://www.google.com/photos/about/",
  actions: googlePhotosActions,
};
