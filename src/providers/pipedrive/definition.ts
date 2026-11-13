import type { ProviderDefinition } from "../../core/types.ts";

import { pipedriveActions } from "./actions.ts";
import { snapshot } from "./trigger-on-crm-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "pipedrive";

export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "Pipedrive",
  categories: ["Productivity", "Marketing"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://oauth.pipedrive.com/oauth/authorize",
      tokenUrl: "https://oauth.pipedrive.com/oauth/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_basic",
      authorizationRequestFields: { responseType: false, scope: false },
      clientSetup: {
        docsUrl: "https://pipedrive.readme.io/docs/marketplace-oauth-authorization",
        steps: [
          "Create a Pipedrive app in the Developer Hub and open its OAuth & access scopes section.",
          "Register the callback URL shown here as the app's callback URL.",
          "Select the scopes the app needs, such as Deals, Contacts and Activities; Pipedrive takes them from the app, not from the authorization request.",
          "Copy the app's client ID and client secret and configure them here.",
        ],
      },
    },
    {
      type: "api_key",
      label: "API Token",
      placeholder: "pipedrive_api_token",
      description:
        "Pipedrive API token used with the x-api-token header. Find it in Settings > Personal preferences > API: https://pipedrive.readme.io/docs/how-to-find-the-api-token",
      extraFields: [],
    },
  ],
  homepageUrl: "https://www.pipedrive.com",
  actions: pipedriveActions,
};
