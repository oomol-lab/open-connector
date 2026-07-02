import type { ProviderDefinition } from "../../core/types.ts";

import { hubspotActions } from "./actions.ts";
import { hubspotOAuthScopes } from "./scopes.ts";

const service = "hubspot";

/**
 * HubSpot provider backed by HubSpot OAuth and CRM v3 APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "HubSpot",
  categories: ["Marketing", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v3/token",
      scopes: hubspotOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "form",
      authorizationParams: {},
    },
  ],
  homepageUrl: "https://www.hubspot.com",
  actions: hubspotActions,
};
