import type { ProviderDefinition } from "../../core/types.ts";

import { actions } from "./actions.ts";
import { cloudflareAuthorizationOptions, cloudflareDefaultScopes } from "./authorization.ts";

export const provider: ProviderDefinition = {
  service: "cloudflare",
  displayName: "Cloudflare",
  description: "Deploy websites and Workers, manage DNS, KV, R2, email routing, and browser rendering.",
  categories: ["Developer Tools", "Storage"],
  homepageUrl: "https://www.cloudflare.com",
  authTypes: ["api_key", "oauth2", "custom_credential"],
  auth: [
    {
      type: "custom_credential",
      label: "Global API Key or API Token",
      fields: [
        {
          key: "email",
          label: "Cloudflare Account Email",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "you@example.com",
          description: "Account email for Global API Key authentication. Leave blank when using an API token.",
        },
        {
          key: "apiKey",
          label: "Cloudflare API Credential",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "cloudflare_global_api_key",
          description:
            "Use a Global API Key with the account email, or a prefixed API token. Obtain credentials at https://dash.cloudflare.com/profile/api-tokens. Supported operations and permissions are checked by Cloudflare.",
        },
        {
          key: "accountId",
          label: "Cloudflare Account ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "32-character Cloudflare account ID",
          description: "Default account ID for account-scoped actions. Action inputs may override it.",
        },
        {
          key: "zoneId",
          label: "Cloudflare Zone ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "32-character Cloudflare zone ID",
          description: "Default zone ID for routing rule actions. Action inputs may override it.",
        },
      ],
    },
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
            "Optional default account for account-scoped actions and account-owned token verification. An action accountId overrides this default. Find it at https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/.",
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
