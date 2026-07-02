import type { ProviderDefinition } from "../../core/types.ts";

import { workdayActions } from "./actions.ts";
import { workdayOAuthScopes } from "./scopes.ts";

const service = "workday";

export const provider: ProviderDefinition = {
  service,
  displayName: "Workday",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "{+baseUrl}/ccx/oauth2/{tenant}/authorize",
      tokenUrl: "{+baseUrl}/ccx/oauth2/{tenant}/token",
      refreshTokenUrl: "{+baseUrl}/ccx/oauth2/{tenant}/token",
      scopes: workdayOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      clientConfigFields: [
        {
          key: "baseUrl",
          label: "Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://wd5-impl-services1.workday.com",
          description:
            "The Workday tenant base URL used for OAuth and API requests, for example https://wd5-impl-services1.workday.com.",
        },
        {
          key: "tenant",
          label: "Tenant",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "your_tenant",
          description: "The Workday tenant path segment used in OAuth and REST API URLs, for example your_tenant.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.workday.com",
  actions: workdayActions,
};
