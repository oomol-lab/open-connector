import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tongdaxin";

const securityCodeSchema = s.nonWhitespaceString(
  "The exact Tongdaxin security, board, index, or contract code without a market suffix.",
);
const marketCodeSchema = s.nonWhitespaceString(
  "The Tongdaxin market code returned by lookup_security for the selected instrument.",
);
const quoteCodeSchema = s.nonWhitespaceString(
  "The exact non-futures Tongdaxin security, board, index, or fund code without a market suffix.",
);
const quoteMarketCodeSchema = s.stringEnum(
  "The non-futures Tongdaxin market code returned by lookup_security for the selected instrument.",
  ["0", "1", "2", "31", "33", "62"],
);
const dateSchema = s.nonWhitespaceString("A date accepted by Tongdaxin, normally formatted as YYYYMMDD or YYYY-MM-DD.");
const reportDateSchema = s.nonWhitespaceString("The report date or reporting period formatted as YYYYMMDD.");
const pageNumberSchema = s.integer("The one-based result page number.", { minimum: 1 });
const pageSizeSchema = s.integer("The number of results to request per page.", {
  minimum: 1,
  maximum: 100,
});
const rawResultSchema = s.unknown(
  "The complete structured MCP tool result, preserved for fields not covered by the stable convenience fields.",
);
const looseRowSchema = s.looseObject("One provider-defined row returned by Tongdaxin.");
const lookupMatchSchema = s.looseRequiredObject(
  "A Tongdaxin instrument match normalized for direct use by market-data Actions.",
  {
    code: s.string("The exact Tongdaxin instrument code."),
    marketCode: s.string("The normalized string market code accepted by market-data Actions."),
    name: s.string("The instrument name returned by Tongdaxin."),
    type: s.string("The Tongdaxin instrument-type label."),
    aliases: s.stringArray("Known names and aliases for the instrument."),
  },
  { optional: ["name", "type", "aliases"] },
);
const lookupOutputSchema = s.object("Resolved Tongdaxin instruments and the complete result.", {
  matches: s.array("The matching instruments returned by Tongdaxin.", lookupMatchSchema),
  result: rawResultSchema,
});
const quotesOutputSchema = s.object("A normalized Tongdaxin real-time quote result.", {
  baseInformation: s.looseObject("Stable instrument identity and market metadata."),
  quote: s.looseObject("The current price, volume, amount, and session snapshot."),
  extendedInformation: s.looseObject("Extended quote and valuation fields."),
  orderBook: s.array("The returned bid and ask levels.", looseRowSchema),
  professionalInformation: s.looseObject("Professional market fields when requested."),
  financialInformation: s.looseObject("Financial and valuation fields when requested."),
  statistics: s.looseObject("Statistical and ranking fields when requested."),
  result: rawResultSchema,
});
const klineOutputSchema = s.object("A normalized Tongdaxin historical K-line result.", {
  code: s.string("The instrument code returned by Tongdaxin."),
  period: {
    description: "The upstream K-line period identifier.",
    anyOf: [{ type: "string" }, { type: "number" }],
  },
  rows: s.array("The returned OHLCV rows.", looseRowSchema),
  statistics: s.looseObject("Statistics calculated for the returned K-line interval."),
  result: rawResultSchema,
});
const collectionOutputSchema = s.object("Tongdaxin query values and the complete result.", {
  data: s.array(
    "The provider-defined values returned by Tongdaxin.",
    s.unknown("One provider-defined value returned by Tongdaxin."),
  ),
  result: rawResultSchema,
});
const screenerOutputSchema = s.object("A normalized Tongdaxin screening result.", {
  summary: s.nullableString("The result summary, or null when Tongdaxin omits one."),
  metadata: s.looseObject("Pagination, range, and query metadata."),
  headers: s.stringArray("The ordered column headers for returned screening rows."),
  data: s.array("The securities or entities matching the screening criteria.", looseRowSchema),
  result: rawResultSchema,
});
const searchOutputSchema = s.object("A normalized Tongdaxin current-information search result.", {
  ok: s.nullableBoolean("Whether the underlying Wenda request reported success."),
  query: s.nullableString("The structured query sent to Wenda, or null when omitted."),
  data: s.nullable(s.unknown("The provider-defined search rows returned by Wenda, or null when unavailable.")),
  result: rawResultSchema,
});
const f10OutputSchema = s.unknown("The transformed F10 data returned by Tongdaxin, preserved as any JSON value.");

