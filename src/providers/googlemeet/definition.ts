import type { ProviderDefinition } from "../../core/types.ts";

import { googleMeetActions } from "./actions.ts";
import { googleMeetAuthorizationUrl, googleMeetHomepageUrl, googleMeetTokenUrl } from "./constants.ts";
import { googleMeetOAuthScopes } from "./scopes.ts";

const service = "googlemeet";

/**
 * Google Meet provider backed by the Meet REST API and a user-provided Google OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Meet",
  description:
    "Create and manage Google Meet spaces, then read conference records, participants, recordings, transcripts, and smart notes.",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["openid", "email", "profile"],
      authorizationUrl: googleMeetAuthorizationUrl,
      tokenUrl: googleMeetTokenUrl,
      scopes: googleMeetOAuthScopes,
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
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the Meet API for its project. Meet spaces belong to Workspace users, so use domain-wide delegation below to act as the user who owns the meetings.",
        },
        {
          key: "subject",
          label: "Subject Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the Meet scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: googleMeetHomepageUrl,
  actions: googleMeetActions,
};
