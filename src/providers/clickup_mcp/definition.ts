import type { ProviderDefinition } from "../../core/types.ts";

import { clickupMcpActions } from "./actions.ts";

const clickupMcpEndpoint = "https://mcp.clickup.com/mcp";

/** ClickUp provider backed by ClickUp's official remote MCP server. */
export const provider: ProviderDefinition = {
  service: "clickup_mcp",
  displayName: "ClickUp MCP",
  description: "Search and manage ClickUp work through ClickUp's official remote MCP server.",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://mcp.clickup.com/oauth/authorize",
      tokenUrl: "https://mcp.clickup.com/oauth/token",
      scopes: ["read", "write"],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationParams: { resource: clickupMcpEndpoint },
      clientSetup: {
        docsUrl: "https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server",
        steps: [
          "Copy the Callback URL shown below.",
          'POST {"client_name":"Open Connector","redirect_uris":["<Callback URL>"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"} as JSON to https://mcp.clickup.com/oauth/register.',
          "Copy the returned client_id into the Client ID field below and leave Client Secret empty.",
        ],
      },
    },
  ],
  homepageUrl: "https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server",
  actions: clickupMcpActions,
};
