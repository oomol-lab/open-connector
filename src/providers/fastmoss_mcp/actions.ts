import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import officialTools from "./official-tools.json" with { type: "json" };

const resultSchema = s.object(
  "The FastMoss MCP tool result.",
  {
    result: s.unknown(
      "Structured MCP content when available; otherwise the complete MCP content envelope. Data availability and Credits depend on the connected FastMoss account.",
    ),
  },
  { optional: [] },
);

export const fastmossMcpActions: readonly ActionDefinition[] = [
  ...officialTools.map((tool) =>
    defineProviderAction("fastmoss_mcp", {
      name: tool.name,
      operationType: "read",
      description: tool.description,
      requiredScopes: [],
      inputSchema: tool.inputSchema,
      outputSchema: resultSchema,
    }),
  ),
  defineProviderAction("fastmoss_mcp", {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover current FastMoss MCP tools, live argument schemas and behavior annotations for TikTok Shop product, creator, shop, advertising, agency and market research.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}, { optional: [] }),
    outputSchema: s.object(
      "The live FastMoss MCP tool catalog.",
      {
        tools: s.array(
          "Tools available to the connected FastMoss account.",
          s.object(
            "One FastMoss MCP tool.",
            {
              name: s.nonEmptyString("The exact tool name."),
              description: s.string("The current official tool description."),
              annotations: s.looseObject("Official MCP behavior annotations."),
              inputSchema: s.looseObject("The current JSON Schema for tool arguments."),
            },
            { optional: ["description", "annotations"] },
          ),
        ),
      },
      { optional: [] },
    ),
    followUpActions: ["fastmoss_mcp.call_tool"],
  }),
  defineProviderAction("fastmoss_mcp", {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call any current FastMoss MCP tool after inspecting list_tools. Arguments must match the live schema. Calls may consume FastMoss Credits; inspect behavior annotations before invoking newly added tools.",
    requiredScopes: [],

    inputSchema: s.object(
      "Call a live FastMoss MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("Arguments matching the selected tool's live input schema."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: resultSchema,
  }),
];
