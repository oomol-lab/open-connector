import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gangtise" as const;

const marketSchema = s.stringEnum("The Gangtise market to query.", [
  "a_share",
  "hong_kong",
  "united_states",
  "index",
] as const);

const companyMarketSchema = s.stringEnum("The Gangtise company financial market to query.", [
  "a_share",
  "hong_kong",
  "united_states",
] as const);

const nullableScalarSchema = (description: string) =>
  s.anyOf(description, [s.number(description), s.string(description), { type: "null", description }]);

const exactSecuritiesSchema = (description = "The exact Gangtise security codes to query.") =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "An exact Gangtise security code such as 600519.SH.",
  });

const dynamicRowSchema = s.looseObject("One normalized row using the official Gangtise field names.");

const searchResultSchema = s.object("A security matched by Gangtise.", {
  code: s.nonEmptyString("The Gangtise security code used by data endpoints."),
  name: s.nonEmptyString("The security name returned by Gangtise."),
  category: s.nullableString("The Gangtise security category, or null when omitted."),
  matchScore: s.nullableNumber("The upstream search match score, or null when omitted."),
});

const dailyKlineRowSchema = s.object("One normalized daily K-line row.", {
  securityCode: s.nullableString("The Gangtise security code for this row."),
  tradeDate: s.nullableString("The trading date returned by Gangtise."),
  open: nullableScalarSchema("The opening price, or null when unavailable."),
  high: nullableScalarSchema("The highest price, or null when unavailable."),
  low: nullableScalarSchema("The lowest price, or null when unavailable."),
  close: nullableScalarSchema("The closing price, or null when unavailable."),
  preClose: nullableScalarSchema("The previous closing price, or null when unavailable."),
  change: nullableScalarSchema("The absolute price change, or null when unavailable."),
  pctChange: nullableScalarSchema("The percentage price change, or null when unavailable."),
  volume: nullableScalarSchema("The trading volume, or null when unavailable."),
  amount: nullableScalarSchema("The trading amount, or null when unavailable."),
});

const minuteKlineRowSchema = s.object("One normalized minute K-line row.", {
  securityCode: s.nullableString("The Gangtise security code for this row."),
  tradeTime: s.nullableString("The minute timestamp returned by Gangtise."),
  open: nullableScalarSchema("The opening price, or null when unavailable."),
  high: nullableScalarSchema("The highest price, or null when unavailable."),
  low: nullableScalarSchema("The lowest price, or null when unavailable."),
  close: nullableScalarSchema("The closing price, or null when unavailable."),
  change: nullableScalarSchema("The absolute price change, or null when unavailable."),
  pctChange: nullableScalarSchema("The percentage price change, or null when unavailable."),
  volume: nullableScalarSchema("The trading volume, or null when unavailable."),
  amount: nullableScalarSchema("The trading amount, or null when unavailable."),
});

const realtimeQuoteSchema = s.object("One normalized real-time quote row.", {
  securityCode: s.nullableString("The Gangtise security code for this quote."),
  exchange: s.nullableString("The exchange identifier returned by Gangtise."),
  tradeDate: s.nullableString("The trading date returned by Gangtise."),
  tradeTime: s.nullableString("The quote time returned by Gangtise."),
  latestPrice: nullableScalarSchema("The latest price, or null when unavailable."),
  open: nullableScalarSchema("The opening price, or null when unavailable."),
  high: nullableScalarSchema("The highest price, or null when unavailable."),
  low: nullableScalarSchema("The lowest price, or null when unavailable."),
  preClose: nullableScalarSchema("The previous closing price, or null when unavailable."),
  change: nullableScalarSchema("The absolute price change, or null when unavailable."),
  pctChange: nullableScalarSchema("The percentage price change, or null when unavailable."),
  volume: nullableScalarSchema("The trading volume, or null when unavailable."),
  amount: nullableScalarSchema("The trading amount, or null when unavailable."),
  amplitude: nullableScalarSchema("The trading amplitude, or null when unavailable."),
});

