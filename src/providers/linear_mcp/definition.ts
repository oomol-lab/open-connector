import type { ProviderDefinition } from "../../core/types.ts";

import { linearMcpActions } from "./actions.ts";
import { linearMcpEndpoint, linearMcpIssuer } from "./endpoints.ts";

const service = "linear_mcp";

/**
 * Linear provider backed by Linear's official remote MCP server.
 *
 * Linear's MCP authorization server issues public PKCE clients through dynamic
 * registration, so no pre-registered Linear OAuth app is needed: the register
 * step below is written in the same shape as Granola's so a host can script it.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Linear MCP",
  description: "Read Linear issues and comments through Linear's official remote MCP server.",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: `${linearMcpIssuer}/authorize`,
      tokenUrl: `${linearMcpIssuer}/token`,
      scopes: ["read", "write"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationParams: { resource: linearMcpEndpoint },
      clientSetup: {
        docsUrl: "https://linear.app/docs/mcp",
        steps: [
          "Copy the Callback URL shown below.",
          'POST {"client_name":"Open Connector","redirect_uris":["<Callback URL>"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none","scope":"read write"} as JSON to https://mcp.linear.app/register.',
          "Copy the returned client_id into the Client ID field below and leave Client Secret empty.",
        ],
      },
    },
  ],
  homepageUrl: "https://linear.app/docs/mcp",
  actions: linearMcpActions,
};
