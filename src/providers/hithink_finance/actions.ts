import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hithink_finance";

const assetTypes = ["a-share", "a-share-index", "forex", "fund-otc", "fund-etf", "fund-lof", "fund-reits"];

function nonEmptyString(description: string) {
  return s.nonEmptyString(description);
}

function thscode(description: string) {
  return nonEmptyString(description);
}

function optionalInteger(description: string, minimum: number, maximum?: number) {
  return s.optional(s.integer(description, { minimum, ...(maximum === undefined ? {} : { maximum }) }));
}

const tickerItemSchema = s.looseObject("A financial instrument matched by Tonghuashun.", {
  thscode: s.string("Complete Tonghuashun security code including the market suffix."),
  ticker: s.string("Security code without the market suffix."),
  name: s.string("Display name of the financial instrument."),
  exchange: s.nullableString("Exchange suffix when the instrument has one."),
  asset_type: s.string("Asset category returned by Tonghuashun."),
  currency: s.string("Currency code for the instrument."),
});

const tickerListOutputSchema = s.object("Tonghuashun ticker search results.", {
  timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
  item: s.array("Financial instruments matching the request.", tickerItemSchema),
});

const priceSnapshotItemSchema = s.looseObject("Latest market snapshot for one instrument.", {
  thscode: s.string("Complete Tonghuashun security code."),
  ticker: s.string("Security code without the market suffix."),
  last_price: s.nullableNumber("Latest traded price in the original currency."),
  price_change: s.nullableNumber("Price change from the previous close."),
  price_change_ratio_pct: s.nullableNumber("Percentage change from the previous close."),
  open_price: s.nullableNumber("Opening price for the trading day."),
  high_price: s.nullableNumber("Highest price for the trading day."),
  low_price: s.nullableNumber("Lowest price for the trading day."),
  prev_price: s.nullableNumber("Previous closing price."),
  volume: s.nullableNumber("Trading volume in shares."),
  turnover: s.nullableNumber("Trading turnover in the original currency."),
});

const snapshotOutputSchema = s.object("Latest market snapshots returned by Tonghuashun.", {
  timestamp: s.nullableInteger("Latest available upstream data time in milliseconds."),
  total: s.integer("Number of instruments represented by the upstream result."),
  item: s.array("Latest market snapshot rows.", priceSnapshotItemSchema),
});

const priceBarItemSchema = s.looseObject("One daily market price bar.", {
  date_ms: s.integer("Trading date as a Unix timestamp in milliseconds."),
  open_price: s.nullableNumber("Opening price."),
  high_price: s.nullableNumber("Highest price."),
  low_price: s.nullableNumber("Lowest price."),
  close_price: s.nullableNumber("Closing price."),
  volume: s.nullableNumber("Trading volume in shares."),
  turnover: s.nullableNumber("Trading turnover in the original currency."),
});

const historyOutputSchema = s.looseRequiredObject("Historical daily price data returned by Tonghuashun.", {
  timestamp: s.integer("Latest available price-bar time in milliseconds."),
  item: s.array("Historical daily price bars.", priceBarItemSchema),
});

const adjustmentFactorItemSchema = s.looseObject("One corporate-action adjustment event.", {
  ticker: s.string("Security code without the market suffix."),
  ex_date_ms: s.integer("Ex-dividend or ex-rights date in milliseconds."),
  dividend_per_share: s.number("Pre-tax cash dividend per share."),
  per_share_bonus: s.number("Bonus-share ratio per share."),
});

const adjustmentFactorsOutputSchema = s.object("Corporate-action adjustment events returned by Tonghuashun.", {
  thscode: s.string("Complete Tonghuashun security code."),
  ticker: s.string("Security code without the market suffix."),
  item: s.array("Corporate-action adjustment events ordered from newest to oldest.", adjustmentFactorItemSchema),
});

const statementItemSchema = s.looseObject("Financial statement row for one reporting period.", {
  thscode: s.string("Complete Tonghuashun security code."),
  ticker: s.string("Security code without the market suffix."),
  period: s.string("Reporting cadence for the statement."),
  period_end_ms: s.integer("Reporting period end as a Unix timestamp in milliseconds."),
  report_date_ms: s.integer("Report date as a Unix timestamp in milliseconds."),
  fiscal_year: s.integer("Fiscal year represented by the statement."),
  fiscal_period: s.string("Fiscal period label returned by Tonghuashun."),
  currency: s.string("Currency code for monetary fields."),
});

