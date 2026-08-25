import type { ProviderDefinition } from "../../core/types.ts";

import { sunsamaMcpActions } from "./actions.ts";

const service = "sunsama_mcp";

/**
 * Sunsama provider backed by Sunsama's official remote MCP server.
 *
 * OAuth clients are public clients registered through Sunsama's dynamic client
 * registration endpoint with this Open Connector deployment's callback URL.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Sunsama MCP",
  description:
    "Work with Sunsama daily planning tasks and workflows through Sunsama's official remote MCP server. OAuth uses a public client registered through https://api.sunsama.com/oauth/register with this Open Connector deployment's callback URL.",
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
