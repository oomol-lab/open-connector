import type { ProviderDefinition } from "../../core/types.ts";

import { futunnActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "futunn",
  displayName: "Futunn",
  description: "Read Futunn market data, research, account positions, orders, and execution fills.",
  categories: ["Finance", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://webapi.futunn.com/oauth2/authorize/confirm",
      tokenUrl: "https://webapi.futunn.com/oauth2/token",
      scopes: ["quote:read", "trade:read"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationOptions: [
        {
          id: "quote:read",
          label: "Market data",
          description: "Read market data, financial research, and content search results.",
          required: true,
          defaultSelected: true,
          risk: "standard",
        },
        {
          id: "trade:read",
          label: "Account information",
          description: "Read authorized accounts, balances, positions, orders, and execution fills.",
          required: false,
          defaultSelected: true,
          risk: "sensitive",
        },
      ],
      clientSetup: {
        docsUrl: "https://open.futunn.com/zh-cn/api/overview/getting-started",
        steps: [
          "Register an OAuth client at https://webapi.futunn.com/oauth2/register using the official getting-started guide.",
          "Include this runtime's callback URL in redirect_uris and set token_endpoint_auth_method to none.",
          "Paste the application's Client ID. Futunn PKCE applications do not require a client secret.",
        ],
      },
    },
  ],
  homepageUrl: "https://open.futunn.com",
  actions: futunnActions,
};
