import type { ProviderDefinition } from "../../core/types.ts";

import { granolaActions } from "./actions.ts";
import { granolaMcpEndpoint, granolaOAuthIssuer } from "./endpoints.ts";

const service = "granola";

export const provider: ProviderDefinition = {
  service,
  displayName: "Granola",
  categories: ["AI", "Productivity"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: `${granolaOAuthIssuer}/oauth2/authorize`,
      tokenUrl: `${granolaOAuthIssuer}/oauth2/token`,
      scopes: ["openid", "profile", "email", "offline_access"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationParams: { resource: granolaMcpEndpoint },
      clientSetup: {
        docsUrl: "https://docs.granola.ai/help-center/sharing/integrations/mcp",
        steps: [
          "Copy the Callback URL shown below.",
          'POST {"client_name":"Open Connector","redirect_uris":["<Callback URL>"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none","scope":"openid profile email offline_access"} as JSON to https://mcp-auth.granola.ai/oauth2/register.',
          "Copy the returned client_id into the Client ID field below and leave Client Secret empty.",
          "Connect with OAuth for MCP access. The free plan covers personal notes from the last 30 days; some tools require a paid plan.",
        ],
      },
    },
    {
      type: "api_key",
      label: "API Key",
      placeholder: "granola_api_key",
      description:
        "For Granola REST API actions on Business or Enterprise plans. Create a key in Granola Settings > Connectors > API keys. Use OAuth for MCP access, including the free plan: https://docs.granola.ai/help-center/sharing/integrations/granola-api.",
    },
  ],
  homepageUrl: "https://www.granola.ai",
  actions: granolaActions,
};
