import type { ProviderDefinition } from "../../core/types.ts";

import { cloudflareMcpActions } from "./actions.ts";

const service = "cloudflare_mcp";

/**
 * Cloudflare provider backed by Cloudflare's official unified MCP service.
 *
 * API tokens work directly. OAuth clients are public clients this runtime registers for itself
 * through Cloudflare's RFC 7591 dynamic client registration endpoint the first time someone
 * starts authorization with no client configured, instead of requiring an admin to obtain and
 * paste a clientId first.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Cloudflare MCP",
  description:
    "Search Cloudflare documentation and API schemas, then manage Cloudflare resources through the official unified MCP service. API tokens connect directly; OAuth needs no setup — this deployment registers its own public client with Cloudflare automatically the first time someone connects.",
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
      registrationEndpoint: "https://mcp.cloudflare.com/register",
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
  iconUrl: "https://workers.cloudflare.com/favicon.ico",
  actions: cloudflareMcpActions,
};
