import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "financial_modeling_prep";

const exchangeSchema = s.stringEnum("The exchange filter supported by Financial Modeling Prep.", [
  "AMEX",
  "ASX",
  "EURONEXT",
  "NASDAQ",
  "NYSE",
  "TSX",
]);

const financialPeriodSchema = s.stringEnum("The financial statement period to retrieve.", ["annual", "quarter"]);

const marketMoverTypeSchema = s.stringEnum("The market mover list to retrieve from Financial Modeling Prep.", [
  "gainers",
  "losers",
  "actives",
]);

const assetQuoteTypeSchema = s.stringEnum("The market data asset family to quote.", [
  "commodity",
  "crypto",
  "forex",
  "index",
]);

const newsTypeSchema = s.stringEnum("The Financial Modeling Prep news feed to retrieve.", [
  "general",
  "press_releases",
  "stock",
  "crypto",
  "forex",
]);

const congressionalTradeChamberSchema = s.stringEnum("The congressional trading disclosure chamber to retrieve.", [
  "senate",
  "house",
]);

const technicalIndicatorTypeSchema = s.stringEnum(
  "The technical indicator endpoint to retrieve from Financial Modeling Prep.",
  ["sma", "ema", "wma", "dema", "tema", "rsi", "standarddeviation", "williams", "adx"],
);

const technicalIndicatorTimeframeSchema = s.stringEnum("The chart timeframe for the technical indicator calculation.", [
  "1min",
  "5min",
  "15min",
  "30min",
  "1hour",
  "4hour",
  "1day",
]);

const symbolSearchItemSchema = s.requiredObject("A stock search result returned by Financial Modeling Prep.", {
  symbol: s.string("The stock ticker symbol."),
  name: s.string("The company or security name."),
  currency: s.string("The trading currency."),
  stockExchange: s.string("The stock exchange display name."),
  exchangeShortName: s.string("The exchange short code."),
});

const quoteItemSchema = s.looseObject(
  {
    symbol: s.string("The stock ticker symbol."),
    name: s.string("The company or security name."),
    price: s.number("The latest price returned by Financial Modeling Prep."),
    change: s.number("The latest absolute price change."),
    changesPercentage: s.number("The latest price change percentage."),
    dayLow: s.number("The lowest price during the current trading day."),
    dayHigh: s.number("The highest price during the current trading day."),
    yearHigh: s.number("The 52-week high price."),
    yearLow: s.number("The 52-week low price."),
    marketCap: s.number("The latest market capitalization."),
    volume: s.number("The latest trading volume."),
    avgVolume: s.number("The average trading volume."),
    exchange: s.string("The exchange returned by Financial Modeling Prep."),
    open: s.number("The opening price for the current trading day."),
    previousClose: s.number("The previous close price."),
    timestamp: s.integer("The quote timestamp returned by Financial Modeling Prep."),
  },
  { description: "A normalized stock quote row." },
);

const historicalPriceItemSchema = s.requiredObject("A historical OHLCV price row.", {
  date: s.string("The trading date in YYYY-MM-DD format."),
  open: s.number("The opening price for the trading day."),
  high: s.number("The highest price for the trading day."),
  low: s.number("The lowest price for the trading day."),
  close: s.number("The closing price for the trading day."),
  adjClose: s.number("The adjusted closing price for the trading day."),
  volume: s.number("The trading volume for the trading day."),
});

const companyProfileSchema = s.looseObject(
  {
    symbol: s.string("The stock ticker symbol."),
    companyName: s.string("The company name."),
  },
  { description: "A company profile object returned by Financial Modeling Prep." },
);

const statementRowSchema = s.looseObject(
  {
    symbol: s.string("The stock ticker symbol."),
    date: s.string("The statement date in YYYY-MM-DD format."),
    period: s.string("The statement period returned by Financial Modeling Prep."),
  },
  { description: "A financial statement row returned by Financial Modeling Prep." },
);

const looseRowSchema = s.looseObject({}, { description: "A row returned by Financial Modeling Prep." });

