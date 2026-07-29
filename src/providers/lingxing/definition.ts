import type { ProviderDefinition } from "../../core/types.ts";

import { lingxingActions } from "./actions.ts";

const service = "lingxing";

export const provider: ProviderDefinition = {
  service,
  displayName: "Lingxing",
  description: "Discover and call live Lingxing ERP tools through the official Lingxing Streamable HTTP MCP service.",
  categories: ["Productivity", "Data", "Marketing"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "serverUrl",
          label: "MCP Server URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://openmcp.lingxing.com/mcp-servers/lingxing-mcp",
          description:
            "The official Lingxing MCP Server URL for your current ERP account. Copy it from AI Assistant > Manage MCP as described at https://www.lingxing.com/help/article/mcp. Only openmcp.lingxing.com is accepted.",
        },
        {
          key: "mcpKey",
          label: "X-Mcp-Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Paste your Lingxing X-Mcp-Key",
          description:
            "The X-Mcp-Key bound to your current Lingxing ERP account. Copy or regenerate it from AI Assistant > Manage MCP as described at https://www.lingxing.com/help/article/mcp.",
        },
      ],
      testAction: {
        actionName: "list_tools",
        input: {},
      },
    },
  ],
  homepageUrl: "https://www.lingxing.com",
  actions: lingxingActions,
};
