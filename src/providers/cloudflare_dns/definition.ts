import type { ProviderDefinition } from "../../core/types.ts";

import { cloudflareDnsActions } from "./actions.ts";

const service = "cloudflare_dns";

export const provider: ProviderDefinition = {
  service,
  displayName: "Cloudflare DNS",
  categories: ["Developer Tools", "Security"],
  authTypes: ["api_key", "oauth2"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "cloudflare_api_token",
      description:
        "Cloudflare API token sent as a Bearer token. Create one from the Cloudflare API Tokens page: https://dash.cloudflare.com/profile/api-tokens",
      extraFields: [],
    },
    {
      type: "oauth2",
      authorizationUrl: "https://dash.cloudflare.com/oauth2/auth",
      tokenUrl: "https://dash.cloudflare.com/oauth2/token",
      refreshTokenUrl: "https://dash.cloudflare.com/oauth2/token",
      scopes: ["offline_access", "zone.read", "dns.read", "dns.write"],
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://www.cloudflare.com",
  actions: cloudflareDnsActions,
};
