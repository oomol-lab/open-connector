import type { ProviderDefinition } from "../../core/types.ts";

import { googleTasksActions } from "./actions.ts";
import { googleTasksOAuthScopes } from "./scopes.ts";

const service = "googletasks";

export const provider: ProviderDefinition = {
  service,
  displayName: "Google Tasks",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleTasksOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://tasks.google.com",
  actions: googleTasksActions,
};
