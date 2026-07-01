import type { FinancialModelingPrepActionName } from "./actions.ts";

import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type FinancialModelingPrepPhase = "validate" | "execute";
type FinancialModelingPrepQueryValue = boolean | number | string | undefined;
type FinancialModelingPrepActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};
type FinancialModelingPrepActionHandler = (
  input: Record<string, unknown>,
  context: FinancialModelingPrepActionContext,
) => Promise<unknown>;

export const financialModelingPrepApiBaseUrl = "https://financialmodelingprep.com/stable";

export const financialModelingPrepActionHandlers: Record<
  FinancialModelingPrepActionName,
  FinancialModelingPrepActionHandler
> = {
  async search_symbols(input, context) {
    const payload = await financialModelingPrepGet(
      "/search-symbol",
      {
        query: readRequiredInputString(input.query, "query"),
        limit: optionalInteger(input.limit),
        exchange: optionalString(input.exchange),
      },
      context,
      "execute",
    );

    return {
      results: readRequiredArray(payload, "payload").map((item, index) =>
        normalizeSymbolSearchItem(readRequiredObject(item, `payload[${index}]`)),
      ),
    };
  },
  async search_names(input, context) {
    return getArrayRows(
      "/search-name",
      {
        query: readRequiredInputString(input.query, "query"),
        limit: optionalInteger(input.limit),
        exchange: optionalString(input.exchange),
      },
      "results",
      context,
    );
  },
  async search_company_screener(input, context) {
    return getArrayRows(
      "/company-screener",
      readQuery(input, [
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
      ]),
      "companies",
      context,
    );
  },
  async list_directory(input, context) {
    const type = readRequiredInputString(input.type, "type");
    const endpointByType: Record<string, string> = {
      stocks: "/stock-list",
      financial_symbols: "/financial-symbols-list",
      financial_statement_symbols: "/financial-statement-symbol-list",
      cik: "/cik-list",
      symbol_changes: "/symbol-changes-list",
      etfs: "/etf-list",
      actively_trading: "/actively-trading-list",
      exchanges: "/available-exchanges",
      sectors: "/available-sectors",
      industries: "/available-industries",
      countries: "/available-countries",
    };
    return getArrayRows(readEndpoint(endpointByType, type, "type"), {}, "items", context);
  },
  async get_quote(input, context) {
    const quote = await getQuote(readRequiredInputString(input.symbol, "symbol"), context, "execute");
    return { quote };
  },
  async get_quote_short(input, context) {
    const rows = await getArrayPayload(
      "/quote-short",
      { symbol: readRequiredInputString(input.symbol, "symbol") },
      context,
    );
    return { quote: readRequiredObject(rows[0], "payload[0]") };
  },
  async get_asset_quote(input, context) {
    const assetType = readRequiredInputString(input.assetType, "assetType");
    const endpointByType: Record<string, string> = {
      commodity: "/batch-commodity-quotes",
      crypto: "/batch-crypto-quotes",
      forex: "/batch-forex-quotes",
      index: "/batch-index-quotes",
    };
    const symbol = readRequiredInputString(input.symbol, "symbol");
    const rows = await getArrayPayload(readEndpoint(endpointByType, assetType, "assetType"), {}, context);
    const quote = rows.find((row) => optionalString(optionalRecord(row)?.symbol) === symbol) ?? rows[0];
    return { quote: readRequiredObject(quote, "payload[0]") };
  },
  async get_historical_prices(input, context) {
    const symbol = readRequiredInputString(input.symbol, "symbol");
    const payload = await financialModelingPrepGet(
      "/historical-price-eod/full",
      {
        symbol,
        from: optionalString(input.from),
        to: optionalString(input.to),
      },
      context,
      "execute",
    );

    return {
      symbol,
      historical: readRequiredArray(payload, "payload").map((item, index) =>
        normalizeHistoricalPrice(readRequiredObject(item, `payload[${index}]`)),
      ),
    };
  },
  async get_intraday_prices(input, context) {
    const interval = readRequiredInputString(input.interval, "interval");
    const endpointByInterval: Record<string, string> = {
      "1min": "/historical-chart/1min",
      "5min": "/historical-chart/5min",
      "15min": "/historical-chart/15min",
      "30min": "/historical-chart/30min",
      "1hour": "/historical-chart/1hour",
      "4hour": "/historical-chart/4hour",
    };
    return getArrayRows(
      readEndpoint(endpointByInterval, interval, "interval"),
      {
        symbol: readRequiredInputString(input.symbol, "symbol"),
        from: optionalString(input.from),
        to: optionalString(input.to),
      },
      "prices",
      context,
    );
  },
  async get_company_profile(input, context) {
    const symbol = readRequiredInputString(input.symbol, "symbol");
    const payload = await financialModelingPrepGet("/profile", { symbol }, context, "execute");
    const rows = readRequiredArray(payload, "payload");
    return {
      profile: readRequiredObject(rows[0], "payload[0]"),
    };
  },
  async get_company_profile_by_cik(input, context) {
    return getArrayRows("/profile-cik", { cik: readRequiredInputString(input.cik, "cik") }, "profiles", context);
  },
  async get_company_peers(input, context) {
    return getArrayRows("/stock-peers", { symbol: readRequiredInputString(input.symbol, "symbol") }, "peers", context);
  },
  async get_company_executives(input, context) {
    return getArrayRows(
      "/key-executives",
      { symbol: readRequiredInputString(input.symbol, "symbol") },
      "executives",
      context,
    );
  },
  async get_company_notes(input, context) {
    return getArrayRows(
      "/company-notes",
      { symbol: readRequiredInputString(input.symbol, "symbol") },
      "notes",
      context,
    );
  },
  async get_market_cap(input, context) {
    return getArrayRows(
      "/market-capitalization",
      { symbol: readRequiredInputString(input.symbol, "symbol") },
      "rows",
      context,
    );
  },
  async get_shares_float(input, context) {
    return getArrayRows("/shares-float", { symbol: readRequiredInputString(input.symbol, "symbol") }, "rows", context);
  },
  async get_income_statement(input, context) {
    return getStatementRows("/income-statement", input, context);
  },
  async get_balance_sheet_statement(input, context) {
    return getStatementRows("/balance-sheet-statement", input, context);
  },
  async get_cash_flow_statement(input, context) {
    return getStatementRows("/cash-flow-statement", input, context);
  },
  async get_financial_statement_growth(input, context) {
    const statementType = readRequiredInputString(input.statementType, "statementType");
    const endpointByType: Record<string, string> = {
      income: "/income-statement-growth",
      balance_sheet: "/balance-sheet-statement-growth",
      cash_flow: "/cash-flow-statement-growth",
      financial: "/financial-statement-growth",
    };
    return getArrayRows(
      readEndpoint(endpointByType, statementType, "statementType"),
      statementQuery(input),
      "rows",
      context,
    );
  },
  async get_financial_ratios(input, context) {
    return getArrayRows("/ratios", statementQuery(input), "ratios", context);
  },
  async get_key_metrics(input, context) {
    return getArrayRows("/key-metrics", statementQuery(input), "metrics", context);
  },
  async get_financial_scores(input, context) {
    return getArrayRows(
      "/financial-scores",
      { symbol: readRequiredInputString(input.symbol, "symbol") },
      "scores",
      context,
    );
  },
  async get_enterprise_values(input, context) {
    return getArrayRows("/enterprise-values", statementQuery(input), "values", context);
  },
  async get_dcf(input, context) {
    return getArrayRows(
      "/discounted-cash-flow",
      { symbol: readRequiredInputString(input.symbol, "symbol") },
      "valuations",
      context,
    );
  },
  async get_market_movers(input, context) {
    const type = readRequiredInputString(input.type, "type");
    const endpointByType: Record<string, string> = {
      gainers: "/biggest-gainers",
      losers: "/biggest-losers",
      actives: "/most-actives",
    };
    const endpoint = endpointByType[type];
    if (!endpoint) {
      throw new ProviderRequestError(400, "type must be gainers, losers, or actives");
    }

    const payload = await financialModelingPrepGet(endpoint, {}, context, "execute");
    return {
      movers: readRequiredArray(payload, "payload").map((item, index) =>
        normalizeQuote(readRequiredObject(item, `payload[${index}]`)),
      ),
    };
  },
  async get_market_performance(input, context) {
    const type = readRequiredInputString(input.type, "type");
    const endpointByType: Record<string, string> = {
      sector_performance: "/sector-performance-snapshot",
      industry_performance: "/industry-performance-snapshot",
      sector_pe: "/sector-pe-snapshot",
      industry_pe: "/industry-pe-snapshot",
    };
    return getArrayRows(readEndpoint(endpointByType, type, "type"), {}, "rows", context);
  },
  async get_news(input, context) {
    const type = readRequiredInputString(input.type, "type");
    const latestEndpointByType: Record<string, string> = {
      general: "/news/general-latest",
      press_releases: "/news/press-releases-latest",
      stock: "/news/stock-latest",
      crypto: "/news/crypto-latest",
      forex: "/news/forex-latest",
    };
    const searchEndpointByType: Record<string, string> = {
      general: "/news/general-latest",
      press_releases: "/news/press-releases",
      stock: "/news/stock",
      crypto: "/news/crypto",
      forex: "/news/forex",
    };
    const symbols = optionalString(input.symbols);
    return getArrayRows(
      readEndpoint(symbols ? searchEndpointByType : latestEndpointByType, type, "type"),
      {
        symbols,
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
      },
      "news",
      context,
    );
  },
  async get_calendar(input, context) {
    const type = readRequiredInputString(input.type, "type");
    const endpointByType: Record<string, string> = {
      earnings: "/earnings-calendar",
      dividends: "/dividends-calendar",
      splits: "/splits-calendar",
      ipos: "/ipos-calendar",
      economic: "/economic-calendar",
    };
    return getArrayRows(
      readEndpoint(endpointByType, type, "type"),
      {
        from: optionalString(input.from),
        to: optionalString(input.to),
      },
      "events",
      context,
    );
  },
  async get_economic_indicators(input, context) {
    return getArrayRows(
      "/economic-indicators",
      {
        name: readRequiredInputString(input.name, "name"),
        from: optionalString(input.from),
        to: optionalString(input.to),
      },
      "indicators",
      context,
    );
  },
  async get_analyst_estimates(input, context) {
    return getArrayRows(
      "/analyst-estimates",
      {
        symbol: readRequiredInputString(input.symbol, "symbol"),
        period: optionalString(input.period),
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
      },
      "estimates",
      context,
    );
  },
  async get_ratings(input, context) {
    const type = readRequiredInputString(input.type, "type");
    const endpointByType: Record<string, string> = {
      ratings_snapshot: "/ratings-snapshot",
      ratings_historical: "/ratings-historical",
      grades: "/grades",
      grades_historical: "/grades-historical",
      grades_summary: "/grades-summary",
      grades_consensus: "/grades-consensus",
    };
    return getArrayRows(
      readEndpoint(endpointByType, type, "type"),
      {
        symbol: readRequiredInputString(input.symbol, "symbol"),
        limit: optionalInteger(input.limit),
      },
      "ratings",
      context,
    );
  },
  async get_insider_trades(input, context) {
    const query = readQuery(input, ["symbol", "reportingCik", "transactionType", "page", "limit"]);
    if (!query.symbol && !query.reportingCik && !query.transactionType) {
      return getArrayRows("/insider-trading/latest", { page: query.page, limit: query.limit }, "trades", context);
    }
    return getArrayRows("/insider-trading/search", query, "trades", context);
  },
  async get_congressional_trades(input, context) {
    const chamber = readRequiredInputString(input.chamber, "chamber");
    const symbol = optionalString(input.symbol);
    const name = optionalString(input.name);
    const endpoint = symbol || name ? `/${chamber}-trades${name ? "-by-name" : ""}` : `/${chamber}-latest`;
    return getArrayRows(
      endpoint,
      {
        symbol,
        name,
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
      },
      "trades",
      context,
    );
  },
  async get_sec_filings(input, context) {
    const symbol = optionalString(input.symbol);
    const cik = optionalString(input.cik);
    const formType = optionalString(input.formType);
    let endpoint = "/latest-filings";
    let query = readQuery(input, ["from", "to", "page", "limit"]);
    if (symbol) {
      endpoint = "/sec-filings-search/symbol";
      query = { ...query, symbol };
    } else if (cik) {
      endpoint = "/sec-filings-search/cik";
      query = { ...query, cik };
    } else if (formType) {
      endpoint = "/sec-filings-search/form-type";
      query = { ...query, formType };
    }
    return getArrayRows(endpoint, query, "filings", context);
  },
  async get_etf_holdings(input, context) {
    return getArrayRows(
      "/etf/holdings",
      { symbol: readRequiredInputString(input.symbol, "symbol") },
      "holdings",
      context,
    );
  },
  async get_technical_indicator(input, context) {
    const indicator = readRequiredInputString(input.indicator, "indicator");
    return getArrayRows(
      `/technical-indicators/${indicator}`,
      {
        symbol: readRequiredInputString(input.symbol, "symbol"),
        periodLength: optionalInteger(input.periodLength),
        timeframe: optionalString(input.timeframe),
        from: optionalString(input.from),
        to: optionalString(input.to),
      },
      "values",
      context,
    );
  },
};

