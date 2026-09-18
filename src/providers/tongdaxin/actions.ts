import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tongdaxin";

export const tongdaxinReadOnlyToolNames: string[] = [
  "tdx_lookup_stock",
  "tdx_quotes",
  "tdx_kline",
  "tdx_indicator_select",
  "tdx_screener",
  "tdx_api_data",
  "wenda_news_query",
  "wenda_notice_query",
  "wenda_report_query",
];

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by Tongdaxin.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside Tongdaxin.")),
});

const mcpToolSummarySchema = s.object(
  "A supported read-only financial data tool currently exposed by Tongdaxin MCP.",
  {
    name: s.stringEnum("The exact supported Tongdaxin MCP tool name to pass to call_tool.", tongdaxinReadOnlyToolNames),
    description: s.string("The current tool description supplied by Tongdaxin MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Tongdaxin MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const tongdaxinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the supported Tongdaxin market data, screening, news, announcement, and research MCP tools with their live input schemas.",
    requiredScopes: [],
    followUpActions: ["tongdaxin.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The supported live Tongdaxin MCP tool catalog.", {
      tools: s.array(
        "Supported read-only tools currently exposed to the connected Tongdaxin API Key.",
        mcpToolSummarySchema,
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "read",
    description:
      "Call one supported read-only Tongdaxin financial data MCP tool with arguments matching its live input schema.",
    requiredScopes: [],
    followUpActions: ["tongdaxin.list_tools"],
    inputSchema: s.object(
      "Input for invoking one supported read-only Tongdaxin MCP tool.",
      {
        toolName: s.stringEnum("The supported Tongdaxin MCP tool to invoke.", tongdaxinReadOnlyToolNames),
        arguments: s.looseObject("JSON arguments matching the live inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by Tongdaxin MCP.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
