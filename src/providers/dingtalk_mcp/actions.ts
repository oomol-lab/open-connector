import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dingtalk_mcp";

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by the connected DingTalk server.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify DingTalk data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform a destructive DingTalk operation.")),
  idempotentHint: s.optional(s.boolean("Whether repeating the same call is expected to have no additional effect.")),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside DingTalk.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected DingTalk MCP endpoint.",
  {
    name: s.nonEmptyString("The exact DingTalk MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by DingTalk MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by DingTalk MCP."),
  },
  { optional: ["description", "annotations"] },
);

export const dingTalkMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    description:
      "Discover the current tools, behavior annotations, and live input schemas exposed by this DingTalk MCP connection.",
    requiredScopes: [],
    followUpActions: ["dingtalk_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current DingTalk MCP tool catalog.", {
      tools: s.array("Tools currently exposed by this DingTalk MCP connection.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    description:
      "Call a current DingTalk MCP tool with JSON arguments. Discover the tool first and confirm the user's intent because the endpoint may expose actions that send, overwrite, cancel, or delete DingTalk data.",
    requiredScopes: [],
    followUpActions: ["dingtalk_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current DingTalk MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the DingTalk MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
