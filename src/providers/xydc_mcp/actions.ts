import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { xydcMcpOfficialActions } from "./official-actions.ts";

const service = "xydc_mcp";

const toolAnnotationsSchema = s.looseObject("MCP hints supplied by XYDC about the tool's behavior.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify XYDC data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive updates.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to have no additional effect."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with external entities.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected XYDC MCP account.",
  {
    name: s.nonEmptyString("The exact XYDC MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by XYDC MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by XYDC MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const xydcMcpActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the current XYDC MCP tools, behavior annotations, and live input schemas before choosing a tool to call.",
    followUpActions: ["xydc_mcp.call_tool"],
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.requiredObject("The current XYDC MCP tool catalog.", {
      tools: s.array("Tools currently exposed to the connected XYDC account.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "write",
    description:
      "Call a current XYDC MCP tool with JSON arguments matching its live schema. Calls may consume Credits. Each successful generate_category_insight_resource call costs 500 Credits, including existing resources; reuse the returned resource and do not blindly retry generation. Connector waits at most 55 seconds for generation. A timeout does not confirm upstream cancellation or prevent charges; the result may be unknown. Do not automatically retry generation after a timeout.",
    followUpActions: ["xydc_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current XYDC MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.requiredObject("The normalized result returned by the XYDC MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "read_category_insight_guide",
    operationType: "read",
    description:
      "Read the official XYDC category insight workflow before a category analysis: marketplace and category confirmation, resource generation, reuse, reporting periods, pagination and Credits.",
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.requiredObject("The official category insight guide.", {
      contents: s.array(
        "Guide content returned by XYDC.",
        s.looseRequiredObject(
          "One text resource.",
          {
            uri: s.string("Resource URI."),
            mimeType: s.optional(s.string("Content MIME type.")),
            text: s.string("The current official workflow guide."),
          },
          { optional: ["mimeType"] },
        ),
      ),
    }),
    followUpActions: ["xydc_mcp.search_market_insight_categories"],
  }),
  ...xydcMcpOfficialActions,
];
