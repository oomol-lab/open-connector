import type { ProviderDefinition } from "../../core/types.ts";

import { notionMcpActions } from "./actions.ts";
import { notionMcpEndpoint, notionMcpIssuer } from "./endpoints.ts";

const service = "notion_mcp";

/** Notion provider backed by Notion's official remote MCP server; no Notion integration app is registered. */
export const provider: ProviderDefinition = {
  service,
  displayName: "Notion MCP",
  description:
    "Search, read, and list comments on Notion pages through Notion's official remote MCP server, signed in with the connected user's own Notion account.",
  categories: ["Productivity"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: `${notionMcpIssuer}/authorize`,
      tokenUrl: `${notionMcpIssuer}/token`,
      // Notion's authorization server advertises the single scope "default" and its 401 challenge names no
      // scope, so the runtime sends no scope parameter at all (it omits `scope` for an empty list).
      scopes: [],
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
      authorizationParams: { resource: notionMcpEndpoint },
      clientSetup: {
        docsUrl: "https://developers.notion.com/guides/mcp/mcp-supported-tools",
        steps: [
          "Copy the Callback URL shown below.",
          'POST {"client_name":"Open Connector","redirect_uris":["<Callback URL>"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none"} as JSON to https://mcp.notion.com/register.',
          "Copy the returned client_id into the Client ID field below and leave Client Secret empty.",
          "Connect with OAuth. Notion MCP is in beta: tool names and result shapes can change without notice, and some search filters need a Business or Enterprise plan.",
        ],
      },
    },
  ],
  homepageUrl: "https://www.notion.so",
  actions: notionMcpActions,
};
