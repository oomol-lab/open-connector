import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const metabaseMcpActions: ProviderActionDefinition[] = [
  defineProviderAction("metabase", {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the tools exposed by this Metabase instance's native MCP server. Without toolNames, returns a compact index (name, one-line summary, annotations); pass toolNames to get the full descriptions and input schemas of those tools before calling them with call_tool. Tool names and schemas follow the instance's Metabase version.",
    followUpActions: ["metabase.call_tool"],
    inputSchema: s.object(
      "Optional tool selection.",
      { toolNames: s.stringArray("Exact tool names whose full description and schemas to return.", { minItems: 1 }) },
      { optional: ["toolNames"] },
    ),
    outputSchema: s.requiredObject("Native tools across all discovery pages.", {
      tools: s.array(
        "Native tools.",
        s.object(
          "Tool definition.",
          {
            name: s.string("Exact native tool name to pass to call_tool."),
            summary: s.string("First line of the tool description; index mode only."),
            description: s.string("Full tool description supplied by Metabase; toolNames mode only."),
            inputSchema: s.looseObject("Upstream JSON input schema; toolNames mode only."),
            outputSchema: s.looseObject("Upstream JSON output schema; toolNames mode only."),
            annotations: s.looseObject("Native tool annotations such as readOnlyHint and destructiveHint."),
          },
          { optional: ["summary", "description", "inputSchema", "outputSchema", "annotations"] },
        ),
      ),
    }),
  }),
  defineProviderAction("metabase", {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call a native Metabase MCP tool with JSON arguments matching the inputSchema returned by list_tools with toolNames. Depending on the tool, this can run queries or create, update, or archive Metabase content as the API key's user; check the tool's annotations and confirm writes first.",
    followUpActions: ["metabase.list_tools"],
    inputSchema: s.object(
      "One native tool invocation.",
      {
        toolName: s.nonEmptyString("Exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the tool's inputSchema; passed unchanged."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.requiredObject("Native tool result.", {
      result: s.unknown(
        "structuredContent when present, otherwise the leading JSON of the text content, otherwise the text.",
      ),
      notes: s.optional(s.string("Guidance text Metabase appended after the JSON, such as paging hints.")),
    }),
  }),
  defineProviderAction("metabase", {
    name: "list_mcp_resources",
    operationType: "read",
    description:
      "Discover native MCP resources. Data resources can be read with read_mcp_resource; MCP Apps (ui://) resources are not supported.",
    inputSchema: s.object("No input required.", {}),
    outputSchema: s.requiredObject("Native resources across all discovery pages.", {
      resources: s.array(
        "Resource definitions.",
        s.requiredObject("Resource definition.", {
          uri: s.string("Resource URI."),
          name: s.string("Resource name."),
          title: s.optional(s.string("Title.")),
          description: s.optional(s.string("Description.")),
          mimeType: s.optional(s.string("Media type.")),
        }),
      ),
    }),
  }),
  defineProviderAction("metabase", {
    name: "read_mcp_resource",
    operationType: "read",
    description: "Read a text resource listed by list_mcp_resources. MCP Apps (ui://) resources are not supported.",
    inputSchema: s.requiredObject("Native resource.", {
      uri: s.string("URI from list_mcp_resources.", { pattern: "^(?!ui://)[a-z][a-z0-9+.-]*://", minLength: 4 }),
    }),
    outputSchema: s.requiredObject("Resource contents.", {
      contents: s.array(
        "Text resource contents.",
        s.requiredObject("Resource content.", {
          uri: s.string("Resource URI."),
          mimeType: s.optional(s.string("Media type.")),
          text: s.string("Resource text."),
        }),
      ),
    }),
  }),
];
