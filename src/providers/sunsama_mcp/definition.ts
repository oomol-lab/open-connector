import type { ProviderDefinition } from "../../core/types.ts";

import { sunsamaMcpActions } from "./actions.ts";

const service = "sunsama_mcp";

/**
 * Sunsama provider backed by Sunsama's official remote MCP server.
 *
 * OAuth clients are public clients registered through Sunsama's dynamic client
 * registration endpoint with this Open Connector deployment's callback URL. Sunsama has no
 * self-serve "create an OAuth app" dashboard, so the client id has to come from that endpoint
 * (see the description below for the exact steps) rather than from a form on Sunsama's site.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Sunsama MCP",
  description:
    "Work with Sunsama daily planning tasks and workflows through Sunsama's official remote MCP server. Sunsama has no OAuth app dashboard, so the Client ID above has to be obtained via its dynamic client registration endpoint: (1) find this deployment's callback URL on this page or via GET /api/oauth/configs, (2) have someone with API access POST {\"redirect_uris\":[\"<that callback URL>\"],\"token_endpoint_auth_method\":\"none\"} to https://api.sunsama.com/oauth/register, (3) paste the returned client_id into the Client ID field above — no client secret is needed, and one client id can be reused by everyone connecting through this deployment.",
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
