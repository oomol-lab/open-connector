import type { ProviderDefinition } from "../../core/types.ts";

import { todoistActions } from "./actions.ts";
import { todoistOAuthScopes } from "./scopes.ts";

const service = "todoist";

export const provider: ProviderDefinition = {
  service,
  displayName: "Todoist",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://app.todoist.com/oauth/authorize",
      tokenUrl: "https://api.todoist.com/oauth/access_token",
      scopes: todoistOAuthScopes,
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Access Token",
      placeholder: "todoist_access_token",
      description:
        "Paste a Todoist OAuth access token or personal API token. It is sent with the Authorization Bearer header.",
    },
  ],
  homepageUrl: "https://todoist.com",
  actions: todoistActions,
};
