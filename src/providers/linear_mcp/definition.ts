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
 * The default grant is read-only; the write actions need the optional write
 * scope, asked for through requestedScopes.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Linear MCP",
  description:
    "Read Linear issues, comments, teams, projects, workflow states and labels, and create or update issues and comments, through Linear's official remote MCP server.",
  categories: ["Productivity", "Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: `${linearMcpIssuer}/authorize`,
      tokenUrl: `${linearMcpIssuer}/token`,
      scopes: ["read"],
      optionalScopes: ["write"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationParams: { resource: linearMcpEndpoint },
      clientSetup: {
        docsUrl: "https://linear.app/docs/mcp",
        steps: [
          "Copy the Callback URL shown below.",
          'POST {"client_name":"Open Connector","redirect_uris":["<Callback URL>"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none","scope":"read write"} as JSON to https://mcp.linear.app/register.',
          "Copy the returned client_id into the Client ID field below and leave Client Secret empty.",
          "Connect with OAuth. The default grant is read-only; request the write scope as well (requestedScopes) to create or update issues and comments.",
        ],
      },
    },
  ],
  homepageUrl: "https://linear.app/docs/mcp",
  actions: linearMcpActions,
};
