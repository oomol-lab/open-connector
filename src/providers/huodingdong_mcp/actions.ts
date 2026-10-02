import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const huodingdongMcpActions: ActionDefinition[] = [
  defineProviderAction("huodingdong_mcp", {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the connected Huodingdong ERP account's current MCP tools, live argument and result schemas, and behavior annotations for Shopee and TikTok Shop products, inventory, orders, fulfillment, marketing, advertising, profit, business reporting, and product import tasks.",
    requiredScopes: [],
    followUpActions: ["huodingdong_mcp.call_tool"],
    inputSchema: s.object("No input is required.", {}, { optional: [] }),
    outputSchema: s.object(
      "The live Huodingdong ERP MCP tool catalog.",
      {
        tools: s.array(
          "Tools available within the connected account's permissions.",
          s.object(
            "One tool currently exposed by Huodingdong ERP MCP.",
            {
              name: s.nonEmptyString("The exact tool name to pass to call_tool."),
              description: s.string("The current official tool description."),
              annotations: s.looseObject("Official MCP hints about the tool's behavior."),
              inputSchema: s.looseObject("The live JSON Schema for the tool's arguments."),
              outputSchema: s.looseObject("The live JSON Schema for the tool's result, if supplied."),
            },
            { optional: ["description", "annotations", "outputSchema"] },
          ),
        ),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("huodingdong_mcp", {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call a current Huodingdong ERP MCP tool after discovering its schema with list_tools. Product import creates an asynchronous task; query its task status and distinguish collection success from shop claim success. Pricing simulation requires an explicit region even if the live schema omits that requirement. Inventory is an ERP snapshot, not live platform sellable stock. Inspect tool behavior before calling: this generic entry point also permits future tools that may change or delete business data.",
    requiredScopes: [],
    followUpActions: ["huodingdong_mcp.list_tools"],
    inputSchema: s.object(
      "Invoke a discovered Huodingdong ERP MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject(
          "JSON arguments matching the selected tool's live schema. Use platform shop IDs, preserve explicit shop and date filters, and supply region for pricing simulation.",
        ),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: s.object(
      "The normalized Huodingdong ERP MCP tool response.",
      {
        result: s.unknown(
          "Structured content when supplied; otherwise the complete MCP content envelope. Preserve warnings and missing-data indicators. An accepted import task or successful collection does not guarantee shop claim or publication success.",
        ),
      },
      { optional: [] },
    ),
  }),
];
