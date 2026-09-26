import type { ProviderDefinition } from "../../core/types.ts";

import { microsoftTeamsActions } from "./actions.ts";
import { microsoftTeamsOAuthScopes } from "./scopes.ts";

/**
 * Microsoft Teams provider backed by Microsoft Graph collaboration APIs.
 */
export const provider: ProviderDefinition = {
  service: "microsoft_teams",
  displayName: "Microsoft Teams",
  description: "Read collaboration data and send channel or chat messages for Microsoft work or school accounts.",
  categories: ["Communication", "Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
      scopes: microsoftTeamsOAuthScopes,
      tokenEndpointAuthMethod: "none",
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
          "Register a multitenant application in Microsoft Entra ID.",
          "Add the Microsoft Graph delegated permissions listed by this provider; ChannelMessage.Read.All requires tenant administrator consent.",
          "Add the Mobile and desktop applications platform with the callback URL shown by this runtime and allow public client flows; the runtime redeems codes with PKCE, so save only the application client ID and leave Client Secret empty.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.microsoft.com/microsoft-teams/",
  actions: microsoftTeamsActions,
};
