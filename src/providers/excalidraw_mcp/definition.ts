import type { ProviderDefinition } from "../../core/types.ts";

import { excalidrawMcpActions } from "./actions.ts";

const service = "excalidraw_mcp";

export const provider: ProviderDefinition = {
  service,
  displayName: "Excalidraw MCP",
  description: "Draw and inspect Excalidraw diagrams through the Excalidraw MCP server.",
  categories: ["Design", "Developer Tools"],
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
          placeholder: "https://mcp.excalidraw.com",
          description:
            "Optional Excalidraw MCP endpoint. Leave blank to use the public hosted server. Self-hosted remote deployments can point at their own MCP URL, such as a /mcp endpoint.",
        },
      ],
      testAction: {
        actionName: "read_me",
        input: {},
      },
    },
  ],
  homepageUrl: "https://excalidraw.com",
  actions: excalidrawMcpActions,
};
