import type { ProviderDefinition } from "../../core/types.ts";

import { linkedinActions, linkedinOAuthScopes } from "./actions.ts";

const service = "linkedin";

export const provider: ProviderDefinition = {
  service,
  displayName: "LinkedIn",
  categories: ["Social", "Marketing"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      scopes: linkedinOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://www.linkedin.com",
  actions: linkedinActions,
};
