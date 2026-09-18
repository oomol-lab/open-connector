import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lingxing_mcp";

const toolAnnotationsSchema = s.looseObject("MCP hints supplied by Lingxing about the tool's behavior.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify Lingxing data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive updates.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to have no additional effect."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with external entities.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected Lingxing MCP server.",
  {
    name: s.nonEmptyString("The exact MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Lingxing MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Lingxing MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const lingxingMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the current Lingxing ERP MCP tools, behavior annotations, and live input schemas before choosing a tool to call.",
    inputSchema: s.actionInput({}, [], "No input is required."),
    outputSchema: s.actionOutput(
      {
        tools: s.array("Tools currently exposed to the connected Lingxing account.", mcpToolSummarySchema),
      },
      "The current Lingxing MCP tool catalog.",
    ),
    followUpActions: ["lingxing_mcp.call_tool"],
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "write",
    description:
      "Call a current Lingxing ERP MCP tool with JSON arguments. Discover the tool first and confirm the user's intent because some Lingxing tools create or update ERP data.",
    inputSchema: s.object(
      "Input for invoking one current Lingxing MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.actionOutput(
      {
        result: s.unknown(
          "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
        ),
      },
      "The normalized result returned by the Lingxing MCP tool.",
    ),
    followUpActions: ["lingxing_mcp.list_tools"],
  }),
];
