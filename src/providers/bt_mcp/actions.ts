import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bt_mcp";

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by the connected BT Panel server.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify the managed server.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform a destructive server operation.")),
  idempotentHint: s.optional(s.boolean("Whether repeating the same call is expected to have no additional effect.")),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with systems outside BT Panel.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected BT Panel MCP server.",
  {
    name: s.nonEmptyString("The exact BT Panel MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by BT Panel MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by BT Panel MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const btMcpActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the current server-management tools, behavior annotations, and live input schemas exposed by this BT Panel MCP connection.",
    requiredScopes: [],
    followUpActions: ["bt_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current BT Panel MCP tool catalog.", {
      tools: s.array("Tools currently exposed by the connected BT Panel MCP server.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call a current BT Panel MCP tool with JSON arguments. Discover the tool first and obtain explicit confirmation because the server may expose command execution, firewall changes, file writes, or irreversible deletion operations.",
    requiredScopes: [],
    followUpActions: ["bt_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current BT Panel MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the BT Panel MCP tool.", {
      result: s.looseRequiredObject(
        "The BT Panel result object with the documented common status and message fields plus tool-specific fields.",
        {
          status: s.boolean("Whether the BT Panel tool completed successfully."),
          msg: s.string("The result or error message returned by BT Panel."),
        },
      ),
    }),
  }),
];
