import type { ProviderDefinition } from "../../core/types.ts";

import { microsoftTeamsActions } from "./actions.ts";
import { microsoftTeamsOAuthScopes } from "./scopes.ts";

/**
 * Microsoft Teams provider backed by Microsoft Graph collaboration APIs.
 */
export const provider: ProviderDefinition = {
  service: "microsoft_teams",
  displayName: "Microsoft Teams",
  description: "Read Microsoft Teams collaboration data and send channel or chat messages.",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
      scopes: microsoftTeamsOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      pkce: { method: "S256" },
      authorizationParams: { response_mode: "query" },
      clientConfigFields: [
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
          defaultValue: "organizations",
          placeholder: "organizations",
          description: "The Microsoft identity platform organization tenant segment or a specific tenant ID.",
        },
      ],
      clientSetup: {
        docsUrl: "https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app",
        steps: [
          "Register a multitenant web application in Microsoft Entra ID and add the callback URL shown by this runtime.",
          "Add the Microsoft Graph delegated permissions listed by this provider; ChannelMessage.Read.All requires tenant administrator consent.",
          "Create a client secret and save its value with the application client ID in this runtime.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.microsoft.com/microsoft-teams/",
  actions: microsoftTeamsActions,
};