const valuationRowSchema = s.object("One normalized Gangtise valuation observation.", {
  securityCode: s.nonEmptyString("The Gangtise security code."),
  indicator: s.nonEmptyString("The official Gangtise valuation indicator code."),
  tradeDate: s.nullableString("The valuation observation date, or null when unavailable."),
  value: nullableScalarSchema("The valuation metric value, or null when unavailable."),
  percentileRank: nullableScalarSchema("The metric percentile within the requested range, or null when unavailable."),
});

const earningsForecastRowSchema = s.object("One normalized Gangtise consensus forecast row.", {
  securityCode: s.nonEmptyString("The Gangtise security code."),
  securityName: s.nullableString("The security name, or null when unavailable."),
  updateDate: s.nonEmptyString("The forecast update date."),
  forecastYear: s.nonEmptyString("The fiscal year covered by this forecast."),
  netIncome: nullableScalarSchema("The forecast net income, or null when unavailable."),
  netIncomeYoy: nullableScalarSchema("The forecast year-over-year net income growth, or null when unavailable."),
  eps: nullableScalarSchema("The forecast earnings per share, or null when unavailable."),
  pe: nullableScalarSchema("The forecast price-to-earnings ratio, or null when unavailable."),
  bps: nullableScalarSchema("The forecast book value per share, or null when unavailable."),
  pb: nullableScalarSchema("The forecast price-to-book ratio, or null when unavailable."),
  peg: nullableScalarSchema("The forecast PEG ratio, or null when unavailable."),
  roe: nullableScalarSchema("The forecast return on equity, or null when unavailable."),
  ps: nullableScalarSchema("The forecast price-to-sales ratio, or null when unavailable."),
});

const mainBusinessRowSchema = s.object("One normalized main-business breakdown row.", {
  securityCode: s.nonEmptyString("The Gangtise security code."),
  securityName: s.nullableString("The security name, or null when unavailable."),
  breakdown: s.stringEnum("The dimension used for this row.", ["product", "industry", "region"]),
  periodName: s.nullableString("The reporting period name, or null when unavailable."),
  periodEndDate: s.nullableString("The reporting period end date, or null when unavailable."),
  categoryName: s.nullableString("The product, industry, or region name."),
  opRevenue: nullableScalarSchema("The operating revenue, or null when unavailable."),
  opRevenueYoy: nullableScalarSchema("The year-over-year operating revenue growth, or null when unavailable."),
  opRevenueRatio: nullableScalarSchema("The operating revenue contribution ratio, or null when unavailable."),
  opCost: nullableScalarSchema("The operating cost, or null when unavailable."),
  opCostYoy: nullableScalarSchema("The year-over-year operating cost growth, or null when unavailable."),
  opCostRatio: nullableScalarSchema("The operating cost contribution ratio, or null when unavailable."),
  grossProfit: nullableScalarSchema("The gross profit, or null when unavailable."),
  grossProfitYoy: nullableScalarSchema("The year-over-year gross profit growth, or null when unavailable."),
  grossProfitRatio: nullableScalarSchema("The gross profit contribution ratio, or null when unavailable."),
  grossMargin: nullableScalarSchema("The gross margin, or null when unavailable."),
  grossMarginYoy: nullableScalarSchema("The year-over-year gross margin growth, or null when unavailable."),
  grossMarginRatio: nullableScalarSchema("The gross margin contribution ratio, or null when unavailable."),
});

const shareholderRowSchema = s.object("One normalized top-shareholder row.", {
  securityCode: s.nonEmptyString("The Gangtise security code."),
  holderType: s.stringEnum("The requested shareholder table.", ["top10", "top10Float"]),
  reportPeriod: s.nullableString("The report period, or null when unavailable."),
  rank: nullableScalarSchema("The shareholder rank, or null when unavailable."),
  shareholderName: s.nullableString("The shareholder name, or null when unavailable."),
  shareholderType: s.nullableString("The shareholder type, or null when unavailable."),
  holdingNum: nullableScalarSchema("The number of shares held, or null when unavailable."),
  holdingPct: nullableScalarSchema("The holding percentage, or null when unavailable."),
  chgNum: nullableScalarSchema("The holding change amount, or null when unavailable."),
  chgPct: nullableScalarSchema("The holding change percentage, or null when unavailable."),
  shareCategory: s.nullableString("The share category, or null when unavailable."),
});

