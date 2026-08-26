import type { ProviderDefinition } from "../../core/types.ts";

import { indeedActions } from "./actions.ts";

const scopes = ["email", "offline_access", "employer_access", "employer.hosted_job"];

export const provider: ProviderDefinition = {
  service: "indeed",
  displayName: "Indeed",
  categories: ["Human Resources"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://secure.indeed.com/oauth/v2/authorize",
      tokenUrl: "https://apis.indeed.com/oauth/v2/tokens",
      scopes,
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: { method: "S256" },
      authorizationParams: { prompt: "select_employer" },
      tokenRequestCallbackParameters: ["employer"],
      clientSetup: {
        docsUrl: "https://docs.indeed.com/authentication/auth-3-legged-oauth",
        steps: [
          "Become an Indeed partner and register an application in Partner Console.",
          "Add the callback URL shown here to the application's registered redirect URLs.",
          "Request approval for the employer and hosted-job scopes used by these actions.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.indeed.com",
  actions: indeedActions,
};
