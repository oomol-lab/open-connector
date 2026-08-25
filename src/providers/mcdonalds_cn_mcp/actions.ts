import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mcdonalds_cn_mcp";

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by McDonald's China.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify McDonald's China data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform a destructive operation.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to have no additional effect."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside McDonald's China.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected McDonald's China MCP account.",
  {
    name: s.nonEmptyString("The exact McDonald's China MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by McDonald's China MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by McDonald's China MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const mcdonaldsCnMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    description:
      "Discover the current McDonald's China ordering, coupon, campaign, and points-mall MCP tools with their live input schemas and behavior annotations.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current McDonald's China MCP tool catalog.", {
      tools: s.array("Tools currently exposed to the connected McDonald's China account.", mcpToolSummarySchema),
    }),
    followUpActions: ["mcdonalds_cn_mcp.call_tool"],
  }),
  defineProviderAction(service, {
    name: "call_tool",
    description:
      "Call a current McDonald's China MCP tool with JSON arguments. Discover the tool first and confirm the user's intent before actions that create an address, claim coupons, redeem points, or create an order.",
    inputSchema: s.object(
      "Input for invoking one current McDonald's China MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the McDonald's China MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
    followUpActions: ["mcdonalds_cn_mcp.list_tools"],
  }),
];
