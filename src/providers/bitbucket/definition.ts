import type { ProviderDefinition } from "../../core/types.ts";

import { bitbucketActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "bitbucket",
  displayName: "Bitbucket",
  categories: ["Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://bitbucket.org/site/oauth2/authorize",
      tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
      scopes: [
        "account",
        "project",
        "repository",
        "repository:write",
        "repository:delete",
        "pullrequest",
        "pullrequest:write",
        "issue",
        "issue:write",
        "snippet",
        "pipeline",
        "pipeline:write",
        "pipeline:variable",
        "runner",
      ],
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://bitbucket.org",
  actions: bitbucketActions,
};
