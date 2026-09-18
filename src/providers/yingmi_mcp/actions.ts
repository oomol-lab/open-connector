import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "yingmi_mcp";

const toolAnnotationsSchema = s.looseObject("MCP hints supplied by Yingmi about a tool's behavior.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside Yingmi.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected Yingmi MCP account.",
  {
    name: s.nonEmptyString("The exact Yingmi MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Yingmi MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Yingmi MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const yingmiMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the current Yingmi financial data, research, and advisory MCP tools with their live input schemas.",
    requiredScopes: [],
    followUpActions: ["yingmi_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current Yingmi MCP tool catalog.", {
      tools: s.array("Tools currently exposed to the connected Yingmi MCP account.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "write",
    description:
      "Call a current Yingmi MCP tool with JSON arguments after checking its live schema and behavior annotations.",
    requiredScopes: [],
    followUpActions: ["yingmi_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current Yingmi MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the Yingmi MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
