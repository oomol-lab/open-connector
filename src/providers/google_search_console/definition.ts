import type { ProviderDefinition } from "../../core/types.ts";

import { googleSearchConsoleActions } from "./actions.ts";
import { googleSearchConsoleOAuthScopes } from "./scopes.ts";

const service = "google_search_console";

/**
 * Google Search Console provider backed by the Search Console and URL Inspection APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Search Console",
  categories: ["Data", "Marketing"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["openid", "email", "profile"],
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleSearchConsoleOAuthScopes,
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
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the Search Console API for its project and verify the service account for the sites, or use domain-wide delegation below to act as a verified user.",
        },
        {
          key: "subject",
          label: "Subject Email (optional)",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Optional Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the Search Console scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://search.google.com/search-console",
  actions: googleSearchConsoleActions,
};
