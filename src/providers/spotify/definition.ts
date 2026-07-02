import type { ProviderDefinition } from "../../core/types.ts";

import { spotifyActions } from "./actions.ts";
import { spotifyOAuthScopes } from "./scopes.ts";

const service = "spotify";

export const provider: ProviderDefinition = {
  service,
  displayName: "Spotify",
  categories: ["Design", "Social"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.spotify.com/authorize",
      tokenUrl: "https://accounts.spotify.com/api/token",
      scopes: spotifyOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://spotify.com",
  actions: spotifyActions,
};