const fundFlowRowSchema = s.object("One normalized daily fund-flow row.", {
  securityCode: s.nullableString("The Gangtise security code for this row."),
  tradeDate: s.nullableString("The trading date returned by Gangtise."),
  smallNetInflow: nullableScalarSchema("The small-order net inflow, or null when unavailable."),
  mediumNetInflow: nullableScalarSchema("The medium-order net inflow, or null when unavailable."),
  largeNetInflow: nullableScalarSchema("The large-order net inflow, or null when unavailable."),
  xlargeNetInflow: nullableScalarSchema("The extra-large-order net inflow, or null when unavailable."),
  totalNetInflow: nullableScalarSchema("The total net inflow, or null when unavailable."),
  mainNetInflow: nullableScalarSchema("The main-fund net inflow, or null when unavailable."),
});

const indicatorSearchResultSchema = s.object("A Gangtise company indicator search result.", {
  indicatorCode: s.nonEmptyString("The indicator code required by indicator data requests."),
  indicatorName: s.nonEmptyString("The human-readable indicator name."),
  description: s.nullableString("The indicator description, or null when unavailable."),
  score: s.nullableNumber("The search relevance score, or null when unavailable."),
  scopeList: s.array(
    "The supported market and security scopes.",
    s.looseObject("One official Gangtise indicator scope."),
  ),
  parameterList: s.array(
    "The optional or required parameters accepted by this indicator.",
    s.looseObject("One official Gangtise indicator parameter definition."),
  ),
});

const indicatorRowSchema = s.object("One normalized company indicator value.", {
  date: s.nullableString("The value date, or null when unavailable."),
  securityCode: s.nonEmptyString("The Gangtise security code."),
  securityName: s.nullableString("The security name, or null when unavailable."),
  indicatorCode: s.nonEmptyString("The Gangtise indicator code."),
  indicatorName: s.nullableString("The indicator name, or null when unavailable."),
  value: nullableScalarSchema("The indicator value, or null when unavailable."),
});

const researchSecuritySchema = s.object("A security associated with a research item.", {
  code: s.nullableString("The Gangtise security code, or null when unavailable."),
  name: s.nullableString("The security name, or null when unavailable."),
});

const researchItemSchema = s.object("One normalized Gangtise research-content search result.", {
  id: s.nonEmptyString("The Gangtise resource identifier."),
  type: s.stringEnum("The research-content type.", ["report", "meeting_summary", "announcement"]),
  title: s.nonEmptyString("The resource title."),
  publishedAt: s.nullableString("The publication time, or null when unavailable."),
  source: s.nullableString("The publisher or source, or null when unavailable."),
  author: s.nullableString("The author, or null when unavailable."),
  summary: s.nullableString("The resource summary, or null when unavailable."),
  highlights: s.nullableString("The extracted highlights, or null when unavailable."),
  url: s.nullableString("The official resource URL, or null when unavailable."),
  pageCount: s.nullableInteger("The page count, or null when unavailable."),
  securities: s.array("The securities associated with this result.", researchSecuritySchema),
});

const pagedResearchOutputSchema = s.object("A page of normalized Gangtise research results.", {
  results: s.array("The matching research items.", researchItemSchema),
  nextOffset: s.nullableInteger("The next offset when another page may exist, otherwise null."),
  total: s.nullableInteger("The upstream total result count, or null when unavailable."),
});

const researchSearchInputSchema = (description: string, supportsRanking: boolean) =>
  s.object(
    description,
    {
      keyword: s.optional(s.nonWhitespaceString("The keyword to search for.")),
      securities: s.optional(exactSecuritiesSchema()),
      startDate: s.optional(s.date("The first publication date to include.")),
      endDate: s.optional(s.date("The last publication date to include.")),
      searchType: s.optional(
        s.withDefault(s.stringEnum("Whether to search titles or full text.", ["title", "full_text"]), "title"),
      ),
      ...(supportsRanking
        ? {
            rankType: s.optional(
              s.withDefault(s.stringEnum("How to rank the returned results.", ["relevance", "latest"]), "relevance"),
            ),
          }
        : {}),
      offset: s.optional(s.withDefault(s.integer("The zero-based result offset.", { minimum: 0 }), 0)),
      limit: s.optional(
        s.withDefault(s.integer("The maximum number of results to return.", { minimum: 1, maximum: 50 }), 20),
      ),
    },
    {
      optional: [
        "keyword",
        "securities",
        "startDate",
        "endDate",
        "searchType",
        ...(supportsRanking ? ["rankType"] : []),
        "offset",
        "limit",
      ],
    },
  );

