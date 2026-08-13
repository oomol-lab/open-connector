import type { ProviderDefinition } from "../../core/types.ts";

import { ouraActions } from "./actions.ts";
import { ouraOauthScopes } from "./collections.ts";

const service = "oura";

export const provider: ProviderDefinition = {
  service,
  displayName: "Oura",
  description: "Read Oura Ring sleep, readiness, activity, and biometric data from the Oura API v2 user collections.",
  categories: ["Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://cloud.ouraring.com/oauth/authorize",
      tokenUrl: "https://api.ouraring.com/oauth/token",
      scopes: ouraOauthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://ouraring.com",
  actions: ouraActions,
};
