import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aifinmarket" as const;
const maxQueryLength = 4_000;
const maxToolArgumentsBytes = 1_000_000;

export const aifinMarketServerTypes = [
  "stock_data",
  "fund_data",
  "index_data",
  "bond_data",
  "financial_docs",
  "economic_data",
  "analytics_data",
] as const;

export type AifinMarketServerType = (typeof aifinMarketServerTypes)[number];

const serverTypeSchema = s.stringEnum("The Wind MCP service family that owns the requested tool.", [
  ...aifinMarketServerTypes,
]);

const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by Wind.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside Wind.")),
});

const toolSchema = s.object(
  "A tool currently exposed by one Wind MCP service.",
  {
    name: s.nonEmptyString("The exact Wind MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by Wind MCP."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by Wind MCP."),
  },
  { optional: ["description", "annotations"] },
);

const toolResultOutputSchema = s.object("The normalized result returned by the Wind MCP tool.", {
  result: s.unknown(
    "The tool result. Structured MCP content is returned directly; otherwise the MCP content envelope is preserved.",
  ),
});

const windcodeSchema = s.nonWhitespaceString(
  "One or more Wind security names or codes separated by commas, with at most 50 securities per call.",
  { maxLength: 2_000 },
);

const priceIndicatorInputSchema = s.object("Input for reading current price indicators for up to 50 securities.", {
  windcode: windcodeSchema,
  indexes: s.optional(
    s.nonWhitespaceString("Comma-separated Wind indicator names to return; omit to use Wind defaults.", {
      maxLength: maxQueryLength,
    }),
  ),
});

const klinePeriodSchema = s.stringEnum("The requested K-line aggregation period.", [
  "1min",
  "5min",
  "10min",
  "15min",
  "30min",
  "60min",
  "120min",
  "240min",
  "1d",
  "1w",
  "1mo",
  "1y",
  "1q",
  "6mo",
]);

const klineInputSchema = s.object(
  "Input for reading a security K-line series over an explicit date range.",
  {
    windcode: s.nonWhitespaceString("The Wind security name or code.", {
      maxLength: 200,
    }),
    begin_date: s.date("The inclusive start date in YYYY-MM-DD format."),
    end_date: s.date("The inclusive end date in YYYY-MM-DD format."),
    period: s.optional(klinePeriodSchema),
    aftype: s.optional(
      s.stringEnum("The adjustment type: 0 for forward adjustment or 1 for backward adjustment.", ["0", "1"]),
    ),
    issusp: s.optional(s.stringEnum("Whether to include suspended periods: 0 to exclude or 1 to include.", ["0", "1"])),
    afdate: s.optional(s.date("The optional adjustment base date in YYYY-MM-DD format.")),
  },
  { optional: ["period", "aftype", "issusp", "afdate"] },
);

const questionInputSchema = s.object("Input for a natural-language Wind data query.", {
  question: s.nonWhitespaceString(
    "A natural-language request containing the relevant entity, indicators, and date or reporting period when applicable.",
    { maxLength: maxQueryLength },
  ),
});

const documentSearchInputSchema = s.object(
  "Input for searching Wind financial documents.",
  {
    query: s.nonWhitespaceString(
      "A natural-language search query containing the topic or entity and date range when applicable.",
      { maxLength: maxQueryLength },
    ),
    top_k: s.optional(
      s.positiveInteger("The maximum number of relevant documents or excerpts to return; defaults to 5.", {
        maximum: 100,
      }),
    ),
  },
  { optional: ["top_k"] },
);

const economicDataInputSchema = s.object(
  "Input for searching or fetching Wind EDB economic indicators.",
  {
    executionMode: s.stringEnum("Whether to search indicators, fetch values, or do both.", [
      "search",
      "fetch",
      "searchFetch",
      "仅搜索",
      "仅提数",
      "搜索并提数",
    ]),
    question: s.nonWhitespaceString(
      "A natural-language indicator query for search modes, or comma-separated EDB indicator codes for fetch mode.",
      { maxLength: maxQueryLength },
    ),
    beginDate: s.optional(s.date("The inclusive data start date in YYYY-MM-DD format.")),
    endDate: s.optional(s.date("The inclusive data end date in YYYY-MM-DD format.")),
    observation: s.optional(
      s.string({
        minLength: 1,
        maxLength: 6,
        pattern: "^(all|[0-9]+)$",
        description: "A number of recent observations, or all for the complete series.",
      }),
    ),
  },
  { optional: ["beginDate", "endDate", "observation"] },
);

interface NamedActionEntry {
  serverType: AifinMarketServerType;
  action: ProviderActionDefinition;
}

function defineNamedAction(
  name: string,
  serverType: AifinMarketServerType,
  description: string,
  inputSchema: JsonSchema,
): NamedActionEntry {
  return {
    serverType,
    action: defineProviderAction(service, {
      name,
      operationType: "read",
      description,
      inputSchema,
      outputSchema: toolResultOutputSchema,
    }),
  };
}

const namedActionEntries = [
  defineNamedAction(
    "get_stock_price_indicators",
    "stock_data",
    "Get the current price, trading, valuation, and market-cap indicators for up to 50 stocks.",
    priceIndicatorInputSchema,
  ),
  defineNamedAction(
    "get_stock_kline",
    "stock_data",
    "Get historical stock K-line price and volume data for an explicit date range and period.",
    klineInputSchema,
  ),
  defineNamedAction(
    "search_stocks",
    "stock_data",
    "Screen stock markets with natural-language financial, valuation, technical, or business criteria.",
    questionInputSchema,
  ),
  defineNamedAction(
    "get_stock_fundamentals",
    "stock_data",
    "Get stock financial statement, ratio, valuation, dividend, and market-cap data using a natural-language query.",
    questionInputSchema,
  ),
  defineNamedAction(
    "get_fund_price_indicators",
    "fund_data",
    "Get the current trading indicators for up to 50 exchange-traded funds or listed open-ended funds.",
    priceIndicatorInputSchema,
  ),
  defineNamedAction(
    "get_fund_kline",
    "fund_data",
    "Get historical ETF or LOF K-line price data for an explicit date range and period.",
    klineInputSchema,
  ),
  defineNamedAction(
    "search_funds",
    "fund_data",
    "Screen funds with natural-language performance, size, fee, holding, or product criteria.",
    questionInputSchema,
  ),
  defineNamedAction(
    "get_fund_performance",
    "fund_data",
    "Get fund NAV, returns, rankings, risk-adjusted metrics, ratings, and performance data using a natural-language query.",
    questionInputSchema,
  ),
  defineNamedAction(
    "get_index_price_indicators",
    "index_data",
    "Get the current price and trading indicators for up to 50 indices or sectors.",
    priceIndicatorInputSchema,
  ),
  defineNamedAction(
    "get_index_kline",
    "index_data",
    "Get historical index or sector K-line data for an explicit date range and period.",
    klineInputSchema,
  ),
  defineNamedAction(
    "get_company_announcements",
    "financial_docs",
    "Search listed-company announcements by company, document type, topic, and time range.",
    documentSearchInputSchema,
  ),
  defineNamedAction(
    "get_financial_news",
    "financial_docs",
    "Search financial news by topic, entity, and time range.",
    documentSearchInputSchema,
  ),
  defineNamedAction(
    "natural_language_get_edb_data",
    "economic_data",
    "Search Wind EDB economic indicators, fetch their time-series values, or do both.",
    economicDataInputSchema,
  ),
];

const toolArgumentsSchema = s.looseObject(
  `JSON arguments matching the inputSchema returned for the selected tool; serialized arguments must not exceed ${maxToolArgumentsBytes} bytes.`,
);

export const aifinMarketActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover the current Wind financial data tools and their live input schemas for stocks, funds, indices, bonds, documents, economics, or analytics.",
    followUpActions: ["aifinmarket.call_tool"],
    inputSchema: s.object("The Wind MCP service whose tools should be discovered.", {
      serverType: serverTypeSchema,
    }),
    outputSchema: s.object("The current tool catalog for one Wind MCP service.", {
      serverType: serverTypeSchema,
      tools: s.array("Tools currently exposed by the selected Wind MCP service.", toolSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "call_tool",
    operationType: "write",
    description:
      "Call a current Wind financial data MCP tool with JSON arguments after checking its live schema with list_tools.",
    followUpActions: ["aifinmarket.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current Wind MCP tool.",
      {
        serverType: serverTypeSchema,
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: toolArgumentsSchema,
      },
      { optional: ["arguments"] },
    ),
    outputSchema: toolResultOutputSchema,
  }),
  ...namedActionEntries.map((entry) => entry.action),
];
