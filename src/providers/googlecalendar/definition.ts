import type { ProviderDefinition } from "../../core/types.ts";

import { googlecalendarActions } from "./actions.ts";
import { googlecalendarOAuthScopes, googlecalendarOptionalScopes } from "./scopes.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-event-changed.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "googlecalendar";

/**
 * Google Calendar provider backed by the Calendar API and a user-provided Google OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Calendar",
  categories: ["Productivity", "Communication"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revocationUrl: "https://oauth2.googleapis.com/revoke",
      scopes: googlecalendarOAuthScopes,
      optionalScopes: googlecalendarOptionalScopes,
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
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the Calendar API for its project and share calendars with the service account email, or use domain-wide delegation below.",
        },
        {
          key: "subject",
          label: "Subject Email (optional)",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Optional Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the Calendar scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://workspace.google.com/products/calendar/",
  actions: googlecalendarActions,
  triggers: [triggerSnapshot0_0],
  triggerPermissions,
};
