import type { ProviderDefinition } from "../../core/types.ts";

import { actions } from "./actions.ts";
import { cloudflareAuthorizationOptions, cloudflareDefaultScopes } from "./authorization.ts";

export const provider: ProviderDefinition = {
  service: "cloudflare",
  displayName: "Cloudflare",
  description: "Deploy websites and Workers, manage DNS, KV, R2, email routing, and browser rendering.",
  categories: ["Developer Tools", "Storage"],
  homepageUrl: "https://www.cloudflare.com",
  authTypes: ["api_key", "oauth2"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      description:
        "Create a scoped API token at https://dash.cloudflare.com/profile/api-tokens. Select permissions for the products you use.",
      extraFields: [
        {
          key: "accountId",
          inputType: "text",
          secret: false,
          label: "Default Account ID",
          required: false,
          description:
            "Optional default account for account-scoped actions and account-owned token verification. Find it at https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/.",
        },
      ],
    },
    {
      type: "oauth2",
      authorizationUrl: "https://dash.cloudflare.com/oauth2/auth",
      tokenUrl: "https://dash.cloudflare.com/oauth2/token",
      refreshTokenUrl: "https://dash.cloudflare.com/oauth2/token",
      scopes: cloudflareDefaultScopes,
      requiredScopes: ["offline_access"],
      authorizationOptions: cloudflareAuthorizationOptions,
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  actions: actions,
};
