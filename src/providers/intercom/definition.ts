import type { ProviderDefinition } from "../../core/types.ts";

import { intercomActions } from "./actions.ts";
import { snapshot } from "./trigger-on-conversation-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "intercom";

/**
 * Intercom provider backed by the public Intercom REST API.
 *
 * Intercom app permissions are selected in the Intercom developer app rather
 * than sent as OAuth scope query tokens.
 */
export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Intercom",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://app.intercom.com/oauth",
      tokenUrl: "https://api.intercom.io/auth/eagle/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://www.intercom.com",
  actions: intercomActions,
};