export async function validateFinancialModelingPrepApiKey(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const quote = await getQuote("AAPL", { apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: "financial_modeling_prep",
      displayName: "Financial Modeling Prep API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/quote",
      apiBaseUrl: financialModelingPrepApiBaseUrl,
      symbol: quote.symbol,
    }),
  };
}

async function getQuote(
  symbol: string,
  context: FinancialModelingPrepActionContext,
  phase: FinancialModelingPrepPhase,
) {
  const payload = await financialModelingPrepGet("/quote", { symbol }, context, phase);
  const rows = readRequiredArray(payload, "payload");
  return normalizeQuote(readRequiredObject(rows[0], "payload[0]"));
}

async function getStatementRows(
  path: string,
  input: Record<string, unknown>,
  context: FinancialModelingPrepActionContext,
) {
  const payload = await financialModelingPrepGet(
    path,
    {
      symbol: readRequiredInputString(input.symbol, "symbol"),
      period: optionalString(input.period),
      limit: optionalInteger(input.limit),
    },
    context,
    "execute",
  );

  return {
    statements: readRequiredArray(payload, "payload").map((item, index) =>
      readRequiredObject(item, `payload[${index}]`),
    ),
  };
}

async function getArrayPayload(
  path: string,
  query: Record<string, FinancialModelingPrepQueryValue>,
  context: FinancialModelingPrepActionContext,
) {
  const payload = await financialModelingPrepGet(path, query, context, "execute");
  return readRequiredArray(payload, "payload");
}