const statementOutputSchema = s.object("Financial statement series returned by Tonghuashun.", {
  timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
  item: s.array("Financial statement rows ordered from newest to oldest.", statementItemSchema),
});

const indicatorSchema = s.looseObject("One financial indicator value.", {
  index_id: s.string("Tonghuashun financial indicator identifier."),
  value: s.nullableString("Indicator value as returned by the upstream service."),
});

const abilitySchema = s.looseObject("One financial-analysis ability group.", {
  ability: s.string("Financial-analysis category identifier."),
  indicators: s.array("Financial indicators in this category.", indicatorSchema),
});

const financialIndicatorsOutputSchema = s.object("Financial indicators grouped by analysis category.", {
  thscode: s.string("Complete Tonghuashun security code."),
  report: s.string("Reporting period identifier in YYYY-N format."),
  abilities: s.array("Growth, profitability, solvency, operation, and cash-flow groups.", abilitySchema),
});

const valuationItemSchema = s.looseObject("Latest valuation metrics for one A-share.", {
  thscode: s.string("Complete Tonghuashun security code."),
  ticker: s.string("Security code without the market suffix."),
  name: s.nullableString("Security name when available."),
  pe_ttm: s.nullableNumber("Trailing twelve-month price-to-earnings ratio."),
  pe_mrq: s.nullableNumber("Most recent quarter price-to-earnings ratio."),
  pb_mrq: s.nullableNumber("Most recent quarter price-to-book ratio."),
  ps_ttm: s.nullableNumber("Trailing twelve-month price-to-sales ratio."),
  pcf_ttm: s.nullableNumber("Trailing twelve-month price-to-cash-flow ratio."),
});

const valuationOutputSchema = s.object("Latest valuation snapshot returned by Tonghuashun.", {
  timestamp: s.nullableInteger("Latest available upstream valuation time in milliseconds."),
  total: s.integer("Number of valuation rows returned."),
  item: s.array("Valuation rows in requested security order.", valuationItemSchema),
});

const tradingDaySchema = s.looseObject("One A-share trading day.", {
  date_ms: s.integer("Trading date as a Unix timestamp in milliseconds."),
  date: s.string("Trading date in YYYYMMDD format."),
});

const tradingDaysOutputSchema = s.object("A-share trading days for the latest one-year window.", {
  timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
  item: s.array("Trading days ordered from oldest to newest.", tradingDaySchema),
});

const indexItemSchema = s.looseObject("One Tonghuashun index or sector.", {
  thscode: s.string("Complete index or sector code."),
  name: s.string("Index or sector display name."),
});

const indexListOutputSchema = s.object("Tonghuashun index or sector catalog.", {
  timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
  item: s.array("Indexes or sectors in the selected category.", indexItemSchema),
});

const constituentItemSchema = s.looseObject("One current index constituent.", {
  thscode: s.string("Complete constituent security code."),
  ticker: s.string("Constituent code without the market suffix."),
  name: s.string("Constituent security name."),
});

const constituentsOutputSchema = s.object("Current constituents of one index or sector.", {
  timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
  item: s.array("Current index constituents.", constituentItemSchema),
});

const securityCodesInputSchema = s.object("A limited set of complete Tonghuashun security codes.", {
  thscodes: s.array(
    "Complete Tonghuashun security codes to query.",
    thscode("One complete Tonghuashun security code including the market suffix."),
    { minItems: 1 },
  ),
});

const valuationSecurityCodesInputSchema = s.object("Up to 100 complete A-share codes for a valuation snapshot.", {
  thscodes: s.array(
    "Complete A-share codes to query.",
    thscode("One complete A-share code including the market suffix."),
    { minItems: 1, maxItems: 100 },
  ),
});

const stockSnapshotInputSchema = {
  ...s.object("Input for selected-security or paginated all-market A-share snapshots.", {
    thscodes: s.optional(
      s.array(
        "Complete A-share codes for selected-security mode.",
        thscode("One complete A-share code including its market suffix."),
        { minItems: 1 },
      ),
    ),
    limit: optionalInteger("Maximum stocks in an all-market page.", 1, 10_000),
    offset: optionalInteger("Number of all-market stocks to skip before this page.", 0),
  }),
  allOf: [{ not: { required: ["thscodes", "limit"] } }, { not: { required: ["thscodes", "offset"] } }],
};

