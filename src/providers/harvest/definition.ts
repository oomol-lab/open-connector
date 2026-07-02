import type { ProviderDefinition } from "../../core/types.ts";

import { harvestActions } from "./actions.ts";
import { harvestOAuthScopes } from "./scopes.ts";

const service = "harvest";

export const provider: ProviderDefinition = {
  service,
  displayName: "Harvest",
  categories: ["Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://id.getharvest.com/oauth2/authorize",
      tokenUrl: "https://id.getharvest.com/api/v2/oauth2/token",
      scopes: harvestOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "harvest_pat_xxx",
      description:
        "Harvest personal access token used with the Authorization Bearer header. Create it in the Developers section of Harvest ID, where Harvest also shows your account IDs: https://help.getharvest.com/api-v2/authentication-api/authentication/authentication/",
      extraFields: [
        {
          key: "accountId",
          label: "Account ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "123456",
          description:
            "Harvest account ID sent with the Harvest-Account-Id header. Harvest shows the available account IDs after you create a personal access token in Harvest ID.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.getharvest.com",
  actions: harvestActions,
};