async function getArrayRows(
  path: string,
  query: Record<string, FinancialModelingPrepQueryValue>,
  outputKey: string,
  context: FinancialModelingPrepActionContext,
) {
  return {
    [outputKey]: await getArrayPayload(path, query, context),
  };
}

function statementQuery(input: Record<string, unknown>) {
  return {
    symbol: readRequiredInputString(input.symbol, "symbol"),
    period: optionalString(input.period),
    limit: optionalInteger(input.limit),
  };
}

function readEndpoint(endpoints: Record<string, string>, value: string, fieldName: string) {
  const endpoint = endpoints[value];
  if (!endpoint) {
    throw new ProviderRequestError(400, `${fieldName} is not supported`);
  }
  return endpoint;
}

function readQuery(input: Record<string, unknown>, keys: string[]) {
  const query: Record<string, FinancialModelingPrepQueryValue> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string") {
      query[key] = optionalString(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      query[key] = value;
    }
  }
  return query;
}

async function financialModelingPrepGet(
  path: string,
  query: Record<string, FinancialModelingPrepQueryValue>,
  context: FinancialModelingPrepActionContext,
  phase: FinancialModelingPrepPhase,
) {
  const url = buildFinancialModelingPrepUrl(path, query, context.apiKey);

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Financial Modeling Prep request failed: ${error.message}`
        : "Financial Modeling Prep request failed",
    );
  }

  const payload = await readFinancialModelingPrepPayload(response);
  if (!response.ok || isFinancialModelingPrepErrorPayload(payload)) {
    throw buildFinancialModelingPrepError(phase, response.status, payload);
  }

  return payload;
}

function buildFinancialModelingPrepUrl(
  path: string,
  query: Record<string, FinancialModelingPrepQueryValue>,
  apiKey: string,
) {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${financialModelingPrepApiBaseUrl}/`);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readFinancialModelingPrepPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Financial Modeling Prep returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }

    throw new ProviderRequestError(502, `Financial Modeling Prep returned invalid JSON: ${text.slice(0, 160)}`);
  }
}

