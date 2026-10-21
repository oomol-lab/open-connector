import type { ProviderDefinition } from "../../core/types.ts";

import { clickupActions } from "./actions.ts";
import { snapshot } from "./trigger-on-task-event.definition.ts";
import { triggerPermissions } from "./trigger-permissions.ts";

const service = "clickup";

/**
 * ClickUp provider backed by the ClickUp API v2 and selected v3 endpoints.
 */
export const provider: ProviderDefinition = {
  service,
  triggers: [snapshot],
  triggerPermissions,
  displayName: "ClickUp",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://app.clickup.com/api",
      tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal API Token",
      placeholder: "clickup_personal_token",
      description:
        "ClickUp personal API token sent with the Authorization header. Generate it from Settings > Apps, or see https://developer.clickup.com/docs.",
    },
  ],
  homepageUrl: "https://clickup.com",
  actions: clickupActions,
};