const stockHistoryInputSchema = s.object("Input for retrieving one A-share daily price history.", {
  thscode: thscode("Complete A-share code including the .SH, .SZ, or .BJ suffix."),
  startTimeMs: s.integer("Inclusive history start as a Unix timestamp in milliseconds."),
  endTimeMs: s.integer("Inclusive history end as a Unix timestamp in milliseconds."),
  adjust: s.optional(s.stringEnum("Price adjustment method.", ["none", "forward", "backward"])),
  offset: optionalInteger("Pagination offset for the historical series.", 0),
});

const statementInputSchema = {
  ...s.object("Input for retrieving recent or time-bounded financial statements.", {
    thscode: thscode("Complete A-share code including the market suffix."),
    period: s.optional(s.stringEnum("Financial statement reporting cadence.", ["annual", "quarterly"])),
    limit: optionalInteger("Number of recent reporting periods to return.", 1, 20),
    startTimeMs: s.optional(s.integer("Inclusive statement window start in milliseconds.")),
    endTimeMs: s.optional(s.integer("Inclusive statement window end in milliseconds.")),
  }),
  oneOf: [
    {
      not: {
        anyOf: [{ required: ["startTimeMs"] }, { required: ["endTimeMs"] }],
      },
    },
    {
      required: ["startTimeMs", "endTimeMs"],
      not: { required: ["limit"] },
    },
  ],
};

const indexHistoryInputSchema = s.object("Input for retrieving one index or sector history.", {
  thscode: thscode("Complete index or sector code including its market suffix."),
  startTimeMs: s.integer("Inclusive history start as a Unix timestamp in milliseconds."),
  endTimeMs: s.integer("Inclusive history end as a Unix timestamp in milliseconds."),
});

const auctionItemSchema = s.looseObject("One auction result returned by Tonghuashun.");

const hithinkFinanceCoreActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_tickers",
    description: "Search Tonghuashun instruments by code or Chinese or English name.",
    requiredScopes: [],
    inputSchema: s.object("Input for searching Tonghuashun financial instruments.", {
      query: nonEmptyString("Code, ticker, Chinese name, or English name to search for."),
      exchange: s.optional(s.stringEnum("Optional exchange filter.", ["SH", "SZ", "BJ"])),
      assetTypes: s.optional(
        s.array(
          "Optional asset categories used to narrow the search.",
          s.stringEnum("One supported Tonghuashun asset category.", assetTypes),
          { minItems: 1 },
        ),
      ),
      limit: optionalInteger("Maximum number of matches to return.", 1, 50),
    }),
    outputSchema: tickerListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tickers",
    description: "List a bounded page of Tonghuashun instruments by exchange and asset category.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing a bounded page of financial instruments.", {
      exchanges: s.optional(
        s.array(
          "Exchange suffixes used to filter the code table.",
          s.stringEnum("One supported exchange suffix.", ["SH", "SZ", "BJ"]),
          { minItems: 1 },
        ),
      ),
      assetTypes: s.optional(
        s.array(
          "Asset categories used to filter the code table.",
          s.stringEnum("One supported Tonghuashun asset category.", assetTypes),
          { minItems: 1 },
        ),
      ),
      limit: optionalInteger("Maximum instruments to return in this page.", 1, 10_000),
      offset: optionalInteger("Number of instruments to skip before this page.", 0),
    }),
    outputSchema: tickerListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_stock_snapshot",
    description: "Get selected-security or paginated all-market A-share snapshots.",
    requiredScopes: [],
    inputSchema: stockSnapshotInputSchema,
    outputSchema: snapshotOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_stock_history",
    description: "Get daily historical prices for one A-share security over a specified window.",
    requiredScopes: [],
    inputSchema: stockHistoryInputSchema,
    outputSchema: historyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_adjustment_factors",
    description: "Get dividend and bonus-share adjustment events for one A-share security.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving A-share corporate-action events.", {
      thscode: thscode("Complete A-share code including the market suffix."),
      from: s.optional(s.date("Optional first ex-dividend date in YYYY-MM-DD format.")),
      to: s.optional(s.date("Optional last ex-dividend date in YYYY-MM-DD format.")),
    }),
    outputSchema: adjustmentFactorsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_income_statements",
    description: "Get recent consolidated income statements for one A-share company.",
    requiredScopes: [],
    inputSchema: statementInputSchema,
    outputSchema: statementOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_balance_sheets",
    description: "Get recent consolidated balance sheets for one A-share company.",
    requiredScopes: [],
    inputSchema: statementInputSchema,
    outputSchema: statementOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_cash_flow_statements",
    description: "Get recent consolidated cash-flow statements for one A-share company.",
    requiredScopes: [],
    inputSchema: statementInputSchema,
    outputSchema: statementOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_financial_indicators",
    description: "Get growth, profitability, solvency, operation, and cash-flow indicators for one report.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving A-share financial indicators.", {
      thscode: thscode("Complete A-share code including the market suffix."),
      report: nonEmptyString("Reporting period in YYYY-N format, where N is 1 through 4."),
    }),
    outputSchema: financialIndicatorsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_valuation_snapshot",
    description: "Get the latest fixed set of valuation ratios for up to 100 A-share securities.",
    requiredScopes: [],
    inputSchema: valuationSecurityCodesInputSchema,
    outputSchema: valuationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_trading_days",
    description: "List A-share trading days in the service's latest one-year window.",
    requiredScopes: [],
    inputSchema: s.object("This action does not require input parameters.", {}),
    outputSchema: tradingDaysOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_ths_indexes",
    description: "List Tonghuashun concepts, regions, special indexes, or industry sectors.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing Tonghuashun index and sector categories.", {
      tag: s.optional(s.stringEnum("Index or sector category to list.", ["cn_concept", "region", "tszs", "industry"])),
    }),
    outputSchema: indexListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_index_constituents",
    description: "Get the current constituents of one Tonghuashun sector or standard index.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving current index constituents.", {
      thscode: thscode("Complete index or sector code including the market suffix."),
    }),
    outputSchema: constituentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_index_snapshot",
    description: "Get the latest market snapshot for a limited set of indexes or sectors.",
    requiredScopes: [],
    inputSchema: securityCodesInputSchema,
    outputSchema: snapshotOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_index_history",
    description: "Get daily historical prices for one index or sector over a specified window.",
    requiredScopes: [],
    inputSchema: indexHistoryInputSchema,
    outputSchema: historyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_auction_snapshot",
    description: "Get live or final opening-auction snapshots for selected A-share securities.",
    requiredScopes: [],
    inputSchema: s.object("Input for querying A-share opening-auction snapshots.", {
      thscodes: s.array(
        "Complete A-share codes to query.",
        s.nonEmptyString("One complete A-share code including its market suffix."),
        { minItems: 1, maxItems: 100 },
      ),
      stage: s.optional(s.stringEnum("Auction stage to query.", ["live", "final"])),
    }),
    outputSchema: s.looseRequiredObject("Opening-auction snapshots returned by Tonghuashun.", {
      timestamp: s.integer("Response assembly time as a Unix timestamp in milliseconds."),
      auction_phase: s.string("Auction phase reported by Tonghuashun."),
      data_status: s.string("Readiness or suspension status of the auction data."),
      total: s.integer("Number of auction rows returned."),
      item: s.array("Opening-auction rows for the requested securities.", auctionItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_auction_short_term_benchmark",
    description: "Get the Tonghuashun short-term opening-auction benchmark for one date.",
    requiredScopes: [],
    inputSchema: s.object("Input for querying the opening-auction short-term benchmark.", {
      date: s.optional(s.date("Trading date in YYYY-MM-DD format; omit for today in Shanghai.")),
    }),
    outputSchema: s.looseRequiredObject("Opening-auction short-term benchmark returned by Tonghuashun.", {
      timestamp: s.integer("Response assembly time as a Unix timestamp in milliseconds."),
      date: s.string("Trading date represented by the benchmark."),
      date_ms: s.integer("Trading date at Shanghai midnight in milliseconds."),
      item: s.array("Securities included in the auction benchmark.", auctionItemSchema),
    }),
  }),
];

const fundTypeSchema = s.stringEnum("Fund market type.", ["otc", "exchange", "reits"]);
const looseFundItem = s.looseObject("One fund data row returned by Tonghuashun.");
const timestampedFundItemsOutput = s.looseRequiredObject("Fund data returned by Tonghuashun.", {
  timestamp: s.optional(s.integer("Data-ready time as a Unix timestamp in milliseconds.")),
  item: s.array("Fund data rows returned for this query.", looseFundItem),
});
const fundIdentityInput = s.object("Input identifying one public fund.", {
  fundType: fundTypeSchema,
  thscode: s.nonEmptyString("Complete fund code including its market suffix."),
});
const managerInput = s.object("Input identifying one fund manager.", {
  managerId: s.nonEmptyString("Fund manager ID returned by the fund profile action."),
});