function isFinancialModelingPrepErrorPayload(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    return false;
  }

  return (
    optionalString(record.error) !== undefined ||
    optionalString(record.message) !== undefined ||
    optionalString(record["Error Message"]) !== undefined
  );
}

function buildFinancialModelingPrepError(phase: FinancialModelingPrepPhase, status: number, payload: unknown) {
  const message =
    extractFinancialModelingPrepErrorMessage(payload) ??
    `Financial Modeling Prep request failed with status ${status || 502}`;

  if (status === 429 || looksLikeRateLimitMessage(message)) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 402 || looksLikeRestrictedEndpointMessage(message)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 401 || status === 403 || looksLikeCredentialMessage(message)) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message, payload);
    }
    return new ProviderRequestError(401, message, payload);
  }

  if (status === 400 || status === 404 || status === 422 || status === 0) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status >= 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function extractFinancialModelingPrepErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record["Error Message"]);
}

function looksLikeRateLimitMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("limit exceeded");
}

function looksLikeCredentialMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("api key") ||
    normalized.includes("apikey") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid key")
  );
}

function looksLikeRestrictedEndpointMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("restricted endpoint") || normalized.includes("upgrade your plan");
}

function normalizeSymbolSearchItem(input: Record<string, unknown>) {
  return {
    symbol: readRequiredString(input.symbol, "symbol"),
    name: readRequiredString(input.name, "name"),
    currency: readRequiredString(input.currency, "currency"),
    stockExchange: readRequiredString(input.stockExchange, "stockExchange"),
    exchangeShortName: readRequiredString(input.exchangeShortName, "exchangeShortName"),
  };
}

