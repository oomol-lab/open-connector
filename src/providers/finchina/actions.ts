import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const resultSchema = s.object(
  "The discovered tool or metadata result.",
  {
    result: s.unknown("Decoded FinChina JSON, or the original MCP content when no JSON object is returned."),
  },
  { optional: [] },
);
const queryResultSchema = s.looseObject(
  "FinChina query data and business status, including additional upstream fields.",
  {
    data: s.unknown(
      "Query summary and records. records.headInfo describes the columns; records.data contains positional row arrays. Nested array columns retain their property metadata.",
    ),
    status: s.looseObject("Business status and diagnostics. Codes below 100 indicate success.", {
      code: s.number("FinChina business status code, including success with parameter adjustments."),
    }),
  },
);
const argumentsSchema = s.looseObject(
  "Arguments matching the current schema discovered from FinChina. Preserve upstream field names and pagination parameters.",
);
const companyFields = {
  companies: s.array(
    "Company names or unified social credit codes, up to 100 companies.",
    s.nonEmptyString("One company name or unified social credit code."),
    { minItems: 1, maxItems: 100 },
  ),
  indicators: s.array(
    "Financial or company indicators in Chinese or English; FinChina supports fuzzy matching.",
    s.nonEmptyString("One requested indicator."),
    { minItems: 1 },
  ),
  sort: s.array(
    "Sort the query results by one or more fields.",
    s.object(
      "One sort rule.",
      {
        field: s.nonEmptyString("The indicator or field to sort by, such as 注册资本 or 营业总收入."),
        order: s.stringEnum("Sort direction.", ["asc", "desc"]),
      },
      { optional: [] },
    ),
  ),
  additionalArguments: s.looseObject(
    "Additional parameters from the discovered subtool schema. Must not repeat fields supplied through companies, indicators, date, or sort.",
  ),
};
export const finchinaActions: readonly ActionDefinition[] = [
  defineProviderAction("finchina", {
    name: "list_tools",

    operationType: "read",
    requiredScopes: [],
    description:
      "Discover FinChina financial and enterprise-risk navigation tools, the execution entry point, and metadata tools with their current input schemas.",
    inputSchema: s.object("No input is required.", {}, { optional: [] }),
    outputSchema: s.object(
      "The current FinChina MCP tool catalog.",
      {
        tools: s.array(
          "Tools exposed by the connected FinChina account.",
          s.looseObject("A live MCP tool definition.", {
            name: s.optional(s.string("The exact MCP tool name.")),
            description: s.optional(s.string("The current upstream tool description.")),
            inputSchema: s.optional(s.looseObject("The current JSON Schema for this tool's arguments.")),
            annotations: s.optional(s.looseObject("Optional upstream behavior hints.")),
          }),
        ),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("finchina", {
    name: "discover_tools",

    operationType: "read",
    requiredScopes: [],
    description:
      "Call a FinChina query_* or screen_* navigation tool with no arguments to obtain subTools and their parameter schemas. This returns definitions, not business records. Use execute_tool to query a discovered subtool.",
    inputSchema: s.object(
      "The navigation tool to inspect after list_tools.",
      {
        toolName: s.nonEmptyString("An exact query_* or screen_* tool name from list_tools."),
      },
      { optional: [] },
    ),
    outputSchema: resultSchema,
  }),
  defineProviderAction("finchina", {
    name: "get_metadata",

    operationType: "read",
    requiredScopes: [],
    description:
      "Query FinChina indicator definitions, enumerations, or parameter metadata through caihui_mcp_metadata. Inspect its current schema using list_tools before supplying arguments.",
    inputSchema: s.object(
      "Arguments for the FinChina metadata tool.",
      {
        arguments: argumentsSchema,
      },
      { optional: [] },
    ),
    outputSchema: resultSchema,
  }),
  defineProviderAction("finchina", {
    name: "execute_tool",

    operationType: "read",
    requiredScopes: [],
    description:
      "Query a FinChina data subtool discovered with discover_tools. Pass its exact name and arguments. Queries consume account credits; this action executes one request without automatic pagination or business retries.",
    inputSchema: s.object(
      "A discovered FinChina data subtool and its arguments.",
      {
        toolName: s.nonEmptyString(
          "The exact subTools name returned by a navigation tool; not a top-level query_* or screen_* name.",
        ),
        arguments: argumentsSchema,
      },
      { optional: [] },
    ),
    outputSchema: queryResultSchema,
  }),
  ...["get_company_basic_info", "get_company_financial_metrics"].map((name) =>
    defineProviderAction("finchina", {
      name,
      operationType: "read",
      requiredScopes: [],
      description:
        name === "get_company_basic_info"
          ? "Query company basic information and selected indicators through FinChina, such as registered capital. Consumes account credits and executes one query. Discover query_enterprise_profile for the current additional parameters."
          : "Query company financial indicators through FinChina, such as revenue over the last three years. Consumes account credits and executes one query. Discover query_enterprise_financial_data for the current additional parameters.",
      inputSchema:
        name === "get_company_financial_metrics"
          ? s.object(
              "Company indicator query parameters.",
              {
                ...companyFields,
                date: s.string("A reporting date or natural-language period, such as 近三年 or 2023年报."),
              },
              { optional: ["date", "sort", "additionalArguments"] },
            )
          : s.object("Company indicator query parameters.", companyFields, {
              optional: ["sort", "additionalArguments"],
            }),
      outputSchema: queryResultSchema,
    }),
  ),
];
