import type { ProviderDefinition } from "../../core/types.ts";

import { sunsamaMcpActions } from "./actions.ts";

const service = "sunsama_mcp";

/**
 * Sunsama provider backed by Sunsama's official remote MCP server.
 *
 * Sunsama has no self-serve "create an OAuth app" dashboard — its own MCP settings page just
 * says "connect with the MCP server URL, sign in when prompted." To match that, OAuth clients
 * are public clients this runtime registers for itself through Sunsama's RFC 7591 dynamic client
 * registration endpoint the first time someone starts authorization with no client configured
 * (see `registrationEndpoint` below and `OAuthClientConfigService.getConfig`), instead of
 * requiring an admin to obtain and paste a clientId first.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Sunsama MCP",
  description:
    "Work with Sunsama daily planning tasks and workflows through Sunsama's official remote MCP server. OAuth needs no setup: this deployment registers its own public client with Sunsama automatically the first time someone connects.",
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
      registrationEndpoint: "https://api.sunsama.com/oauth/register",
      pkce: { method: "S256" },
    },
  ],
  homepageUrl: "https://help.sunsama.com/docs/integrations/mcp/",
  actions: sunsamaMcpActions,
};
