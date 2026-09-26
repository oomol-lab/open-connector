import type { ProviderDefinition } from "../../core/types.ts";

import { drawioMcpActions } from "./actions.ts";

const service = "drawio_mcp";

export const provider: ProviderDefinition = {
  service,
  displayName: "draw.io MCP",
  description:
    "Create draw.io diagrams from Mermaid or draw.io XML and search the draw.io shape library through the draw.io MCP server.",
  categories: ["Design", "Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "mcpEndpoint",
          label: "MCP Endpoint URL",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "https://mcp.draw.io/mcp",
          description:
            "No credentials are required; this connection only selects the MCP server. Leave blank to use the official hosted server at mcp.draw.io, which receives the diagram content you send. To keep diagrams on your own infrastructure, enter the /mcp URL of a self-hosted jgraph/drawio-mcp server.",
        },
      ],
      testAction: {
        actionName: "search_shapes",
        input: { query: "database", limit: 1 },
      },
    },
  ],
  homepageUrl: "https://www.drawio.com",
  actions: drawioMcpActions,
};
