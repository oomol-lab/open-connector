import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jumpserver" as const;

const toolSchema = s.object(
  "A tool discovered from the configured JumpServer MCP server.",
  {
    name: s.nonEmptyString("JumpServer MCP tool name."),
    description: s.string("Tool description supplied by JumpServer MCP."),
    inputSchema: s.unknownObject("JSON Schema accepted by the JumpServer MCP tool."),
    outputSchema: s.unknownObject("JSON Schema returned by the JumpServer MCP tool when declared."),
  },
  { required: ["name", "inputSchema"], optional: ["description", "outputSchema"] },
);

type JumpServerActionDefinitions = readonly [
  ProviderActionDefinition<"list_tools">,
  ProviderActionDefinition<"call_tool">,
];

export type JumpServerActionName = JumpServerActionDefinitions[number]["name"];

export const jumpServerActions: JumpServerActionDefinitions = [
  defineProviderAction(service, {
    name: "list_tools",
    description:
      "List tools exposed by the configured JumpServer MCP server. The available tools depend on the JumpServer version, installed components, and Bearer token permissions.",
    inputSchema: s.object(
      "Input for listing JumpServer MCP tools.",
      {
        cursor: s.string("Opaque pagination cursor returned by a previous list_tools call."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.object(
      "Tools exposed by JumpServer MCP.",
      {
        tools: s.array("JumpServer MCP tools.", toolSchema),
        nextCursor: s.string("Opaque cursor for the next page when more tools are available."),
      },
      { required: ["tools"], optional: ["nextCursor"] },
    ),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    description:
      "Call any tool exposed by the configured JumpServer MCP server. Use list_tools first to inspect the exact tool name, description, and input schema. Warning: the selected JumpServer tool may create, modify, delete, or otherwise disrupt managed assets and access configuration.",
    inputSchema: s.object(
      "Input for calling one JumpServer MCP tool.",
      {
        toolName: s.nonEmptyString("Exact JumpServer MCP tool name returned by list_tools."),
        arguments: s.unknownObject("Arguments validated by the selected JumpServer MCP tool."),
      },
      { required: ["toolName"], optional: ["arguments"] },
    ),
    outputSchema: s.unknownObject(
      "The MCP call result, including content and optional structuredContent returned by JumpServer.",
    ),
  }),
];