function fundAction(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown> = timestampedFundItemsOutput,
) {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

const hithinkFinanceFundActions: ActionDefinition[] = [
  fundAction(
    "get_fund_profile",
    "Get the basic profile, company, managers, rules, and fees for one public fund.",
    fundIdentityInput,
  ),
  fundAction(
    "get_fund_holdings",
    "Get the latest periodically disclosed major holdings for one public fund.",
    fundIdentityInput,
  ),
  fundAction(
    "get_fund_nav",
    "Get the latest or fixed-range unit and adjusted NAV series for one public fund.",
    s.object("Input for querying a public fund NAV series.", {
      fundType: fundTypeSchema,
      thscode: s.nonEmptyString("Complete fund code including its market suffix."),
      range: s.optional(
        s.stringEnum("Fixed NAV history range.", [
          "week",
          "month",
          "tmonth",
          "hyear",
          "year",
          "twoyear",
          "tyear",
          "fyear",
        ]),
      ),
      navTypes: s.optional(
        s.array("NAV series to return.", s.stringEnum("One NAV series type.", ["unit", "adj"]), {
          minItems: 1,
          maxItems: 2,
        }),
      ),
    }),
  ),
  fundAction(
    "get_fund_returns",
    "Get fixed-range returns, peer averages, and peer ranks for one public fund.",
    fundIdentityInput,
  ),
  fundAction(
    "get_fund_holder_structure",
    "Get the latest institutional, personal, and staff holder structure for one public fund.",
    s.object("Input for querying a fund holder structure.", {
      fundType: fundTypeSchema,
      thscode: s.nonEmptyString("Complete fund code including its market suffix."),
      mergeScope: s.optional(s.stringEnum("Share-class disclosure scope.", ["all", "merged", "separate"])),
    }),
  ),
  fundAction(
    "get_fund_market_snapshot",
    "Get the latest exchange-market snapshot for one ETF or LOF.",
    s.object("Input for querying one exchange-traded fund snapshot.", {
      thscode: s.nonEmptyString("Complete ETF or LOF code including its market suffix."),
    }),
  ),
  fundAction(
    "get_fund_market_history",
    "Get up to five years of daily market history for one ETF.",
    s.object("Input for querying one ETF daily market history.", {
      thscode: s.nonEmptyString("Complete ETF code including its market suffix."),
      startTimeMs: s.integer("Inclusive history start in milliseconds."),
      endTimeMs: s.integer("Inclusive history end in milliseconds."),
    }),
    s.looseRequiredObject("Daily ETF market history returned by Tonghuashun.", {
      timestamp: s.integer("Latest upstream price-bar time in milliseconds."),
      thscode: s.string("Complete ETF code represented by the series."),
      interval: s.string("Price-bar interval, currently 1d."),
      item: s.array("Daily ETF price bars.", looseFundItem),
    }),
  ),
  fundAction(
    "get_fund_company",
    "Get profile and scale information for one fund company.",
    s.object("Input identifying one fund company.", {
      companyId: s.nonEmptyString("Fund company ID returned by the fund profile action."),
    }),
  ),
  fundAction(
    "get_fund_industry_allocation",
    "Get the periodically disclosed industry allocation for one public fund.",
    fundIdentityInput,
  ),
  fundAction(
    "get_fund_performance_indicators",
    "Get historical daily performance indicators for one public fund over a window of up to five years.",
    s.object("Input for querying historical fund performance indicators.", {
      fundType: fundTypeSchema,
      thscode: s.nonEmptyString("Complete fund code including its market suffix."),
      startTimeMs: s.integer("Inclusive indicator-history start in milliseconds."),
      endTimeMs: s.integer("Inclusive indicator-history end in milliseconds."),
    }),
  ),
  fundAction("get_fund_drawdowns", "Get fixed-range drawdown data for one public fund.", fundIdentityInput),
  fundAction(
    "get_fund_top_holders",
    "Get up to ten top disclosed holders for one public fund.",
    s.object("Input for querying top fund holders.", {
      fundType: fundTypeSchema,
      thscode: s.nonEmptyString("Complete fund code including its market suffix."),
      limit: s.optional(s.integer("Maximum holders to return.", { minimum: 1, maximum: 10 })),
    }),
    s.looseRequiredObject("Top disclosed fund holders returned by Tonghuashun.", {
      timestamp: s.integer("Latest report time in milliseconds."),
      limit: s.integer("Holder limit applied by Tonghuashun."),
      item: s.array("Top disclosed fund holders.", looseFundItem),
    }),
  ),
  fundAction(
    "get_fund_dividends",
    "Get dividend history and dividend summary data for one public fund.",
    fundIdentityInput,
  ),
  fundAction(
    "get_fund_diagnostics",
    "Get Tonghuashun diagnostic dimensions and peer comparisons for one public fund.",
    fundIdentityInput,
  ),
  fundAction(
    "get_fund_financial_indicators",
    "Get the disclosed financial indicators for one public fund.",
    fundIdentityInput,
  ),
  fundAction("get_fund_income_statements", "Get disclosed income statements for one public fund.", fundIdentityInput),
  fundAction("get_fund_balance_sheets", "Get disclosed balance sheets for one public fund.", fundIdentityInput),
  fundAction(
    "get_fund_manager_investment_style",
    "Get investment ideas and industry preferences for one fund manager.",
    managerInput,
  ),
  fundAction(
    "get_fund_manager_performance",
    "Get one fund manager's return, peer return, and benchmark return series for a fixed range.",
    s.object("Input for querying fund manager performance.", {
      managerId: s.nonEmptyString("Fund manager ID returned by the fund profile action."),
      range: s.stringEnum("Fixed manager performance range.", ["month", "tmonth", "year", "nowyear", "now"]),
    }),
  ),
  fundAction(
    "get_fund_manager_experience",
    "Get awards, major assets, and investment history for one fund manager.",
    managerInput,
  ),
  fundAction(
    "get_fund_manager",
    "Get profile, resume, returns, and radar comparisons for one fund manager.",
    managerInput,
  ),
  fundAction(
    "list_fund_news",
    "List public fund news metadata using the upstream opaque cursor.",
    s.object("Input for listing public fund news metadata.", {
      fundType: fundTypeSchema,
      thscode: s.nonEmptyString("Complete fund code including its market suffix."),
      limit: s.optional(s.integer("Maximum articles to return.", { minimum: 1, maximum: 100 })),
      offset: s.optional(s.nonEmptyString("Opaque cursor returned by the previous page.")),
    }),
    s.looseRequiredObject("Fund news metadata returned by Tonghuashun.", {
      timestamp: s.integer("Data-ready time in milliseconds."),
      limit: s.integer("Article limit applied by Tonghuashun."),
      offset: s.nullableString("Opaque cursor for the next page when present."),
      has_more: s.boolean("Whether another page is available."),
      item: s.array("Fund news metadata rows.", looseFundItem),
    }),
  ),
  fundAction(
    "list_fund_offerings",
    "List active or upcoming public-fund offerings.",
    s.object("Input for listing public-fund offerings.", {
      subscriptionStatus: s.stringEnum("Offering subscription status.", ["active", "upcoming"]),
    }),
  ),
  fundAction(
    "get_fund_stock_holdings_history",
    "Get disclosed historical stock holdings for one fund report period.",
    historicalHoldingsInput("Input for querying historical fund stock holdings."),
  ),
  fundAction(
    "list_fund_stock_report_dates",
    "List valid stock-holdings report periods for one public fund.",
    reportDatesInput("Input for listing fund stock-holdings report periods."),
  ),
  fundAction(
    "get_fund_bond_holdings_history",
    "Get disclosed historical bond holdings for one fund report period.",
    historicalHoldingsInput("Input for querying historical fund bond holdings."),
  ),
  fundAction(
    "list_fund_bond_report_dates",
    "List valid bond-holdings report periods for one public fund.",
    reportDatesInput("Input for listing fund bond-holdings report periods."),
  ),
  fundAction(
    "get_fund_asset_allocation",
    "Get disclosed stock, bond, deposit, and other asset allocation for one public fund.",
    fundIdentityInput,
  ),
];

function historicalHoldingsInput(description: string) {
  return s.object(description, {
    fundType: fundTypeSchema,
    thscode: s.nonEmptyString("Complete fund code including its market suffix."),
    reportType: s.nonEmptyString("Report type returned by the corresponding report-dates action."),
    endDate: s.nonEmptyString("Report end date returned by the corresponding report-dates action."),
  });
}

function reportDatesInput(description: string) {
  return s.object(description, {
    fundType: fundTypeSchema,
    thscode: s.nonEmptyString("Complete fund code including its market suffix."),
    reportType: s.optional(s.nonEmptyString("Optional report type used to narrow available dates.")),
  });
}

const looseItem = s.looseObject("One market-special-data row returned by Tonghuashun.");
const timestampedItemsOutput = (description: string) =>
  s.looseRequiredObject(description, {
    timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
    item: s.array("Rows returned for this market-special-data query.", looseItem),
  });
const paginationSchema = s.looseRequiredObject("Pagination information for a market pool.", {
  total: s.integer("Total number of matching stocks."),
  pages: s.integer("Total number of available pages."),
  size: s.integer("Page size applied by Tonghuashun."),
  page: s.integer("Current one-based page number."),
});
const poolOutputSchema = s.looseRequiredObject("A paginated Tonghuashun market pool.", {
  timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
  pagination: paginationSchema,
  item: s.array("Stocks in the requested market pool page.", looseItem),
});
const periodInputSchema = s.object("Input for querying a current Tonghuashun ranking.", {
  period: s.optional(s.stringEnum("Ranking period.", ["day", "hour"])),
});

function poolInputSchema(description: string, sortFields: readonly string[]) {
  return s.object(description, {
    dateMs: s.optional(s.integer("Trading date at Shanghai midnight in milliseconds.")),
    page: s.optional(s.integer("One-based result page number.", { minimum: 1 })),
    size: s.optional(s.integer("Number of stocks per page.", { minimum: 1, maximum: 200 })),
    sortField: s.optional(s.stringEnum("Field used to sort the pool.", sortFields)),
    sortDirection: s.optional(s.stringEnum("Sort direction.", ["asc", "desc"])),
  });
}

const hithinkFinanceSpecialActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_limit_up_stocks",
    description: "List stocks in the Tonghuashun limit-up and consecutive-limit-up pool.",
    requiredScopes: [],
    inputSchema: poolInputSchema("Input for listing the A-share limit-up pool.", [
      "last_price",
      "continue_day_cnt",
      "seal_money",
      "limit_up_time",
    ]),
    outputSchema: poolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_limit_up_ladder",
    description: "Get the fixed 30-trading-day Tonghuashun consecutive-limit-up ladder.",
    requiredScopes: [],
    inputSchema: s.object("This action does not require input parameters.", {}),
    outputSchema: s.looseRequiredObject("The consecutive-limit-up ladder.", {
      timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
      window: s.looseObject("Window dates and board-cap metadata."),
      item: s.array("Daily consecutive-limit-up ladder rows.", looseItem),
    }),
  }),
  defineProviderAction(service, {
    name: "list_stock_anomalies",
    description: "List today's A-share anomaly explanations with optional anomaly-tag filters.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing today's market anomalies.", {
      tagCodes: s.optional(
        s.array(
          "Anomaly tags combined with OR semantics.",
          s.stringEnum("One supported anomaly tag.", [
            "LIMIT_UP",
            "LIMIT_DOWN",
            "SHARP_RISE",
            "SHARP_FALL",
            "RAPID_RALLY",
            "RAPID_DECLINE",
          ]),
          { minItems: 1 },
        ),
      ),
    }),
    outputSchema: timestampedItemsOutput("Today's market anomaly explanations."),
  }),
  defineProviderAction(service, {
    name: "get_stock_anomalies",
    description: "Get today's anomaly explanations for up to 50 selected A-share securities.",
    requiredScopes: [],
    inputSchema: s.object("Input for querying anomalies for selected stocks.", {
      thscodes: s.array(
        "Complete A-share codes to query.",
        s.nonEmptyString("One complete A-share code including its market suffix."),
        { minItems: 1, maxItems: 50 },
      ),
    }),
    outputSchema: timestampedItemsOutput("Today's anomaly explanations for selected stocks."),
  }),
  defineProviderAction(service, {
    name: "list_skyrocketing_stocks",
    description: "List the current Tonghuashun skyrocketing-stock ranking.",
    requiredScopes: [],
    inputSchema: periodInputSchema,
    outputSchema: timestampedItemsOutput("The current skyrocketing-stock ranking."),
  }),
  defineProviderAction(service, {
    name: "list_hot_stocks",
    description: "List the current Tonghuashun hot-stock ranking.",
    requiredScopes: [],
    inputSchema: periodInputSchema,
    outputSchema: timestampedItemsOutput("The current hot-stock ranking."),
  }),
  defineProviderAction(service, {
    name: "get_hot_stock_history",
    description: "Get the Tonghuashun hot-stock ranking for one date in the latest year.",
    requiredScopes: [],
    inputSchema: s.object("Input for querying one historical hot-stock ranking.", {
      date: s.date("Natural date in YYYY-MM-DD format."),
    }),
    outputSchema: s.looseRequiredObject("One historical hot-stock ranking.", {
      date: s.string("Date represented by this ranking."),
      date_ms: s.integer("Date at Shanghai midnight in milliseconds."),
      item: s.array("Stocks in the historical ranking.", looseItem),
    }),
  }),
  defineProviderAction(service, {
    name: "get_hot_stock_rank_trend",
    description: "Get one A-share security's hot-stock rank trend over a date range.",
    requiredScopes: [],
    inputSchema: s.object("Input for querying a hot-stock rank trend.", {
      thscode: s.nonEmptyString("Complete A-share code including its market suffix."),
      startDate: s.date("First date in YYYY-MM-DD format."),
      endDate: s.date("Last date in YYYY-MM-DD format."),
    }),
    outputSchema: timestampedItemsOutput("The selected stock's hot-stock rank trend."),
  }),
  defineProviderAction(service, {
    name: "get_dragon_tiger_list",
    description: "Get the Tonghuashun Dragon-Tiger list for all, institutional, or hot-money activity.",
    requiredScopes: [],
    inputSchema: s.object("Input for querying the Dragon-Tiger list.", {
      boardType: s.optional(s.stringEnum("Dragon-Tiger board type.", ["all", "org", "hot_money"])),
      date: s.optional(s.date("Trading date in YYYY-MM-DD format; omit for the latest date.")),
    }),
    outputSchema: s.looseRequiredObject("The requested Dragon-Tiger list.", {
      timestamp: s.integer("Data-ready time as a Unix timestamp in milliseconds."),
      board_type: s.string("Dragon-Tiger board type returned by Tonghuashun."),
      trade_date: s.string("Trading date represented by the list."),
      count: s.integer("Total number of returned records."),
      stock_count: s.integer("Number of distinct stocks in the list."),
      stock_items: s.array("Stock-level Dragon-Tiger records.", looseItem),
      hot_money_items: s.array("Hot-money records when included by the board type.", looseItem),
    }),
  }),
  defineProviderAction(service, {
    name: "list_limit_down_stocks",
    description: "List stocks in the Tonghuashun A-share limit-down pool.",
    requiredScopes: [],
    inputSchema: poolInputSchema("Input for listing the A-share limit-down pool.", [
      "last_limit_time",
      "first_limit_time",
      "last_price",
      "price_change_ratio_pct",
      "turnover_ratio_pct",
    ]),
    outputSchema: poolOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_limit_break_stocks",
    description: "List stocks that touched their limit-up price and subsequently reopened.",
    requiredScopes: [],
    inputSchema: poolInputSchema("Input for listing the A-share limit-break pool.", [
      "price_change_ratio_pct",
      "open_times",
      "last_price",
      "turnover_ratio_pct",
      "turnover",
    ]),
    outputSchema: poolOutputSchema,
  }),
];