const financialInputSchema = {
  description: "Input parameters for retrieving company financial statements.",
  allOf: [
    s.object(
      "Common Gangtise financial statement parameters.",
      {
        market: companyMarketSchema,
        statement: s.stringEnum("The financial statement to retrieve.", ["income", "balance_sheet", "cash_flow"]),
        granularity: s.optional(
          s.withDefault(
            s.stringEnum("Whether values are accumulated or single-quarter values.", ["accumulated", "quarterly"]),
            "accumulated",
          ),
        ),
        securities: exactSecuritiesSchema(),
        startDate: s.optional(s.date("The first report date to include.")),
        endDate: s.optional(s.date("The last report date to include.")),
        fiscalYears: s.optional(
          s.stringArray("The fiscal years to include.", {
            minItems: 1,
            itemDescription: "A four-digit fiscal year such as 2025.",
          }),
        ),
        periods: s.optional(
          s.array(
            "The report periods to include.",
            s.stringEnum("A Gangtise financial report period.", ["Q0", "Q1", "Q2", "Q3", "Q4"]),
            { minItems: 1 },
          ),
        ),
        reportTypes: s.optional(
          s.array(
            "The report consolidation types to include.",
            s.stringEnum("A Gangtise financial report type.", [
              "consolidated",
              "consolidatedRestated",
              "standalone",
              "standaloneRestated",
            ]),
            { minItems: 1 },
          ),
        ),
        fields: s.optional(
          s.stringArray("The official financial statement fields to return.", {
            minItems: 1,
            itemDescription: "An official Gangtise financial field name.",
          }),
        ),
      },
      {
        optional: ["granularity", "startDate", "endDate", "fiscalYears", "periods", "reportTypes", "fields"],
      },
    ),
    s.anyOf("A market, statement, and granularity combination supported by Gangtise.", [
      s.looseRequiredObject("An A-share income or cash-flow statement.", {
        market: s.literal("a_share", { description: "The A-share market." }),
        statement: s.stringEnum("A statement with quarterly support.", ["income", "cash_flow"]),
        granularity: s.stringEnum("A supported A-share statement granularity.", ["accumulated", "quarterly"]),
      }),
      s.looseRequiredObject("An accumulated A-share balance sheet.", {
        market: s.literal("a_share", { description: "The A-share market." }),
        statement: s.literal("balance_sheet", { description: "The balance-sheet statement." }),
        granularity: s.literal("accumulated", { description: "The accumulated report granularity." }),
      }),
      s.looseRequiredObject("An accumulated Hong Kong or US financial statement.", {
        market: s.stringEnum("A market that supports accumulated statements only.", ["hong_kong", "united_states"]),
        statement: s.stringEnum("A supported company financial statement.", ["income", "balance_sheet", "cash_flow"]),
        granularity: s.literal("accumulated", { description: "The accumulated report granularity." }),
      }),
    ]),
  ],
};

