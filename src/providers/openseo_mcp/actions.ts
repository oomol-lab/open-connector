import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const openseoMcpActions: readonly ActionDefinition[] = [
  defineProviderAction("openseo_mcp", {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover OpenSEO MCP tools and their current input/output schemas and behavior annotations. Tools cover projects, keywords, SERP, backlinks, local SEO, rank tracking, AI visibility, Google Search Console, Google Analytics, site audits, and reports. Discover tools before calling them.",
    requiredScopes: [],
    followUpActions: ["openseo_mcp.call_tool"],
    inputSchema: s.requiredObject("No input is required.", {}),
    outputSchema: s.requiredObject("The current OpenSEO MCP tool catalog.", {
      tools: s.array(
        "Tools available to the connected workspace.",
        s.object(
          "An OpenSEO MCP tool.",
          {
            name: s.nonEmptyString("The exact tool name to pass to call_tool."),
            description: s.string("The current official tool description."),
            annotations: s.looseObject("Official hints about side effects and tool behavior."),
            inputSchema: s.looseObject("The live JSON Schema for the tool arguments."),
            outputSchema: s.looseObject("The live JSON Schema for the tool result, when supplied."),
          },
          { optional: ["description", "annotations", "outputSchema"] },
        ),
      ),
    }),
  }),
  defineProviderAction("openseo_mcp", {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call an OpenSEO MCP tool discovered with list_tools. Use list_projects to obtain projectId when required. Research tools may consume credits; inspect the live description and cost tools before starting work. Site audits and tracking runs may require later status queries. This generic action can create, modify, publish, or delete data. Report sharing must be explicitly requested.",
    requiredScopes: [],
    followUpActions: ["openseo_mcp.list_tools"],
    inputSchema: s.object(
      "Invoke a discovered OpenSEO MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject(
          "JSON arguments matching the selected tool schema. Use the project ID returned by OpenSEO and preserve explicit market, date, and pagination choices.",
        ),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.requiredObject("The normalized OpenSEO MCP response.", {
      result: s.unknown(
        "Structured content when supplied; otherwise the complete MCP content envelope. Preserve warnings, partial results, credit information, and task status. A submitted task is not a completed result.",
      ),
    }),
  }),
];