function defineReadAction(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema = f10OutputSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

function createWendaSearchInput(description: string) {
  const schema = s.object(
    description,
    {
      query: s.nonWhitespaceString(
        "A natural-language fallback query used only when structured subject fields are unavailable; startDate and endDate are required with this field.",
      ),
      name: s.nonWhitespaceString("The company, security, industry, board, theme, or other subject name to search."),
      symbol: s.nonWhitespaceString("The optional security code or short symbol to search."),
      startDate: s.describe(
        dateSchema,
        "The search start date; provide it together with endDate, and always provide both for relative or current natural-language queries.",
      ),
      endDate: s.describe(
        dateSchema,
        "The search end date; provide it together with startDate, and always provide both for relative or current natural-language queries.",
      ),
      keywords: s.nonWhitespaceString("Comma-separated keywords used to narrow the Tongdaxin search."),
      context: s.nonWhitespaceString("Additional instructions appended to the structured Tongdaxin search."),
    },
    { optional: ["query", "name", "symbol", "startDate", "endDate", "keywords", "context"] },
  );
  const schemaWithSubject = s.requireAnyProperty(schema, ["query", "name", "symbol"]);
  schemaWithSubject.anyOf = [
    { required: ["query", "startDate", "endDate"] },
    { required: ["name"] },
    { required: ["symbol"] },
  ];
  return requirePairedFields(schemaWithSubject, "startDate", "endDate");
}

function requirePairedFields(schema: Record<string, unknown>, left: string, right: string) {
  const schemaWithRuntimeRequirements = schema;
  schemaWithRuntimeRequirements.allOf = [
    { if: { required: [left] }, then: { required: [right] } },
    { if: { required: [right] }, then: { required: [left] } },
  ];
  return schemaWithRuntimeRequirements;
}

function createScreenInput(description: string) {
  return s.object(
    description,
    {
      criteria: s.nonWhitespaceString(
        "Natural-language screening criteria covering technical, capital-flow, or fundamental conditions.",
      ),
      page: pageNumberSchema,
      pageSize: pageSizeSchema,
    },
    { optional: ["page", "pageSize"] },
  );
}

function requireFieldsBySelector(
  schema: JsonSchema,
  selector: string,
  requirements: Record<string, readonly string[]>,
) {
  const schemaWithRuntimeRequirements = schema;
  schemaWithRuntimeRequirements.allOf = Object.entries(requirements).map(([selectorValue, fields]) => {
    const serializedSelectorValue = selectorValue === "true" ? true : selectorValue === "false" ? false : selectorValue;
    return {
      if: {
        properties: { [selector]: { const: serializedSelectorValue } },
        required: [selector],
      },
      then: { required: [...fields] },
    };
  });
  return schemaWithRuntimeRequirements;
}

export const tongdaxinNamedActions: readonly ActionDefinition[] = [
  defineReadAction(
    "lookup_security",
    "Resolve a security, fund, index, futures contract, or option underlying to Tongdaxin codes and market parameters.",
    s.object("Input for resolving an instrument in a specific Tongdaxin market.", {
      query: s.nonWhitespaceString("The instrument name, abbreviation, alias, or code to resolve."),
      market: s.stringEnum("The Tongdaxin market range to search.", [
        "A_SHARE",
        "HK_STOCK",
        "HK_FUND",
        "FUND",
        "US_STOCK",
        "INDEX",
        "FUTURES",
        "OPTION",
      ]),
    }),
    lookupOutputSchema,
  ),
  defineReadAction(
    "get_quotes",
    "Get a real-time Tongdaxin market snapshot with optional order-book, valuation, financial, and ranking data.",
    requireFieldsBySelector(
      s.object(
        "Input for a Tongdaxin real-time quote request.",
        {
          code: quoteCodeSchema,
          marketCode: quoteMarketCodeSchema,
          orderBookDepth: s.integer("The number of bid and ask levels to return, from 0 to 10.", {
            minimum: 0,
            maximum: 10,
          }),
          includeProfessionalData: s.boolean(
            "Whether to include inner volume, outer volume, order imbalance, and related professional fields.",
          ),
          includeFinancialData: s.boolean(
            "Whether to include PE, PB, ROE, total market value, and float market value.",
          ),
          includeStatistics: s.boolean("Whether to include Tongdaxin statistical and ranking data."),
          statisticParameter: s.nonWhitespaceString(
            "The Tongdaxin statistic selector used when statistical data is requested.",
          ),
        },
        {
          optional: [
            "orderBookDepth",
            "includeProfessionalData",
            "includeFinancialData",
            "includeStatistics",
            "statisticParameter",
          ],
        },
      ),
      "includeStatistics",
      { true: ["statisticParameter"] },
    ),
    quotesOutputSchema,
  ),
  defineReadAction(
    "get_kline",
    "Get Tongdaxin historical OHLCV data for a security, index, board, or futures contract.",
    s.object(
      "Input for a Tongdaxin historical K-line request.",
      {
        code: securityCodeSchema,
        marketCode: marketCodeSchema,
        period: s.stringEnum("The K-line period to request.", [
          "5_SECONDS",
          "1_MINUTE",
          "5_MINUTES",
          "15_MINUTES",
          "30_MINUTES",
          "1_HOUR",
          "DAILY",
          "WEEKLY",
          "MONTHLY",
          "QUARTERLY",
          "YEARLY",
        ]),
        count: s.integer("The number of K-line rows to return.", { minimum: 1, maximum: 1000 }),
        offset: s.integer("The zero-based backward offset used to page through history.", {
          minimum: 0,
        }),
        adjustment: s.stringEnum("The price adjustment method.", ["NONE", "FORWARD", "BACKWARD"]),
        includeIpoPrice: s.boolean("Whether to include the issue price when Tongdaxin supplies it."),
      },
      { optional: ["count", "offset", "includeIpoPrice"] },
    ),
    klineOutputSchema,
  ),
  defineReadAction(
    "query_indicators",
    "Query Tongdaxin valuation, financial, company, shareholder, market, concept, or industry-chain indicators for named entities.",
    s.object("Input for a natural-language Tongdaxin indicator query.", {
      query: s.nonWhitespaceString(
        "A single request containing both the named entity and the indicators or facts to return.",
      ),
      market: s.stringEnum("The entity market or asset range.", ["A_SHARE", "INDEX", "FUND"]),
    }),
    collectionOutputSchema,
  ),
  defineReadAction(
    "screen_stocks",
    "Screen A-share securities with natural-language technical, capital-flow, and fundamental criteria.",
    createScreenInput("Input for screening A-share securities."),
    screenerOutputSchema,
  ),
  defineReadAction(
    "screen_hk_stocks",
    "Screen Hong Kong stocks with natural-language technical, capital-flow, and fundamental criteria.",
    createScreenInput("Input for screening Hong Kong stocks."),
    screenerOutputSchema,
  ),
  defineReadAction(
    "screen_funds",
    "Screen funds with natural-language performance, manager, risk, holding, or allocation criteria.",
    createScreenInput("Input for screening funds."),
    screenerOutputSchema,
  ),
  defineReadAction(
    "screen_indices",
    "Screen indices with natural-language market, valuation, performance, or technical criteria.",
    createScreenInput("Input for screening indices."),
    screenerOutputSchema,
  ),
  defineReadAction(
    "screen_fund_managers",
    "Screen fund managers with natural-language experience, performance, product, or risk criteria.",
    createScreenInput("Input for screening fund managers."),
    screenerOutputSchema,
  ),
  defineReadAction(
    "search_news",
    "Search current Tongdaxin financial news, market briefs, themes, and company-related information.",
    createWendaSearchInput("Structured filters for a Tongdaxin financial news search."),
    searchOutputSchema,
  ),
  defineReadAction(
    "search_announcements",
    "Search Tongdaxin company announcements, regulatory filings, and periodic reports.",
    createWendaSearchInput("Structured filters for a Tongdaxin announcement search."),
    searchOutputSchema,
  ),
  defineReadAction(
    "search_reports",
    "Search Tongdaxin broker research, rating changes, target prices, and opinion summaries.",
    createWendaSearchInput("Structured filters for a Tongdaxin broker research search."),
    searchOutputSchema,
  ),
  defineReadAction(
    "query_macro_data",
    "Query Tongdaxin macroeconomic data such as GDP, CPI, PPI, social financing, money supply, interest rates, exchange rates, trade, employment, and population.",
    s.object("Input for a Tongdaxin macroeconomic data query.", {
      query: s.nonWhitespaceString(
        "A five-part pipe-delimited query formatted as subject|start date|end date|keywords|context; dates must be concrete YYYYMMDD values.",
      ),
    }),
    searchOutputSchema,
  ),
  defineReadAction(
    "get_financial_statements",
    "Get structured A-share income statements, balance sheets, or cash-flow statements from Tongdaxin F10.",
    s.object(
      "Input for an A-share financial statement query.",
      {
        code: securityCodeSchema,
        statement: s.stringEnum("The financial statement to return.", [
          "INCOME_STATEMENT",
          "BALANCE_SHEET",
          "CASH_FLOW_STATEMENT",
        ]),
        reportView: s.stringEnum("Whether to use reporting-period or single-quarter figures.", [
          "REPORTING_PERIOD",
          "SINGLE_QUARTER",
        ]),
      },
      { optional: ["reportView"] },
    ),
  ),
  defineReadAction(
    "get_company_profile",
    "Get a Tongdaxin company overview, basic profile, issuance history, executives, or affiliates.",
    s.object("Input for a Tongdaxin company-profile query.", {
      code: securityCodeSchema,
      section: s.stringEnum("The company-profile section to return.", [
        "OVERVIEW",
        "BASIC_INFORMATION",
        "ISSUANCE_AND_TRADING",
        "EXECUTIVES",
        "AFFILIATES",
        "EMPLOYEE_STRUCTURE",
        "EMPLOYEE_EFFICIENCY",
      ]),
    }),
  ),
  defineReadAction(
    "get_shareholder_research",
    "Get Tongdaxin controlling-shareholder, shareholder-count, ranking, or top-shareholder data.",
    s.object(
      "Input for a Tongdaxin shareholder-research query.",
      {
        code: securityCodeSchema,
        section: s.stringEnum("The shareholder dataset to return.", [
          "CONTROLLING_SHAREHOLDER",
          "SHAREHOLDER_COUNT",
          "SHAREHOLDER_COUNT_RANK",
          "TOP_FLOAT_SHAREHOLDERS",
          "TOP_SHAREHOLDERS",
        ]),
        page: pageNumberSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["page", "pageSize"] },
    ),
  ),
  defineReadAction(
    "get_institutional_holdings",
    "Get Tongdaxin institutional-holding periods, summaries, distributions, details, northbound holdings, or price comparisons.",
    requireFieldsBySelector(
      s.object(
        "Input for a Tongdaxin institutional-holdings query.",
        {
          code: securityCodeSchema,
          section: s.stringEnum("The institutional-holdings dataset to return.", [
            "AVAILABLE_DATES",
            "SUMMARY",
            "OVERVIEW",
            "DETAIL",
            "NORTHBOUND_FUNDS",
            "PRICE_COMPARISON",
          ]),
          reportDate: reportDateSchema,
          date: dateSchema,
          sort: s.nonWhitespaceString("The upstream sort selector for detailed holdings."),
          institutionType: s.nonWhitespaceString("The upstream institution-type selector for detailed holdings."),
          comparison: s.nonWhitespaceString("The upstream comparison selector for holdings versus price."),
          page: pageNumberSchema,
          pageSize: pageSizeSchema,
        },
        {
          optional: ["reportDate", "date", "sort", "institutionType", "comparison", "page", "pageSize"],
        },
      ),
      "section",
      {
        OVERVIEW: ["reportDate"],
        DETAIL: ["reportDate", "sort", "institutionType"],
        NORTHBOUND_FUNDS: ["date"],
        PRICE_COMPARISON: ["comparison"],
      },
    ),
  ),
  defineReadAction(
    "get_capital_and_trading_data",
    "Get Tongdaxin capital flow, northbound holdings, block trades, margin data, refinancing, limit analysis, or shareholder-change events.",
    requireFieldsBySelector(
      s.object(
        "Input for a Tongdaxin capital, trading, or stock-event query.",
        {
          code: securityCodeSchema,
          section: s.stringEnum("The capital, trading, or stock-event dataset to return.", [
            "CAPITAL_FLOW",
            "NORTHBOUND_FUNDS",
            "BLOCK_TRADE",
            "BLOCK_TRADE_INTENTION",
            "MARGIN_TRADING",
            "REFINANCING",
            "LIMIT_UP_ANALYSIS",
            "LIMIT_DOWN_ANALYSIS",
            "SHAREHOLDER_CHANGE",
            "TOP_SHAREHOLDER_DETAIL",
          ]),
          date: dateSchema,
          startDate: dateSchema,
          endDate: dateSchema,
          reportDate: reportDateSchema,
          sort: s.nonWhitespaceString("The upstream sort selector for detailed shareholder data."),
          shareholderType: s.nonWhitespaceString(
            "The upstream shareholder-type selector for detailed shareholder data.",
          ),
          selectedIndex: s.integer("The selected upstream result index.", { minimum: 0 }),
          page: pageNumberSchema,
          pageSize: pageSizeSchema,
        },
        {
          optional: [
            "date",
            "startDate",
            "endDate",
            "reportDate",
            "sort",
            "shareholderType",
            "selectedIndex",
            "page",
            "pageSize",
          ],
        },
      ),
      "section",
      {
        NORTHBOUND_FUNDS: ["date"],
        BLOCK_TRADE: ["date"],
        SHAREHOLDER_CHANGE: ["startDate", "endDate"],
        TOP_SHAREHOLDER_DETAIL: ["reportDate", "sort", "shareholderType", "selectedIndex"],
      },
    ),
  ),
  defineReadAction(
    "get_dividends_and_financing",
    "Get Tongdaxin dividend, payout, yield, rights-issue, placement, or refinancing data.",
    s.object("Input for a Tongdaxin dividend and financing query.", {
      code: securityCodeSchema,
      section: s.stringEnum("The dividend or financing dataset to return.", [
        "OVERVIEW",
        "DIVIDEND_CHART",
        "RIGHTS_ISSUE_PLAN",
        "PLACEMENT_DETAIL",
        "REFINANCING_PLAN",
        "PAYOUT_HISTORY",
        "YIELD_HISTORY",
        "PAYOUT_RANK",
        "YIELD_RANK",
        "CASH_FINANCING_RATIO_RANK",
      ]),
    }),
  ),
  defineReadAction(
    "get_share_capital",
    "Get Tongdaxin share-capital structure, historical changes, restricted-share unlocks, or stock buybacks.",
    s.object("Input for a Tongdaxin share-capital query.", {
      code: securityCodeSchema,
      section: s.stringEnum("The share-capital dataset to return.", [
        "STRUCTURE",
        "CHANGES",
        "RESTRICTED_UNLOCKS",
        "STOCK_BUYBACK",
      ]),
    }),
  ),
  defineReadAction(
    "get_valuation_and_ranking",
    "Get Tongdaxin valuation history, industry rankings, financial-sector indicators, or board valuation comparisons.",
    requireFieldsBySelector(
      s.object(
        "Input for a Tongdaxin valuation or ranking query.",
        {
          code: s.optional(securityCodeSchema),
          section: s.stringEnum("The valuation or ranking dataset to return.", [
            "VALUATION_HISTORY",
            "INDUSTRY_FINANCIAL_RANK",
            "INDUSTRY_VALUATION_RANK",
            "FINANCIAL_SECTOR_INDICATORS",
            "BOARD_RELATIVE_VALUATION",
            "BOARD_HISTORY_VALUATION",
          ]),
          reportDate: reportDateSchema,
          timeRange: s.nonWhitespaceString("The valuation-history range, such as 1Y, accepted by Tongdaxin."),
          valuationMetric: s.nonWhitespaceString("The valuation metric, such as PE or PB, accepted by Tongdaxin."),
          boardCode: s.nonWhitespaceString("The Tongdaxin board or index code used for comparison."),
        },
        { optional: ["reportDate", "timeRange", "valuationMetric", "boardCode"] },
      ),
      "section",
      {
        VALUATION_HISTORY: ["code", "timeRange", "valuationMetric"],
        INDUSTRY_FINANCIAL_RANK: ["code", "reportDate"],
        INDUSTRY_VALUATION_RANK: ["code", "reportDate"],
        FINANCIAL_SECTOR_INDICATORS: ["code", "reportDate"],
        BOARD_RELATIVE_VALUATION: ["code", "boardCode"],
        BOARD_HISTORY_VALUATION: ["boardCode"],
      },
    ),
  ),
  defineReadAction(
    "get_board_and_industry_data",
    "Get Tongdaxin board profiles, returns, market statistics, industry chains, or important industry events.",
    s.object(
      "Input for a Tongdaxin board or industry query.",
      {
        code: securityCodeSchema,
        section: s.stringEnum("The board or industry dataset to return.", [
          "BOARD_BASIC_INFORMATION",
          "BOARD_DETAIL",
          "BOARD_STAGE_RETURN",
          "BOARD_MARKET_STATISTICS",
          "INDUSTRY_CHAIN",
          "INDUSTRY_IMPORTANT_EVENTS",
        ]),
        period: s.nonWhitespaceString("The board return period accepted by Tongdaxin, such as 1m."),
        title: s.nonWhitespaceString("An optional title filter for important industry events."),
      },
      { optional: ["period", "title"] },
    ),
  ),
  defineReadAction(
    "get_hot_topics",
    "Get Tongdaxin board-family, theme-library, event-driven, or information-overview data for a stock.",
    s.object("Input for a Tongdaxin hot-topic query.", {
      code: securityCodeSchema,
      section: s.stringEnum("The hot-topic dataset to return.", [
        "BOARD_FAMILY",
        "THEME_LIBRARY",
        "EVENT_DRIVEN",
        "INFORMATION_OVERVIEW",
      ]),
    }),
  ),
  defineReadAction(
    "get_hk_financials",
    "Get Tongdaxin Hong Kong income statements, balance sheets, or cash-flow statements.",
    s.object("Input for a Tongdaxin Hong Kong financial-statement query.", {
      code: securityCodeSchema,
      statement: s.stringEnum("The Hong Kong financial statement to return.", [
        "INCOME_STATEMENT",
        "BALANCE_SHEET",
        "CASH_FLOW_STATEMENT",
      ]),
    }),
  ),
];
