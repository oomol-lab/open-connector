import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tiktok_business_mcp";

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by TikTok for a tool.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether TikTok expects the tool not to modify advertising data.")),
  destructiveHint: s.optional(s.boolean("Whether TikTok indicates that the tool may perform a destructive operation.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside TikTok Ads.")),
});

const mcpToolSummarySchema = s.object(
  "A core or discovery tool currently exposed by TikTok for Business MCP.",
  {
    name: s.nonEmptyString("The exact TikTok MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by TikTok."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by TikTok MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const tiktokBusinessMcpActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "List the complete current tool catalog and live input schemas exposed by the connected TikTok for Business MCP account.",
    requiredScopes: ["tiktok_business_mcp.tools"],
    followUpActions: ["tiktok_business_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current TikTok for Business MCP tool catalog.", {
      tools: s.array("Tools currently exposed by the full MCP connection.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call a current TikTok for Business MCP tool with JSON arguments. Discover the live schema first and confirm the user's intent because tools may create ads, change budgets or delivery, revoke access, or delete advertising assets.",
    requiredScopes: ["tiktok_business_mcp.tools"],
    followUpActions: ["tiktok_business_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current TikTok for Business MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by TikTok MCP discovery."),
        arguments: s.looseObject("JSON arguments matching the current inputSchema for the selected TikTok MCP tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the TikTok for Business MCP tool.", {
      result: s.unknown("The current TikTok MCP result after standard MCP content normalization."),
    }),
  }),
];
