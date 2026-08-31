import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "helium10";

export const helium10ProviderScopes = {
  tools: "mcp:tools",
} as const;

const actionScopes = [helium10ProviderScopes.tools];
const mcpToolSummarySchema = s.object(
  "A tool currently exposed by the connected Helium 10 MCP server.",
  {
    name: s.nonEmptyString("The exact MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Helium 10 MCP."),
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Helium 10 MCP."),
  },
  { optional: ["description"] },
);

export const helium10Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    description:
      "Discover Helium 10 MCP tools that are both in the official V1 read-only catalog and currently available to the connected account.",
    requiredScopes: actionScopes,
    followUpActions: ["helium10.call_tool"],
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.requiredObject("The current Helium 10 MCP tool catalog.", {
      tools: s.array("Tools currently exposed to the connected Helium 10 account.", mcpToolSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    description:
      "Call a Helium 10 MCP tool after verifying it against the official V1 read-only catalog and the connected account's live tool list.",
    requiredScopes: actionScopes,
    followUpActions: ["helium10.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current Helium 10 MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.requiredObject("The normalized result returned by the Helium 10 MCP tool.", {
      result: s.unknown(
        "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
      ),
    }),
  }),
];