export const hithinkFinanceMarketDumpExpiresAtSchema: import("../../core/types.ts").JsonSchema = s.dateTime(
  "ISO 8601 expiration time of the temporary upstream URL used for the download.",
);

const fileOutputSchema = s.object("A Tonghuashun Parquet dataset uploaded to transit storage.", {
  file: s.object("The persistent Parquet file.", {
    fileId: s.nonEmptyString("The local transit file identifier."),
    downloadUrl: s.url("The local transit URL for downloading the Parquet dataset."),
    sizeBytes: s.nonNegativeInteger("The stored file size in bytes."),
    name: s.nonEmptyString("The exported Parquet file name."),
    mimeType: s.nonEmptyString("The Parquet MIME type."),
  }),
  sourceExpiresAt: hithinkFinanceMarketDumpExpiresAtSchema,
});

function dumpAction(name: string, description: string): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: [],
    inputSchema: s.object("This export action does not require input parameters.", {}),
    outputSchema: fileOutputSchema,
  });
}

const hithinkFinanceDumpActions: ActionDefinition[] = [
  dumpAction(
    "export_full_market_daily_history",
    "Download the full A-share ten-year daily-price Parquet dataset and upload it to transit storage.",
  ),
  dumpAction(
    "export_recent_market_daily_history",
    "Download the latest ten trading days of A-share daily-price data and upload it to transit storage.",
  ),
  dumpAction(
    "export_market_adjustment_factors",
    "Download the full A-share adjustment-event Parquet dataset and upload it to transit storage.",
  ),
];

export const hithinkFinanceActions: ActionDefinition[] = [
  ...hithinkFinanceCoreActions,
  ...hithinkFinanceSpecialActions,
  ...hithinkFinanceFundActions,
  ...hithinkFinanceDumpActions,
];
