import type { ProviderDefinition } from "../../core/types.ts";

import { cloudflareWorkerActions } from "./actions.ts";

const service = "cloudflare_worker";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cloudflare Worker",
  categories: ["Developer Tools"],
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
            "Cloudflare user API token or account API token sent as a Bearer token. User tokens are verified through /user/tokens/verify; account tokens are verified through the configured account ID.",
        },
        {
          key: "accountId",
          label: "Account ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "023e105f4ecef8ad9ca31a8372d0c353",
          description:
            "Cloudflare account ID used for Workers API requests. Find it in the Cloudflare dashboard or account ID docs: https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/",
        },
      ],
    },
    {
      type: "oauth2",
      authorizationUrl: "https://dash.cloudflare.com/oauth2/auth",
      tokenUrl: "https://dash.cloudflare.com/oauth2/token",
      refreshTokenUrl: "https://dash.cloudflare.com/oauth2/token",
      scopes: [
        "offline_access",
        "workers-scripts.read",
        "workers-scripts.write",
        "workers-ci.read",
        "workers-ci.write",
      ],
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://workers.cloudflare.com",
  actions: cloudflareWorkerActions,
};
