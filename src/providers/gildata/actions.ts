import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const maxQueryLength = 4_000;
const maxFocusLength = 2_000;
const maxSecurityLength = 256;
const maxToolNameLength = 512;

export const gildataMcpServerTypes: ("tool" | "api")[] = ["tool", "api"];

const serverTypeSchema = s.stringEnum("The Gildata Data Map MCP service family that owns the requested tool.", [
  ...gildataMcpServerTypes,
]);

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by Gildata Data Map.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside Gildata.")),
});

const toolSchema = s.object(
  "A tool currently exposed by one Gildata Data Map MCP service.",
  {
    name: s.nonEmptyString("The exact Gildata MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Gildata MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Gildata MCP."),
  },
  { optional: ["description", "annotations"] },
);

const toolArgumentsSchema = s.looseObject("JSON arguments matching the inputSchema returned for the selected tool.");

const queryResultSchema = s.object(
  "The result returned by Gildata Data Map.",
  {
    result: s.unknown(
      "The financial data result returned by Gildata. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
    ),
  },
  { optional: [] },
);

const querySchema = s.object(
  "A natural-language financial data request.",
  {
    query: s.nonWhitespaceString("The financial question to answer with Gildata Data Map.", {
      maxLength: maxQueryLength,
    }),
  },
  { optional: [] },
);

const screeningSchema = (subject: "stocks" | "funds") =>
  s.object(
    `The conditions used to screen ${subject}.`,
    {
      criteria: s.nonWhitespaceString(
        `Natural-language screening conditions for the requested ${subject}, including any market, category, metric, or ranking constraints.`,
        { maxLength: maxQueryLength },
      ),
    },
    { optional: [] },
  );

const optionalFocusSchema = s.optional(
  s.nonWhitespaceString("Optional aspects that should receive extra attention in the result.", {
    maxLength: maxFocusLength,
  }),
);

const stockOverviewInputSchema = s.object(
  "The stock to summarize and optional analysis focus.",
  {
    security: s.nonWhitespaceString(
      "The stock name or exchange-qualified security code, such as 贵州茅台 or 600519.SH.",
      { maxLength: maxSecurityLength },
    ),
    focus: optionalFocusSchema,
  },
  { optional: [] },
);

const compareStocksInputSchema = s.object(
  "The stocks to compare and optional comparison focus.",
  {
    securities: s.array(
      "Stock names or exchange-qualified security codes to compare.",
      s.nonWhitespaceString("One stock name or exchange-qualified security code.", {
        maxLength: maxSecurityLength,
      }),
      { minItems: 2, maxItems: 10 },
    ),
    focus: optionalFocusSchema,
  },
  { optional: [] },
);

const companyNewsInputSchema = s.object(
  "The company news and announcements request.",
  {
    security: s.nonWhitespaceString("The company or security name, or an exchange-qualified security code.", {
      maxLength: maxSecurityLength,
    }),
    startDate: s.optional(s.date("The inclusive first publication date in YYYY-MM-DD format.")),
    endDate: s.optional(s.date("The inclusive last publication date in YYYY-MM-DD format.")),
    focus: optionalFocusSchema,
  },
  { optional: ["startDate", "endDate"] },
);

export const gildataActions: readonly ActionDefinition[] = [
  defineProviderAction("gildata", {
    name: "query_financial_data",

    operationType: "read",
    description:
      "Answer a natural-language financial data question across securities, funds, bonds, indices, market data, and company information.",
    requiredScopes: [],
    inputSchema: querySchema,
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "screen_stocks",

    operationType: "read",
    description:
      "Screen stocks or listed companies with natural-language conditions covering industries, trading metrics, financials, valuation, or technical patterns.",
    requiredScopes: [],
    followUpActions: ["gildata.get_stock_overview"],
    inputSchema: screeningSchema("stocks"),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "screen_funds",

    operationType: "read",
    description:
      "Screen funds or ETFs with natural-language conditions covering returns, risk, holdings, fund managers, categories, or overall evaluation.",
    requiredScopes: [],
    inputSchema: screeningSchema("funds"),
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "get_macro_data",

    operationType: "read",
    description:
      "Find macroeconomic or industry indicators for China, local regions, or global economies and return the relevant time-series data.",
    requiredScopes: [],
    inputSchema: querySchema,
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "search_research_reports",

    operationType: "read",
    description:
      "Search brokerage research about macroeconomics, industries, listed companies, funds, or market trends.",
    requiredScopes: [],
    inputSchema: querySchema,
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "get_stock_overview",

    operationType: "read",
    description:
      "Get a user-oriented stock overview covering the company, core business, recent market data, financial performance, valuation, peers, and consensus expectations.",
    requiredScopes: [],
    followUpActions: ["gildata.compare_stocks", "gildata.get_company_news_and_announcements"],
    inputSchema: stockOverviewInputSchema,
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "compare_stocks",

    operationType: "read",
    description:
      "Compare two or more stocks across business fundamentals, growth, profitability, cash flow, valuation, industry position, and market performance.",
    requiredScopes: [],
    followUpActions: ["gildata.get_stock_overview"],
    inputSchema: compareStocksInputSchema,
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "get_company_news_and_announcements",

    operationType: "read",
    description:
      "Find recent company news, exchange announcements, and earnings guidance with source and publication timestamps.",
    requiredScopes: [],
    inputSchema: companyNewsInputSchema,
    outputSchema: queryResultSchema,
  }),
  defineProviderAction("gildata", {
    name: "list_tools",

    operationType: "read",
    description:
      "Discover the current Gildata Data Map financial tools and live input schemas from the high-level tool service or the detailed API service.",
    requiredScopes: [],
    followUpActions: ["gildata.call_tool"],
    inputSchema: s.object(
      "The Gildata MCP service whose tools should be discovered.",
      {
        serverType: serverTypeSchema,
      },
      { optional: [] },
    ),
    outputSchema: s.object(
      "The current tool catalog for one Gildata MCP service.",
      {
        serverType: serverTypeSchema,
        tools: s.array("Tools currently exposed by the selected Gildata MCP service.", toolSchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("gildata", {
    name: "call_tool",

    operationType: "read",
    description:
      "Call a current Gildata Data Map financial MCP tool with JSON arguments after checking its live schema with list_tools.",
    requiredScopes: [],
    followUpActions: ["gildata.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current Gildata MCP tool.",
      {
        serverType: serverTypeSchema,
        toolName: s.nonWhitespaceString("The exact tool name returned by list_tools.", {
          maxLength: maxToolNameLength,
        }),
        arguments: toolArgumentsSchema,
      },
      { optional: ["arguments"] },
    ),
    outputSchema: queryResultSchema,
  }),
];
