import type { ProviderDefinition } from "../../core/types.ts";

import { googleAnalyticsActions } from "./actions.ts";
import { googleAnalyticsOAuthScopes } from "./scopes.ts";

const service = "google_analytics";

/**
 * Google Analytics provider backed by the Google Analytics Admin and Data APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Analytics",
  categories: ["Data", "Marketing"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["openid", "email", "profile"],
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleAnalyticsOAuthScopes,
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
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the Google Analytics API for its project and grant the service account access in Analytics (for example through user management), or use domain-wide delegation below.",
        },
        {
          key: "subject",
          label: "Subject Email (optional)",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Optional Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the Analytics scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://analytics.google.com",
  actions: googleAnalyticsActions,
};
