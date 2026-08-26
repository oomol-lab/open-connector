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
  description:
    'Work with Sunsama daily planning tasks and workflows through Sunsama\'s official remote MCP server. Sunsama has no OAuth app dashboard. Register a public client by posting {"redirect_uris":["<this deployment\'s callback URL>"],"token_endpoint_auth_method":"none"} to https://api.sunsama.com/oauth/register, then configure the returned client_id. No client secret is required, and the client id can be reused by users on this deployment.',
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
    },
  ],
  homepageUrl: "https://help.sunsama.com/docs/integrations/mcp/",
  actions: sunsamaMcpActions,
};
