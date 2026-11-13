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
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["openid", "email", "profile"],
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleBigQueryOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      authorizationParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
    {
      type: "custom_credential",
      label: "Service Account",
      description:
        "Connect with a Google Cloud service account key instead of a user account, optionally impersonating a Workspace user through domain-wide delegation.",
      fields: [
        {
          key: "serviceAccountJson",
          label: "Service Account JSON",
          inputType: "textarea",
          required: true,
          secret: true,
          placeholder: '{"type": "service_account", "project_id": "...", ...}',
          description:
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the BigQuery API for its project and grant the service account the IAM roles it needs on the projects and datasets these actions read.",
        },
        {
          key: "subject",
          label: "Subject Email (optional)",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Optional Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the BigQuery scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://cloud.google.com/bigquery",
  actions: googleBigQueryActions,
};
