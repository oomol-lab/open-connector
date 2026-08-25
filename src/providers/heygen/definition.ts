import type { ProviderDefinition } from "../../core/types.ts";

import { heygenActions } from "./actions.ts";

const service = "heygen";
const heygenOAuthAuthorizationUrl = "https://app.heygen.com/oauth/authorize";
const heygenOAuthTokenUrl = "https://api2.heygen.com/v1/oauth/token";
const heygenOAuthRefreshTokenUrl = "https://api2.heygen.com/v1/oauth/refresh_token";

/**
 * HeyGen provider backed by the HeyGen REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "HeyGen",
  categories: ["AI", "Design & Media"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: heygenOAuthAuthorizationUrl,
      tokenUrl: heygenOAuthTokenUrl,
      refreshTokenUrl: heygenOAuthRefreshTokenUrl,
      scopes: [],
      tokenEndpointAuthMethod: "none",
      pkce: {
        method: "S256",
      },
      authorizationRequestFields: {
        scope: false,
      },
    },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "HEYGEN_API_KEY",
      description: "HeyGen API key sent with the X-Api-Key header. Create or view API keys in HeyGen API settings.",
    },
  ],
  homepageUrl: "https://www.heygen.com",
  actions: heygenActions,
};
