import type { ProviderDefinition } from "../../core/types.ts";

import { airtableActions } from "./actions.ts";
import { airtableOAuthScopes } from "./scopes.ts";

const service = "airtable";

/**
 * Airtable provider backed by the Airtable Web API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Airtable",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://airtable.com/oauth2/v1/authorize",
      tokenUrl: "https://airtable.com/oauth2/v1/token",
      scopes: airtableOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
      pkce: {
        method: "S256",
      },
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "patXXXXXXXXXXXXXX",
      description:
        "Airtable personal access token used with the Authorization Bearer header. Create it in the Airtable developer hub at https://airtable.com/create/tokens.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://airtable.com",
  actions: airtableActions,
};
