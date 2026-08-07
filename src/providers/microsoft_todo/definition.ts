import type { ProviderDefinition } from "../../core/types.ts";

import { microsoftTodoActions } from "./actions.ts";
import { microsoftTodoOAuthScopes } from "./scopes.ts";

const service = "microsoft_todo";

/**
 * Microsoft To Do provider backed by the Microsoft Graph To Do APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Microsoft To Do",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
      scopes: microsoftTodoOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: {
        method: "S256",
      },
      authorizationParams: {
        response_mode: "query",
      },
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
          defaultValue: "common",
          placeholder: "common",
          description:
            "The Microsoft identity platform tenant segment to use, such as common, organizations, consumers, or a specific tenant ID.",
        },
      ],
    },
  ],
  homepageUrl: "https://to-do.office.com",
  actions: microsoftTodoActions,
};
