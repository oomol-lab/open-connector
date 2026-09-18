import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { investodayOfficialActions } from "./official-actions.ts";

const toolAnnotationsSchema = s.looseObject("MCP hints supplied by Investoday about a tool's behavior.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside Investoday.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected Investoday MCP account.",
  {
    name: s.nonEmptyString("The exact Investoday MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Investoday MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Investoday MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const investodayMcpActions: readonly ActionDefinition[] = [
  ...investodayOfficialActions,
  defineProviderAction("investoday_mcp", {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the current Investoday financial market data and research MCP tools with their live input schemas.",
    requiredScopes: [],
    followUpActions: ["investoday_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}, { optional: [] }),
    outputSchema: s.object(
      "The current Investoday MCP tool catalog.",
      {
        tools: s.array("Tools currently exposed to the connected Investoday MCP account.", mcpToolSummarySchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("investoday_mcp", {
    name: "call_tool",
    operationType: "read",
    description:
      "Call a current Investoday MCP tool with JSON arguments after checking its live schema and behavior annotations.",
    requiredScopes: [],
    followUpActions: ["investoday_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current Investoday MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object(
      "The normalized result returned by the Investoday MCP tool.",
      {
        result: s.unknown(
          "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
        ),
      },
      { optional: [] },
    ),
  }),
];
