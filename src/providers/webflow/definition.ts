import type { ProviderDefinition } from "../../core/types.ts";

import { webflowActions } from "./actions.ts";
import { webflowOAuthScopes } from "./scopes.ts";

const service = "webflow";

export const provider: ProviderDefinition = {
  service,
  displayName: "Webflow",
  categories: ["Design & Media", "Marketing"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://webflow.com/oauth/authorize",
      tokenUrl: "https://api.webflow.com/oauth/access_token",
      scopes: webflowOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "API Token",
      placeholder: "WEBFLOW_API_TOKEN",
      description:
        "Webflow Data API token sent as a Bearer token. Create or manage API tokens from Webflow Apps & Integrations: https://app.webflow.com/dashboard/apps.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://webflow.com",
  actions: webflowActions,
};