const companyIndicatorInputSchema = {
  description: "Input parameters for retrieving Gangtise company indicator values.",
  allOf: [
    s.object(
      "Common Gangtise company indicator parameters.",
      {
        mode: s.stringEnum("The official indicator query shape to use.", ["time_series", "cross_section"]),
        indicatorCodes: s.stringArray("The exact Gangtise indicator codes to query.", {
          minItems: 1,
          itemDescription: "An indicator code returned by search_company_indicators.",
        }),
        securities: exactSecuritiesSchema("The exact A-share security codes to query."),
        startDate: s.optional(
          s.date("The first value date; required for time_series mode and ignored for cross_section."),
        ),
        endDate: s.date("The last value date for time_series mode or the observation date for cross_section mode."),
        calendarType: s.optional(
          s.withDefault(s.stringEnum("The calendar used by time-series queries.", ["TD", "CD"]), "TD"),
        ),
        scale: s.optional(s.withDefault(s.nonWhitespaceString("The official Gangtise indicator scale value."), "0")),
        indicatorParameters: s.optional(
          s.array(
            "Per-indicator parameter values discovered through search_company_indicators.",
            s.object("Parameters for one indicator.", {
              indicatorCode: s.nonWhitespaceString("The indicator code these parameters apply to."),
              parameters: s.record(
                "The parameter keys and values accepted by the official indicator.",
                s.unknown("An official Gangtise indicator parameter value."),
              ),
            }),
            { minItems: 1 },
          ),
        ),
      },
      { optional: ["startDate", "calendarType", "scale", "indicatorParameters"] },
    ),
    s.anyOf("A supported Gangtise indicator query mode.", [
      s.looseRequiredObject("A time-series indicator query.", {
        mode: s.literal("time_series", { description: "The time-series query mode." }),
        startDate: s.date("The first value date for the time series."),
      }),
      s.looseRequiredObject("A cross-section indicator query.", {
        mode: s.literal("cross_section", { description: "The cross-section query mode." }),
      }),
    ]),
  ],
};

