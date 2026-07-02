import type { ProviderDefinition } from "../../core/types.ts";

import { googleBigQueryActions } from "./actions.ts";
import { googleBigQueryOAuthScopes } from "./scopes.ts";

const service = "google_bigquery";

/**
 * Google BigQuery provider backed by the BigQuery REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google BigQuery",
  categories: ["Data", "Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleBigQueryOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  ],
  homepageUrl: "https://cloud.google.com/bigquery",
  actions: googleBigQueryActions,
};
