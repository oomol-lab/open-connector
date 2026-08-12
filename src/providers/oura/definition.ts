import type { ProviderDefinition } from "../../core/types.ts";

import { ouraActions } from "./actions.ts";
import { ouraOauthScopes } from "./collections.ts";

const service = "oura";

export const provider: ProviderDefinition = {
  service,
  displayName: "Oura",
  description: "Read Oura Ring sleep, readiness, activity, and biometric data from the Oura API v2 user collections.",
  categories: ["Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://cloud.ouraring.com/oauth/authorize",
      tokenUrl: "https://api.ouraring.com/oauth/token",
      scopes: ouraOauthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "oura_personal_access_token",
      description:
        "Oura personal access token sent as an Authorization Bearer header. Create one at https://cloud.ouraring.com/personal-access-tokens. A personal access token reads only its own account and is not scoped, so it grants every collection this provider exposes.",
    },
  ],
  homepageUrl: "https://ouraring.com",
  actions: ouraActions,
};