export const gangtiseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_securities",
    operationType: "read",
    description: "Search Gangtise securities by name, code, abbreviation, or pinyin before requesting market data.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Gangtise securities.",
      {
        keyword: s.nonWhitespaceString("The security name, code, abbreviation, or pinyin keyword to search for."),
        categories: s.optional(
          s.array(
            "Optional security categories to include in the search.",
            s.stringEnum("A Gangtise security category.", ["stock", "dr", "index", "fund"]),
            { minItems: 1, maxItems: 4 },
          ),
        ),
        top: s.optional(
          s.withDefault(s.integer("The maximum number of matches to request.", { minimum: 1, maximum: 10 }), 10),
        ),
      },
      { optional: ["categories", "top"] },
    ),
    outputSchema: s.object("The normalized Gangtise security search result.", {
      results: s.array("The matching securities.", searchResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_realtime_quotes",
    operationType: "read",
    description: "Get current Gangtise market snapshots for one or more exact security codes.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for retrieving real-time Gangtise quotes.", {
      securities: exactSecuritiesSchema(),
    }),
    outputSchema: s.object("The normalized Gangtise real-time quote result.", {
      quotes: s.array("The returned real-time quotes.", realtimeQuoteSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_daily_kline",
    operationType: "read",
    description: "Get Gangtise unadjusted daily K-line market data for exact security codes in one supported market.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Gangtise daily K-line data.",
      {
        market: marketSchema,
        securities: exactSecuritiesSchema("The exact Gangtise security codes valid for the selected market."),
        startDate: s.date("The first trading date to include."),
        endDate: s.date("The last trading date to include."),
        limit: s.optional(
          s.withDefault(
            s.integer("The maximum number of rows to return.", {
              minimum: 1,
              maximum: 10_000,
            }),
            5_000,
          ),
        ),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The normalized Gangtise daily K-line result.", {
      market: marketSchema,
      rows: s.array("The returned daily K-line rows.", dailyKlineRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_minute_kline",
    operationType: "read",
    description: "Get historical minute K-line data for one or more exact A-share security codes.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Gangtise minute K-line data.",
      {
        securities: exactSecuritiesSchema("The exact A-share security codes to query."),
        startTime: s.nonWhitespaceString(
          "The first timestamp to include, using YYYY-MM-DD HH:mm:ss or an accepted official timestamp format.",
        ),
        endTime: s.nonWhitespaceString(
          "The last timestamp to include, using YYYY-MM-DD HH:mm:ss or an accepted official timestamp format.",
        ),
        limit: s.optional(
          s.withDefault(
            s.integer("The maximum number of rows requested per security.", {
              minimum: 1,
              maximum: 10_000,
            }),
            5_000,
          ),
        ),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The normalized Gangtise minute K-line result.", {
      rows: s.array("The returned minute K-line rows.", minuteKlineRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_financial_statements",
    operationType: "read",
    description: "Get Gangtise income statements, balance sheets, or cash-flow statements for exact security codes.",
    requiredScopes: [],
    inputSchema: financialInputSchema,
    outputSchema: s.object("The normalized Gangtise financial statement result.", {
      market: companyMarketSchema,
      statement: s.stringEnum("The returned statement type.", ["income", "balance_sheet", "cash_flow"]),
      granularity: s.stringEnum("The returned report granularity.", ["accumulated", "quarterly"]),
      rows: s.array("The returned statement rows.", dynamicRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_valuation_metrics",
    operationType: "read",
    description: "Get Gangtise valuation metrics and their percentile ranks over a requested date range.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Gangtise valuation metrics.",
      {
        securities: exactSecuritiesSchema(),
        startDate: s.date("The first valuation date to include."),
        endDate: s.date("The last valuation date to include."),
        indicators: s.optional(
          s.array(
            "The valuation indicators to retrieve.",
            s.stringEnum("A supported Gangtise valuation indicator.", [
              "peTtm",
              "psTtm",
              "pbMrq",
              "peg",
              "pcfTtm",
              "em",
            ]),
            { minItems: 1, maxItems: 6 },
          ),
        ),
        limit: s.optional(
          s.withDefault(
            s.integer("The maximum rows requested for each security and indicator.", {
              minimum: 1,
              maximum: 10_000,
            }),
            2_000,
          ),
        ),
      },
      { optional: ["indicators", "limit"] },
    ),
    outputSchema: s.object("The normalized Gangtise valuation result.", {
      rows: s.array("The valuation observations.", valuationRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_earnings_forecast",
    operationType: "read",
    description: "Get Gangtise broker-consensus earnings forecasts for exact security codes.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Gangtise earnings forecasts.",
      {
        securities: exactSecuritiesSchema(),
        startDate: s.date("The first forecast update date to include."),
        endDate: s.date("The last forecast update date to include."),
        consensusFields: s.optional(
          s.array(
            "The consensus forecast fields to return.",
            s.stringEnum("A supported Gangtise consensus field.", [
              "netIncome",
              "netIncomeYoy",
              "eps",
              "pe",
              "bps",
              "pb",
              "peg",
              "roe",
              "ps",
            ]),
            { minItems: 1, maxItems: 9 },
          ),
        ),
      },
      { optional: ["consensusFields"] },
    ),
    outputSchema: s.object("The normalized Gangtise earnings forecast result.", {
      rows: s.array("The consensus forecast rows.", earningsForecastRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_main_business_breakdown",
    operationType: "read",
    description: "Get a company's main-business revenue and profitability breakdown by product, industry, or region.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Gangtise main-business data.",
      {
        securities: exactSecuritiesSchema(),
        startDate: s.date("The first report date to include."),
        endDate: s.date("The last report date to include."),
        breakdown: s.stringEnum("The business breakdown dimension.", ["product", "industry", "region"]),
        period: s.optional(s.stringEnum("The optional report period filter.", ["interim", "annual"])),
      },
      { optional: ["period"] },
    ),
    outputSchema: s.object("The normalized Gangtise main-business result.", {
      rows: s.array("The main-business breakdown rows.", mainBusinessRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_top_shareholders",
    operationType: "read",
    description: "Get the top ten shareholders or top ten floating shareholders for exact security codes.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Gangtise top-shareholder data.",
      {
        securities: exactSecuritiesSchema(),
        holderType: s.stringEnum("The shareholder table to retrieve.", ["top10", "top10Float"]),
        startDate: s.optional(s.date("The first report date to include.")),
        endDate: s.optional(s.date("The last report date to include.")),
        fiscalYears: s.optional(
          s.stringArray("The fiscal years to include.", {
            minItems: 1,
            itemDescription: "A four-digit fiscal year such as 2025.",
          }),
        ),
        periods: s.optional(
          s.array(
            "The report periods to include.",
            s.stringEnum("A Gangtise shareholder report period.", ["q1", "interim", "q3", "annual", "latest"]),
            { minItems: 1 },
          ),
        ),
      },
      { optional: ["startDate", "endDate", "fiscalYears", "periods"] },
    ),
    outputSchema: s.object("The normalized Gangtise top-shareholder result.", {
      rows: s.array("The top-shareholder rows.", shareholderRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_fund_flow",
    operationType: "read",
    description: "Get historical A-share daily small, medium, large, extra-large, total, and main-fund net inflows.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for retrieving Gangtise daily fund flow.",
      {
        securities: exactSecuritiesSchema(
          "The exact A-share security codes, or the official aShares token for the full market.",
        ),
        startDate: s.date("The first trading date to include."),
        endDate: s.date("The last trading date to include."),
        limit: s.optional(
          s.withDefault(
            s.integer("The maximum number of rows to return.", {
              minimum: 1,
              maximum: 10_000,
            }),
            5_000,
          ),
        ),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The normalized Gangtise daily fund-flow result.", {
      rows: s.array("The returned fund-flow rows.", fundFlowRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_company_indicators",
    operationType: "read",
    description: "Search Gangtise A-share company indicators before requesting time-series or cross-section values.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Gangtise company indicators.",
      {
        keyword: s.nonWhitespaceString("A specific indicator keyword such as close price or ROE."),
        limit: s.optional(
          s.withDefault(
            s.integer("The maximum number of indicator matches to return.", {
              minimum: 1,
              maximum: 100,
            }),
            20,
          ),
        ),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object("The Gangtise company indicator search result.", {
      indicators: s.array("The matching company indicators.", indicatorSearchResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_indicators",
    operationType: "read",
    description: "Get Gangtise A-share company indicator values as a time series or a single-date cross section.",
    requiredScopes: [],
    inputSchema: companyIndicatorInputSchema,
    outputSchema: s.object("The normalized Gangtise company indicator result.", {
      mode: s.stringEnum("The query mode used for this result.", ["time_series", "cross_section"]),
      rows: s.array("The normalized indicator values.", indicatorRowSchema),
      cellCount: s.integer("The number of upstream value cells returned.", { minimum: 0 }),
      estimatedPoints: s.number("The estimated Gangtise points charged for the returned cells.", {
        minimum: 0,
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "search_reports",
    operationType: "read",
    description: "Search Gangtise domestic broker research reports without downloading report files.",
    requiredScopes: [],
    inputSchema: researchSearchInputSchema("Input parameters for searching Gangtise reports.", true),
    outputSchema: pagedResearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_meeting_summaries",
    operationType: "read",
    description: "Search Gangtise meeting and research summaries without downloading source files.",
    requiredScopes: [],
    inputSchema: researchSearchInputSchema("Input parameters for searching Gangtise meeting summaries.", false),
    outputSchema: pagedResearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_announcements",
    operationType: "read",
    description: "Search Gangtise company announcement indexes without downloading source files.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Gangtise announcements.",
      {
        market: s.stringEnum("The announcement market to query.", ["a_share", "hong_kong", "united_states"]),
        keyword: s.optional(s.nonWhitespaceString("The announcement keyword to search for.")),
        securities: s.optional(exactSecuritiesSchema()),
        startDate: s.optional(s.date("The first publication date to include.")),
        endDate: s.optional(s.date("The last publication date to include.")),
        searchType: s.optional(
          s.withDefault(s.stringEnum("Whether to search titles or full text.", ["title", "full_text"]), "title"),
        ),
        rankType: s.optional(
          s.withDefault(s.stringEnum("How to rank the returned results.", ["relevance", "latest"]), "relevance"),
        ),
        offset: s.optional(s.withDefault(s.integer("The zero-based result offset.", { minimum: 0 }), 0)),
        limit: s.optional(
          s.withDefault(s.integer("The maximum number of results to return.", { minimum: 1, maximum: 50 }), 20),
        ),
      },
      {
        optional: ["keyword", "securities", "startDate", "endDate", "searchType", "rankType", "offset", "limit"],
      },
    ),
    outputSchema: pagedResearchOutputSchema,
  }),
];
