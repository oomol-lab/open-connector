import type { ProviderDefinition } from "../../core/types.ts";

import { googleTasksActions } from "./actions.ts";
import { googleTasksOAuthScopes } from "./scopes.ts";

const service = "googletasks";

export const provider: ProviderDefinition = {
  service,
  displayName: "Google Tasks",
  categories: ["Productivity"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["openid", "email", "profile"],
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleTasksOAuthScopes,
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
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the Tasks API for its project. Task lists belong to users, so use domain-wide delegation below to act as a Workspace user.",
        },
        {
          key: "subject",
          label: "Subject Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the Tasks scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://tasks.google.com",
  actions: googleTasksActions,
};
