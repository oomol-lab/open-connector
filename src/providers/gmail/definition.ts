import type { ProviderDefinition } from "../../core/types.ts";

import { gmailActions } from "./actions.ts";
import { gmailAuthorizableScopes, gmailOptionalScopes } from "./scopes.ts";
import { snapshot as triggerSnapshot0_0 } from "./trigger-on-message-received.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "gmail";

/**
 * Gmail provider backed by the Gmail API and user-provided Google OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Gmail",
  categories: ["Productivity"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revocationUrl: "https://oauth2.googleapis.com/revoke",
      scopes: gmailAuthorizableScopes,
      optionalScopes: gmailOptionalScopes,
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
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the Gmail API for its project. A service account has no mailbox of its own, so pair it with domain-wide delegation below.",
        },
        {
          key: "subject",
          label: "Subject Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the Gmail scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://mail.google.com",
  actions: gmailActions,
  triggers: [triggerSnapshot0_0],
  triggerPermissions,
};
