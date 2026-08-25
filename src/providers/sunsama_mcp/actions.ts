import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { sunsamaMcpOfficialActions } from "./official-actions.ts";

const service = "sunsama_mcp";

const toolAnnotationsSchema = s.looseObject("MCP hints supplied by Sunsama about a tool's behavior.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside Sunsama.")),
});

const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected Sunsama account.",
  {
    name: s.nonEmptyString("The exact Sunsama MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Sunsama."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Sunsama."),
  },
  { optional: ["description", "annotations"] },
);

export const sunsamaMcpActions: ActionDefinition[] = [
  ...sunsamaMcpOfficialActions,
  defineProviderAction(service, {
    name: "list_tools",
    description: "Discover the current Sunsama task and daily planning MCP tools with their live input schemas.",
    requiredScopes: ["read"],
    followUpActions: ["sunsama_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current Sunsama MCP tool catalog.", {
      tools: s.array("Tools currently exposed to the connected Sunsama account.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    description:
      "Call a current Sunsama MCP tool with JSON arguments after checking its live schema and behavior annotations.",
    requiredScopes: ["execute"],
    followUpActions: ["sunsama_mcp.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current Sunsama MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object("The normalized result returned by the Sunsama MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
