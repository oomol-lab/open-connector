import type { ProviderDefinition } from "../../core/types.ts";

import { sunsamaMcpActions } from "./actions.ts";

const service = "sunsama_mcp";

/**
 * Sunsama provider backed by Sunsama's official remote MCP server.
 *
 * OAuth clients are public clients registered through Sunsama's dynamic client registration
 * endpoint with this deployment's callback URL. Sunsama has no self-serve OAuth app dashboard,
 * so an administrator must obtain the client id from that endpoint before users connect.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Sunsama MCP",
  description: "Work with Sunsama daily planning tasks and workflows through Sunsama's official remote MCP server.",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.sunsama.com/oauth/authorize",
      tokenUrl: "https://api.sunsama.com/oauth/token",
      refreshTokenUrl: "https://api.sunsama.com/oauth/token",
      scopes: ["read", "execute", "offline_access"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      clientSetup: {
        docsUrl: "https://help.sunsama.com/docs/integrations/mcp/",
        steps: [
          "Copy the Callback URL shown below; Sunsama requires it when registering the OAuth client.",
          'POST {"redirect_uris":["<Callback URL>"],"token_endpoint_auth_method":"none"} as JSON to https://api.sunsama.com/oauth/register.',
          "Copy the returned client_id into the Client ID field below and leave Client Secret empty.",
        ],
      },
    },
  ],
  homepageUrl: "https://help.sunsama.com/docs/integrations/mcp/",
  actions: sunsamaMcpActions,
};
