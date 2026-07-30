import type { ProviderDefinition } from "../../core/types.ts";

import { cloudflareMcpActions } from "./actions.ts";

const service = "cloudflare_mcp";

/**
 * Cloudflare provider backed by Cloudflare's official unified MCP service.
 *
 * API tokens work directly. OAuth clients use Cloudflare's dynamic client
 * registration endpoint and the local Open Connector OAuth callback URL.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Cloudflare MCP",
  description:
    "Search Cloudflare documentation and API schemas, then manage Cloudflare resources through the official unified MCP service. API tokens connect directly; OAuth uses a public client registered through https://mcp.cloudflare.com/register with this Open Connector deployment's callback URL.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://mcp.cloudflare.com/authorize",
      tokenUrl: "https://mcp.cloudflare.com/token",
      refreshTokenUrl: "https://mcp.cloudflare.com/token",
      scopes: ["user:read", "account:read", "offline_access"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
    },
    {
      type: "api_key",
      label: "Cloudflare API Token / Bearer Token",
      placeholder: "Paste a Cloudflare API token",
      description:
        "A Cloudflare user or account API token sent to the official MCP server as an Authorization Bearer token. Grant only the permissions needed by your workflows. Account tokens should also include Account Resources: Read so the MCP server can auto-detect the account ID.",
    },
  ],
  homepageUrl: "https://github.com/cloudflare/mcp",
  actions: cloudflareMcpActions,
};
