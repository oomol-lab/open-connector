import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lingxing";

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected Lingxing MCP server.",
  {
    name: s.nonEmptyString("The exact MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Lingxing MCP."),
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Lingxing MCP."),
  },
  { optional: ["description"] },
);

export const lingxingActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    description:
      "Discover the current Lingxing ERP MCP tools and their live input schemas before choosing a tool to call.",
    inputSchema: s.actionInput({}, [], "No input is required."),
    outputSchema: s.actionOutput(
      {
        tools: s.array("Tools currently exposed to the connected Lingxing account.", mcpToolSummarySchema),
      },
      "The current Lingxing MCP tool catalog.",
    ),
    followUpActions: ["lingxing.call_tool"],
  }),
  defineProviderAction(service, {
    name: "call_tool",
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
    followUpActions: ["lingxing.list_tools"],
  }),
];
