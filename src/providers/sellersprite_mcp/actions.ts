import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { sellerSpriteMcpOfficialActions } from "./official-actions.ts";

const service = "sellersprite_mcp";

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by SellerSprite.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify SellerSprite data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to have no additional effect."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside SellerSprite.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected SellerSprite MCP account.",
  {
    name: s.nonEmptyString("The exact SellerSprite MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by SellerSprite MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by SellerSprite MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const sellerspriteMcpActions: readonly ActionDefinition[] = [
  ...sellerSpriteMcpOfficialActions,
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the current SellerSprite Amazon research and market-data MCP tools with their live input schemas and behavior annotations.",
    requiredScopes: [],
    followUpActions: ["sellersprite_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current SellerSprite MCP tool catalog.", {
      tools: s.array("Tools currently exposed to the connected SellerSprite MCP account.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "write",
    description:
      "Call a current SellerSprite MCP tool with JSON arguments after inspecting its live schema and behavior annotations with list_tools.",
    requiredScopes: [],
    followUpActions: ["sellersprite_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current SellerSprite MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the SellerSprite MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