function normalizeQuote(input: Record<string, unknown>) {
  return compactObject({
    symbol: readRequiredString(input.symbol, "symbol"),
    name: optionalString(input.name),
    price: optionalNumber(input.price),
    change: optionalNumber(input.change),
    changesPercentage: optionalNumber(input.changesPercentage),
    dayLow: optionalNumber(input.dayLow),
    dayHigh: optionalNumber(input.dayHigh),
    yearHigh: optionalNumber(input.yearHigh),
    yearLow: optionalNumber(input.yearLow),
    marketCap: optionalNumber(input.marketCap),
    volume: optionalNumber(input.volume),
    avgVolume: optionalNumber(input.avgVolume),
    exchange: optionalString(input.exchange),
    open: optionalNumber(input.open),
    previousClose: optionalNumber(input.previousClose),
    timestamp: optionalInteger(input.timestamp),
  });
}

function normalizeHistoricalPrice(input: Record<string, unknown>) {
  return {
    date: readRequiredString(input.date, "date"),
    open: readRequiredNumber(input.open, "open"),
    high: readRequiredNumber(input.high, "high"),
    low: readRequiredNumber(input.low, "low"),
    close: readRequiredNumber(input.close, "close"),
    adjClose: readRequiredNumber(input.adjClose, "adjClose"),
    volume: readRequiredNumber(input.volume, "volume"),
  };
}

function readRequiredObject(value: unknown, fieldName: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function readRequiredArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string) {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `${fieldName} must be a string`);
  }
  return normalized;
}

function readRequiredInputString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be a number`);
  }
  return value;
}
