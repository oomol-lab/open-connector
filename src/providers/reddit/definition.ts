import type { ProviderDefinition } from "../../core/types.ts";

import { redditActions } from "./actions.ts";
import { redditOAuthScopes } from "./scopes.ts";

const service = "reddit";

/** Reddit provider backed by the official OAuth Data API. */
export const provider: ProviderDefinition = {
  service,
  displayName: "Reddit",
  description: "Search and read Reddit discussions, and manage posts or comments for the authenticated user.",
  categories: ["Social", "Marketing"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://www.reddit.com/api/v1/authorize",
      tokenUrl: "https://www.reddit.com/api/v1/access_token",
      scopes: redditOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
      authorizationParams: {
        duration: "permanent",
      },
      clientSetup: {
        docsUrl: "https://www.reddit.com/prefs/apps",
        steps: [
          "Create a Reddit web application and register the Callback URL shown below as its redirect URI.",
          "Copy the application's Client ID and Client Secret into the fields below.",
          "Review Reddit's Developer Terms and Data API Terms before using the connection.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.reddit.com",
  actions: redditActions,
};
