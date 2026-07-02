import type { ProviderDefinition } from "../../core/types.ts";

import { stravaActions } from "./actions.ts";

const service = "strava";

const stravaOauthScopes = [
  "read",
  "read_all",
  "profile:read_all",
  "profile:write",
  "activity:read",
  "activity:read_all",
  "activity:write",
];

export const provider: ProviderDefinition = {
  service,
  displayName: "Strava",
  categories: ["Social"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://www.strava.com/oauth/authorize",
      tokenUrl: "https://www.strava.com/oauth/token",
      scopes: stravaOauthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        approval_prompt: "auto",
      },
    },
  ],
  homepageUrl: "https://www.strava.com",
  actions: stravaActions,
};
