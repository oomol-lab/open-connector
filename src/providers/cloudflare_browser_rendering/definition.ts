import type { ProviderDefinition } from "../../core/types.ts";

import { cloudflareBrowserRenderingActions } from "./actions.ts";

const service = "cloudflare_browser_rendering";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cloudflare Browser Run",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key", "oauth2"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "CLOUDFLARE_API_TOKEN",
      description:
        "Cloudflare API token used with the Authorization Bearer header. Create a custom token with Browser Rendering - Edit permission from https://dash.cloudflare.com/profile/api-tokens/.",
      extraFields: [
        {
          key: "accountId",
          label: "Account ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "CLOUDFLARE_ACCOUNT_ID",
          description:
            "Cloudflare account ID used in Browser Run API paths. Find it from https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/.",
        },
      ],
    },
    {
      type: "oauth2",
      authorizationUrl: "https://dash.cloudflare.com/oauth2/auth",
      tokenUrl: "https://dash.cloudflare.com/oauth2/token",
      refreshTokenUrl: "https://dash.cloudflare.com/oauth2/token",
      scopes: ["offline_access", "memberships.read", "browser-rendering.read", "browser-rendering.write"],
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://developers.cloudflare.com/browser-run/",
  actions: cloudflareBrowserRenderingActions,
};
