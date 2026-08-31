import type { ProviderDefinition } from "../../core/types.ts";

import { cloudflareR2Actions } from "./actions.ts";

const service = "cloudflare_r2";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cloudflare R2",
  categories: ["Storage", "Developer Tools"],
  authTypes: ["custom_credential", "oauth2"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "apiKey",
          label: "API Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "cloudflare_api_token",
          description:
            "Cloudflare API token sent as a Bearer token. Create one from the Cloudflare API Tokens page: https://dash.cloudflare.com/profile/api-tokens",
        },
        {
          key: "accountId",
          label: "Account ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "023e105f4ecef8ad9ca31a8372d0c353",
          description:
            "Cloudflare account ID used for R2 bucket management. Find it in the Cloudflare dashboard or account ID docs: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/",
        },
      ],
    },
    {
      type: "oauth2",
      authorizationUrl: "https://dash.cloudflare.com/oauth2/auth",
      tokenUrl: "https://dash.cloudflare.com/oauth2/token",
      refreshTokenUrl: "https://dash.cloudflare.com/oauth2/token",
      scopes: ["offline_access", "workers-r2.read", "workers-r2.write"],
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://www.cloudflare.com/developer-platform/products/r2/",
  actions: cloudflareR2Actions,
};
