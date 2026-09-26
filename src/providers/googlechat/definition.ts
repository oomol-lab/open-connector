import type { ProviderDefinition } from "../../core/types.ts";

import { googleChatActions } from "./actions.ts";
import { googleChatOAuthScopes } from "./scopes.ts";

const service = "googlechat";

/**
 * Google Chat provider backed by the Chat API and a user-provided Google OAuth app.
 *
 * Scoped to space and message history reads plus plain-text message creation,
 * which is what the Chat API supports under user authentication. Message
 * creation uses the Sensitive-tier chat.messages.create scope rather than the
 * Restricted-tier chat.messages, so update, delete, and reaction access is never
 * requested.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Google Chat",
  description:
    "Read Google Chat spaces and message history, name members and message senders through the Workspace directory, and send plain-text messages, as the authenticated Google Workspace user. Sending and naming require an OAuth user connection: service account connections only read spaces and messages.",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2", "custom_credential"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleChatOAuthScopes,
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
            "The complete service account key JSON from Google Cloud Console (IAM & Admin > Service Accounts > Keys). Enable the Chat API for its project. Chat spaces belong to Workspace users, so use domain-wide delegation below to act as a user who can read them.",
        },
        {
          key: "subject",
          label: "Subject Email",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "user@your-domain.com",
          description:
            "Workspace user to impersonate through domain-wide delegation. In the Workspace Admin console (Security > Access and data control > API Controls > Domain-wide Delegation), grant the service account client ID the Chat scopes this provider requests.",
        },
      ],
    },
  ],
  homepageUrl: "https://workspace.google.com/products/chat/",
  actions: googleChatActions,
};
