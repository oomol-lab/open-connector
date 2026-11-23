import type { ProviderDefinition } from "../../core/types.ts";

import { boxActions } from "./actions.ts";
import { boxOAuthScopes } from "./scopes.ts";
import { snapshot } from "./trigger-on-item-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "box";

/**
 * Box provider backed by the Box Content API and a user-provided OAuth app.
 */
export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Box",
  description: "Browse and manage files and folders in a Box account.",
  categories: ["Storage", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      scopes: boxOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "primarySignatureKey",
          label: "Primary webhook signing key",
          location: "secretExtra",
          inputType: "password",
          secret: true,
          required: false,
          description: "Primary webhook signing key from your Box app configuration.",
        },
        {
          key: "secondarySignatureKey",
          label: "Secondary webhook signing key",
          location: "secretExtra",
          inputType: "password",
          secret: true,
          required: false,
          description: "Optional secondary key for webhook signing key rotation.",
        },
      ],
      clientSetup: {
        docsUrl: "https://developer.box.com/guides/authentication/oauth2/oauth2-setup/",
        steps: [
          "Create a Custom App with OAuth 2.0 in the Box Developer Console.",
          "Enable read and write access to files and folders for the app.",
          "Add the callback URL shown by OOMOL Connect to the app's OAuth 2.0 redirect URIs.",
          "Copy the client ID and client secret into OOMOL Connect.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.box.com",
  actions: boxActions,
};