export const financialModelingPrepActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_symbols",
    description: "Search Financial Modeling Prep stock symbols by ticker fragment or company name.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for searching Financial Modeling Prep stock symbols.",
      {
        query: s.nonEmptyString("The ticker fragment or company name to search for."),
        limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 }),
        exchange: exchangeSchema,
      },
      { optional: ["limit", "exchange"] },
    ),
    outputSchema: s.requiredObject("The stock symbol search response.", {
      results: s.array("The matching stock symbols.", symbolSearchItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_names",
    description: "Search Financial Modeling Prep securities by company or security name.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for searching Financial Modeling Prep security names.",
      {
        query: s.nonEmptyString("The company or security name fragment to search for."),
        limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 }),
        exchange: exchangeSchema,
      },
      { optional: ["limit", "exchange"] },
    ),
    outputSchema: s.requiredObject("The name search response.", {
      results: s.array("The matching securities.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_company_screener",
    description: "Search companies with Financial Modeling Prep screener filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for searching companies with screener filters.",
      {
        marketCapMoreThan: s.integer("Only include companies above this market cap.", { minimum: 1 }),
        marketCapLowerThan: s.integer("Only include companies below this market cap.", { minimum: 1 }),
        priceMoreThan: s.number("Only include companies above this share price."),
        priceLowerThan: s.number("Only include companies below this share price."),
        betaMoreThan: s.number("Only include companies above this beta."),
        betaLowerThan: s.number("Only include companies below this beta."),
        volumeMoreThan: s.integer("Only include companies above this volume.", { minimum: 1 }),
        volumeLowerThan: s.integer("Only include companies below this volume.", { minimum: 1 }),
        dividendMoreThan: s.number("Only include companies above this dividend value."),
        dividendLowerThan: s.number("Only include companies below this dividend value."),
        isEtf: s.boolean("Whether to include only ETFs."),
        isFund: s.boolean("Whether to include only funds."),
        sector: s.nonEmptyString("The sector filter."),
        industry: s.nonEmptyString("The industry filter."),
        country: s.nonEmptyString("The country filter."),
        exchange: exchangeSchema,
        limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 1000 }),
      },
      {
        optional: [
          "marketCapMoreThan",
          "marketCapLowerThan",
          "priceMoreThan",
          "priceLowerThan",
          "betaMoreThan",
          "betaLowerThan",
          "volumeMoreThan",
          "volumeLowerThan",
          "dividendMoreThan",
          "dividendLowerThan",
          "isEtf",
          "isFund",
          "sector",
          "industry",
          "country",
          "exchange",
          "limit",
        ],
      },
    ),
    outputSchema: s.requiredObject("The company screener response.", {
      companies: s.array("The matching company rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_directory",
    description: "List Financial Modeling Prep directory rows such as stocks, ETFs, and exchanges.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for listing a Financial Modeling Prep directory.", {
      type: s.stringEnum("The directory list to retrieve.", [
        "stocks",
        "financial_symbols",
        "financial_statement_symbols",
        "cik",
        "symbol_changes",
        "etfs",
        "actively_trading",
        "exchanges",
        "sectors",
        "industries",
        "countries",
      ]),
    }),
    outputSchema: s.requiredObject("The directory list response.", {
      items: s.array("The directory rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_quote",
    description: "Retrieve the latest quote for one stock symbol from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving a stock quote.", {
      symbol: s.nonEmptyString("The stock ticker symbol to quote, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The latest quote response.", {
      quote: quoteItemSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_quote_short",
    description: "Retrieve the latest compact quote for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving a compact stock quote.", {
      symbol: s.nonEmptyString("The stock ticker symbol to quote, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The compact stock quote response.", {
      quote: looseRowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_asset_quote",
    description: "Retrieve the latest quote for a commodity, cryptocurrency, forex pair, or index.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving a non-stock market quote.", {
      assetType: assetQuoteTypeSchema,
      symbol: s.nonEmptyString("The asset symbol to quote, such as BTCUSD, EURUSD, GCUSD, or ^GSPC."),
    }),
    outputSchema: s.requiredObject("The asset quote response.", {
      quote: looseRowSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_historical_prices",
    description: "Retrieve historical daily OHLCV prices for one stock symbol from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving historical daily prices.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        from: s.string("The inclusive start date in YYYY-MM-DD format.", { format: "date" }),
        to: s.string("The inclusive end date in YYYY-MM-DD format.", { format: "date" }),
      },
      { optional: ["from", "to"] },
    ),
    outputSchema: s.requiredObject("The historical daily price response.", {
      symbol: s.string("The stock ticker symbol returned by Financial Modeling Prep."),
      historical: s.array("The historical daily OHLCV rows.", historicalPriceItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_intraday_prices",
    description: "Retrieve intraday OHLCV prices for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving intraday prices.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        interval: s.stringEnum("The intraday interval to retrieve.", [
          "1min",
          "5min",
          "15min",
          "30min",
          "1hour",
          "4hour",
        ]),
        from: s.string("The inclusive start date in YYYY-MM-DD format.", { format: "date" }),
        to: s.string("The inclusive end date in YYYY-MM-DD format.", { format: "date" }),
      },
      { optional: ["from", "to"] },
    ),
    outputSchema: s.requiredObject("The intraday price response.", {
      prices: s.array("The intraday OHLCV rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_profile",
    description: "Retrieve the company profile for one stock symbol from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving a company profile.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The company profile response.", {
      profile: companyProfileSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_profile_by_cik",
    description: "Retrieve company profile rows by CIK from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving a company profile by CIK.", {
      cik: s.nonEmptyString("The company CIK to query."),
    }),
    outputSchema: s.requiredObject("The company profile by CIK response.", {
      profiles: s.array("The company profile rows.", companyProfileSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_peers",
    description: "Retrieve peer companies for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving company peers.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The company peers response.", {
      peers: s.array("The peer rows returned by Financial Modeling Prep.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_executives",
    description: "Retrieve company executive rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving company executives.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The company executives response.", {
      executives: s.array("The executive rows returned by Financial Modeling Prep.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_notes",
    description: "Retrieve company note rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving company notes.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The company notes response.", {
      notes: s.array("The company note rows returned by Financial Modeling Prep.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_market_cap",
    description: "Retrieve latest market capitalization rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving market capitalization.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The market capitalization response.", {
      rows: s.array("The market capitalization rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_shares_float",
    description: "Retrieve shares float rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving shares float data.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The shares float response.", {
      rows: s.array("The shares float rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_income_statement",
    description: "Retrieve income statement rows for one stock symbol from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving income statement rows.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        limit: s.integer("The maximum number of statement rows to return.", { minimum: 1, maximum: 120 }),
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: s.requiredObject("The income statement response.", {
      statements: s.array("The income statement rows.", statementRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_balance_sheet_statement",
    description: "Retrieve balance sheet statement rows for one stock symbol from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving balance sheet statement rows.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        limit: s.integer("The maximum number of statement rows to return.", { minimum: 1, maximum: 120 }),
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: s.requiredObject("The balance sheet statement response.", {
      statements: s.array("The balance sheet statement rows.", statementRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_cash_flow_statement",
    description: "Retrieve cash flow statement rows for one stock symbol from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving cash flow statement rows.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        limit: s.integer("The maximum number of statement rows to return.", { minimum: 1, maximum: 120 }),
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: s.requiredObject("The cash flow statement response.", {
      statements: s.array("The cash flow statement rows.", statementRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_financial_statement_growth",
    description:
      "Retrieve financial statement growth rows for income, balance sheet, cash flow, or combined financial statements.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving financial statement growth rows.",
      {
        statementType: s.stringEnum("The growth statement family to retrieve.", [
          "income",
          "balance_sheet",
          "cash_flow",
          "financial",
        ]),
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        limit: s.integer("The maximum number of growth rows to return.", { minimum: 1, maximum: 120 }),
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: s.requiredObject("The financial statement growth response.", {
      rows: s.array("The financial statement growth rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_financial_ratios",
    description: "Retrieve financial ratios for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving financial ratios.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        limit: s.integer("The maximum number of ratio rows to return.", { minimum: 1, maximum: 120 }),
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: s.requiredObject("The financial ratios response.", {
      ratios: s.array("The financial ratio rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_key_metrics",
    description: "Retrieve key financial metrics for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving key metrics.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        limit: s.integer("The maximum number of metric rows to return.", { minimum: 1, maximum: 120 }),
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: s.requiredObject("The key metrics response.", {
      metrics: s.array("The key metric rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_financial_scores",
    description: "Retrieve financial score rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving financial scores.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The financial scores response.", {
      scores: s.array("The financial score rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_enterprise_values",
    description: "Retrieve enterprise value rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving enterprise values.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        limit: s.integer("The maximum number of enterprise value rows to return.", { minimum: 1, maximum: 120 }),
      },
      { optional: ["period", "limit"] },
    ),
    outputSchema: s.requiredObject("The enterprise values response.", {
      values: s.array("The enterprise value rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_dcf",
    description: "Retrieve discounted cash flow valuation rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving discounted cash flow valuation rows.", {
      symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
    }),
    outputSchema: s.requiredObject("The discounted cash flow response.", {
      valuations: s.array("The discounted cash flow rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_market_movers",
    description: "Retrieve the current biggest gainers, losers, or most active stocks from Financial Modeling Prep.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving a market mover list.", {
      type: marketMoverTypeSchema,
    }),
    outputSchema: s.requiredObject("The market mover response.", {
      movers: s.array("The stock quote rows in the requested market mover list.", quoteItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_market_performance",
    description: "Retrieve sector or industry market performance snapshot rows.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving market performance snapshots.", {
      type: s.stringEnum("The market performance snapshot to retrieve.", [
        "sector_performance",
        "industry_performance",
        "sector_pe",
        "industry_pe",
      ]),
    }),
    outputSchema: s.requiredObject("The market performance response.", {
      rows: s.array("The market performance rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_news",
    description: "Retrieve latest or symbol-filtered Financial Modeling Prep news.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving Financial Modeling Prep news.",
      {
        type: newsTypeSchema,
        symbols: s.nonEmptyString("A comma-separated list of symbols for symbol-specific news."),
        page: s.integer("The zero-based result page to retrieve.", { minimum: 0 }),
        limit: s.integer("The maximum number of news rows to return.", { minimum: 1, maximum: 100 }),
      },
      { optional: ["symbols", "page", "limit"] },
    ),
    outputSchema: s.requiredObject("The news response.", {
      news: s.array("The news rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_calendar",
    description: "Retrieve Financial Modeling Prep market calendar rows.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving market calendar rows.",
      {
        type: s.stringEnum("The market calendar to retrieve.", ["earnings", "dividends", "splits", "ipos", "economic"]),
        from: s.string("The inclusive start date in YYYY-MM-DD format.", { format: "date" }),
        to: s.string("The inclusive end date in YYYY-MM-DD format.", { format: "date" }),
      },
      { optional: ["from", "to"] },
    ),
    outputSchema: s.requiredObject("The market calendar response.", {
      events: s.array("The market calendar rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_economic_indicators",
    description: "Retrieve economic indicator rows such as GDP, CPI, or unemployment.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving economic indicators.",
      {
        name: s.nonEmptyString("The economic indicator name, such as GDP."),
        from: s.string("The inclusive start date in YYYY-MM-DD format.", { format: "date" }),
        to: s.string("The inclusive end date in YYYY-MM-DD format.", { format: "date" }),
      },
      { optional: ["from", "to"] },
    ),
    outputSchema: s.requiredObject("The economic indicators response.", {
      indicators: s.array("The economic indicator rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_analyst_estimates",
    description: "Retrieve analyst estimate rows for one stock symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving analyst estimates.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        period: financialPeriodSchema,
        page: s.integer("The zero-based result page to retrieve.", { minimum: 0 }),
        limit: s.integer("The maximum number of analyst estimate rows to return.", { minimum: 1, maximum: 100 }),
      },
      { optional: ["period", "page", "limit"] },
    ),
    outputSchema: s.requiredObject("The analyst estimates response.", {
      estimates: s.array("The analyst estimate rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_ratings",
    description: "Retrieve rating snapshot, historical rating, or historical grade rows.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving ratings or grades.",
      {
        type: s.stringEnum("The ratings or grades endpoint to retrieve.", [
          "ratings_snapshot",
          "ratings_historical",
          "grades",
          "grades_historical",
          "grades_summary",
          "grades_consensus",
        ]),
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        limit: s.integer("The maximum number of rating rows to return.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.requiredObject("The ratings response.", {
      ratings: s.array("The rating or grade rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_insider_trades",
    description: "Retrieve latest or searched insider trading disclosure rows.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving insider trading disclosures.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        reportingCik: s.nonEmptyString("The reporting owner CIK to query."),
        transactionType: s.nonEmptyString("The insider transaction type to query."),
        page: s.integer("The zero-based result page to retrieve.", { minimum: 0 }),
        limit: s.integer("The maximum number of insider trade rows to return.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["symbol", "reportingCik", "transactionType", "page", "limit"] },
    ),
    outputSchema: s.requiredObject("The insider trading response.", {
      trades: s.array("The insider trading disclosure rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_congressional_trades",
    description: "Retrieve senate or house trading disclosure rows.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving congressional trading disclosures.",
      {
        chamber: congressionalTradeChamberSchema,
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        name: s.nonEmptyString("The representative or senator name to query."),
        page: s.integer("The zero-based result page to retrieve.", { minimum: 0 }),
        limit: s.integer("The maximum number of trading disclosure rows to return.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["symbol", "name", "page", "limit"] },
    ),
    outputSchema: s.requiredObject("The congressional trading response.", {
      trades: s.array("The congressional trading disclosure rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_sec_filings",
    description: "Search SEC filing rows by symbol, CIK, or form type.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for searching SEC filing rows.",
      {
        symbol: s.nonEmptyString("The stock ticker symbol to query, such as AAPL."),
        cik: s.nonEmptyString("The company CIK to query."),
        formType: s.nonEmptyString("The SEC form type to query, such as 10-K."),
        from: s.string("The inclusive start date in YYYY-MM-DD format.", { format: "date" }),
        to: s.string("The inclusive end date in YYYY-MM-DD format.", { format: "date" }),
        page: s.integer("The zero-based result page to retrieve.", { minimum: 0 }),
        limit: s.integer("The maximum number of filing rows to return.", { minimum: 1, maximum: 1000 }),
      },
      { optional: ["symbol", "cik", "formType", "from", "to", "page", "limit"] },
    ),
    outputSchema: s.requiredObject("The SEC filing search response.", {
      filings: s.array("The SEC filing rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_etf_holdings",
    description: "Retrieve ETF holding rows for one ETF symbol.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The input for retrieving ETF holdings.", {
      symbol: s.nonEmptyString("The ETF symbol to query, such as SPY."),
    }),
    outputSchema: s.requiredObject("The ETF holdings response.", {
      holdings: s.array("The ETF holding rows.", looseRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_technical_indicator",
    description: "Retrieve technical indicator rows for one symbol.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input for retrieving technical indicator rows.",
      {
        indicator: technicalIndicatorTypeSchema,
        symbol: s.nonEmptyString("The symbol to query, such as AAPL."),
        periodLength: s.integer("The look-back period length for the indicator.", { minimum: 1, maximum: 500 }),
        timeframe: technicalIndicatorTimeframeSchema,
        from: s.string("The inclusive start date in YYYY-MM-DD format.", { format: "date" }),
        to: s.string("The inclusive end date in YYYY-MM-DD format.", { format: "date" }),
      },
      { optional: ["periodLength", "timeframe", "from", "to"] },
    ),
    outputSchema: s.requiredObject("The technical indicator response.", {
      values: s.array("The technical indicator rows.", looseRowSchema),
    }),
  }),
];

export type FinancialModelingPrepActionName =
  | "search_symbols"
  | "search_names"
  | "search_company_screener"
  | "list_directory"
  | "get_quote"
  | "get_quote_short"
  | "get_asset_quote"
  | "get_historical_prices"
  | "get_intraday_prices"
  | "get_company_profile"
  | "get_company_profile_by_cik"
  | "get_company_peers"
  | "get_company_executives"
  | "get_company_notes"
  | "get_market_cap"
  | "get_shares_float"
  | "get_income_statement"
  | "get_balance_sheet_statement"
  | "get_cash_flow_statement"
  | "get_financial_statement_growth"
  | "get_financial_ratios"
  | "get_key_metrics"
  | "get_financial_scores"
  | "get_enterprise_values"
  | "get_dcf"
  | "get_market_movers"
  | "get_market_performance"
  | "get_news"
  | "get_calendar"
  | "get_economic_indicators"
  | "get_analyst_estimates"
  | "get_ratings"
  | "get_insider_trades"
  | "get_congressional_trades"
  | "get_sec_filings"
  | "get_etf_holdings"
  | "get_technical_indicator";
