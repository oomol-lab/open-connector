import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const alphaVantageApiBaseUrl = "https://www.alphavantage.co";

type QueryValue = string | number | boolean | undefined;
type AlphaVantageRequestPhase = "validate" | "execute";
type AlphaVantageSeriesType = "daily" | "weekly" | "monthly";
type AlphaVantageResponseFormat = "json" | "text";
type AlphaVantageActionContext = {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
};
type AlphaVantageActionHandler = (
  input: Record<string, unknown>,
  context: AlphaVantageActionContext,
) => Promise<unknown>;

export const alphaVantageActionHandlers: Record<string, AlphaVantageActionHandler> = {
  search_symbols(input, context) {
    return executeSearchSymbols(input, context);
  },
  get_global_quote(input, context) {
    return executeGlobalQuote(input, context);
  },
  get_daily_time_series(input, context) {
    return executeTimeSeries(input, context, {
      functionName: "TIME_SERIES_DAILY",
      seriesType: "daily",
      seriesKey: "Time Series (Daily)",
    });
  },
  get_weekly_time_series(input, context) {
    return executeTimeSeries(input, context, {
      functionName: "TIME_SERIES_WEEKLY",
      seriesType: "weekly",
      seriesKey: "Weekly Time Series",
    });
  },
  get_monthly_time_series(input, context) {
    return executeTimeSeries(input, context, {
      functionName: "TIME_SERIES_MONTHLY",
      seriesType: "monthly",
      seriesKey: "Monthly Time Series",
    });
  },
  get_intraday_time_series(input, context) {
    return executeRawFunction(
      "TIME_SERIES_INTRADAY",
      {
        symbol: readRequiredInputString(input, "symbol"),
        interval: readRequiredInputString(input, "interval"),
        adjusted: readOptionalInputBoolean(input, "adjusted"),
        extended_hours: readOptionalInputBoolean(input, "extendedHours"),
        month: readOptionalInputString(input, "month"),
        outputsize: readOptionalInputString(input, "outputSize"),
        datatype: readOptionalInputString(input, "datatype"),
      },
      context,
    );
  },
  get_daily_adjusted_time_series(input, context) {
    return executeRawFunction(
      "TIME_SERIES_DAILY_ADJUSTED",
      {
        symbol: readRequiredInputString(input, "symbol"),
        outputsize: readOptionalInputString(input, "outputSize"),
        datatype: readOptionalInputString(input, "datatype"),
      },
      context,
    );
  },
  get_weekly_adjusted_time_series(input, context) {
    return executeRawFunction(
      "TIME_SERIES_WEEKLY_ADJUSTED",
      { symbol: readRequiredInputString(input, "symbol") },
      context,
    );
  },
  get_monthly_adjusted_time_series(input, context) {
    return executeRawFunction(
      "TIME_SERIES_MONTHLY_ADJUSTED",
      { symbol: readRequiredInputString(input, "symbol") },
      context,
    );
  },
  get_realtime_bulk_quotes(input, context) {
    return executeRawFunction(
      "REALTIME_BULK_QUOTES",
      { symbol: readRequiredInputString(input, "symbols") },
      context,
    );
  },
  get_top_gainers_losers(_input, context) {
    return executeRawFunction("TOP_GAINERS_LOSERS", {}, context);
  },
  get_market_status(_input, context) {
    return executeMarketStatus(context);
  },
  get_currency_exchange_rate(input, context) {
    return executeRawFunction(
      "CURRENCY_EXCHANGE_RATE",
      {
        from_currency: readRequiredInputString(input, "fromSymbol"),
        to_currency: readRequiredInputString(input, "toSymbol"),
      },
      context,
    );
  },
  get_fx_intraday(input, context) {
    return executeRawFunction(
      "FX_INTRADAY",
      {
        from_symbol: readRequiredInputString(input, "fromSymbol"),
        to_symbol: readRequiredInputString(input, "toSymbol"),
        interval: readRequiredInputString(input, "interval"),
        outputsize: readOptionalInputString(input, "outputSize"),
        datatype: readOptionalInputString(input, "datatype"),
      },
      context,
    );
  },
  get_fx_daily(input, context) {
    return executeRawFunction(
      "FX_DAILY",
      {
        from_symbol: readRequiredInputString(input, "fromSymbol"),
        to_symbol: readRequiredInputString(input, "toSymbol"),
        outputsize: readOptionalInputString(input, "outputSize"),
        datatype: readOptionalInputString(input, "datatype"),
      },
      context,
    );
  },
  get_fx_weekly(input, context) {
    return executeRawFunction(
      "FX_WEEKLY",
      {
        from_symbol: readRequiredInputString(input, "fromSymbol"),
        to_symbol: readRequiredInputString(input, "toSymbol"),
      },
      context,
    );
  },
  get_fx_monthly(input, context) {
    return executeRawFunction(
      "FX_MONTHLY",
      {
        from_symbol: readRequiredInputString(input, "fromSymbol"),
        to_symbol: readRequiredInputString(input, "toSymbol"),
      },
      context,
    );
  },
  get_crypto_intraday(input, context) {
    return executeRawFunction(
      "CRYPTO_INTRADAY",
      {
        symbol: readRequiredInputString(input, "symbol"),
        market: readRequiredInputString(input, "market"),
        interval: readRequiredInputString(input, "interval"),
      },
      context,
    );
  },
  get_digital_currency_daily(input, context) {
    return executeDigitalCurrency("DIGITAL_CURRENCY_DAILY", input, context);
  },
  get_digital_currency_weekly(input, context) {
    return executeDigitalCurrency("DIGITAL_CURRENCY_WEEKLY", input, context);
  },
  get_digital_currency_monthly(input, context) {
    return executeDigitalCurrency("DIGITAL_CURRENCY_MONTHLY", input, context);
  },
  get_company_overview(input, context) {
    return executeStockSymbolFunction("OVERVIEW", input, context);
  },
  get_etf_profile(input, context) {
    return executeStockSymbolFunction("ETF_PROFILE", input, context);
  },
  get_income_statement(input, context) {
    return executeStockSymbolFunction("INCOME_STATEMENT", input, context);
  },
  get_balance_sheet(input, context) {
    return executeStockSymbolFunction("BALANCE_SHEET", input, context);
  },
  get_cash_flow(input, context) {
    return executeStockSymbolFunction("CASH_FLOW", input, context);
  },
  get_earnings(input, context) {
    return executeStockSymbolFunction("EARNINGS", input, context);
  },
  get_earnings_estimates(input, context) {
    return executeStockSymbolFunction("EARNINGS_ESTIMATES", input, context);
  },
  get_listing_status(input, context) {
    return executeRawFunction(
      "LISTING_STATUS",
      {
        date: readOptionalInputString(input, "date"),
        state: readOptionalInputString(input, "state"),
      },
      context,
      "text",
    );
  },
  get_earnings_calendar(input, context) {
    return executeRawFunction(
      "EARNINGS_CALENDAR",
      {
        symbol: readOptionalInputString(input, "symbol"),
        horizon: readOptionalInputString(input, "horizon"),
      },
      context,
      "text",
    );
  },
  get_ipo_calendar(_input, context) {
    return executeRawFunction("IPO_CALENDAR", {}, context, "text");
  },
  get_dividends(input, context) {
    return executeStockSymbolFunction("DIVIDENDS", input, context);
  },
  get_splits(input, context) {
    return executeStockSymbolFunction("SPLITS", input, context);
  },
  get_insider_transactions(input, context) {
    return executeStockSymbolFunction("INSIDER_TRANSACTIONS", input, context);
  },
  get_institutional_holdings(input, context) {
    return executeStockSymbolFunction("INSTITUTIONAL_HOLDINGS", input, context);
  },
  get_earnings_call_transcript(input, context) {
    return executeRawFunction(
      "EARNINGS_CALL_TRANSCRIPT",
      {
        symbol: readRequiredInputString(input, "symbol"),
        quarter: readRequiredInputString(input, "quarter"),
        year: readRequiredInputNumber(input, "fiscalYear"),
      },
      context,
    );
  },
  get_historical_options(input, context) {
    return executeRawFunction(
      "HISTORICAL_OPTIONS",
      {
        symbol: readRequiredInputString(input, "symbol"),
        date: readOptionalInputString(input, "date"),
      },
      context,
    );
  },
  get_realtime_options(input, context) {
    return executeRawFunction(
      "REALTIME_OPTIONS",
      {
        symbol: readRequiredInputString(input, "symbol"),
        require_greeks: readOptionalInputBoolean(input, "requireGreeks"),
        contract: readOptionalInputString(input, "contract"),
      },
      context,
    );
  },
  get_news_sentiment(input, context) {
    return executeRawFunction(
      "NEWS_SENTIMENT",
      {
        tickers: readOptionalInputString(input, "tickers"),
        topics: readOptionalInputString(input, "topics"),
        time_from: readOptionalInputString(input, "timeFrom"),
        time_to: readOptionalInputString(input, "timeTo"),
        sort: readOptionalInputString(input, "sort"),
        limit: readOptionalInputNumber(input, "limit"),
      },
      context,
    );
  },
  get_sector_performance(_input, context) {
    return executeRawFunction("SECTOR", {}, context);
  },
  get_commodity_data(input, context) {
    return executeRawFunction(
      readRequiredInputString(input, "commodity"),
      {
        interval: readOptionalInputString(input, "interval"),
        datatype: readOptionalInputString(input, "datatype"),
      },
      context,
    );
  },
  get_macro_indicator(input, context) {
    return executeRawFunction(
      readRequiredInputString(input, "indicator"),
      {
        interval: readOptionalInputString(input, "interval"),
        maturity: readOptionalInputString(input, "maturity"),
        datatype: readOptionalInputString(input, "datatype"),
      },
      context,
    );
  },
  get_technical_indicator(input, context) {
    return executeRawFunction(
      readRequiredInputString(input, "indicator"),
      {
        symbol: readRequiredInputString(input, "symbol"),
        interval: readRequiredInputString(input, "interval"),
        time_period: readOptionalInputNumber(input, "timePeriod"),
        series_type: readOptionalInputString(input, "seriesType"),
        month: readOptionalInputString(input, "month"),
        fastperiod: readOptionalInputNumber(input, "fastPeriod"),
        slowperiod: readOptionalInputNumber(input, "slowPeriod"),
        signalperiod: readOptionalInputNumber(input, "signalPeriod"),
        fastkperiod: readOptionalInputNumber(input, "fastKPeriod"),
        slowkperiod: readOptionalInputNumber(input, "slowKPeriod"),
        slowdperiod: readOptionalInputNumber(input, "slowDPeriod"),
        slowkmatype: readOptionalInputNumber(input, "slowKMatype"),
        slowdmatype: readOptionalInputNumber(input, "slowDMatype"),
        fastdperiod: readOptionalInputNumber(input, "fastDPeriod"),
        fastdmatype: readOptionalInputNumber(input, "fastDMatype"),
        fastmatype: readOptionalInputNumber(input, "fastMatype"),
        slowmatype: readOptionalInputNumber(input, "slowMatype"),
        signalmatype: readOptionalInputNumber(input, "signalMatype"),
        matype: readOptionalInputNumber(input, "matype"),
        nbdevup: readOptionalInputNumber(input, "nbdevup"),
        nbdevdn: readOptionalInputNumber(input, "nbdevdn"),
        acceleration: readOptionalInputNumber(input, "acceleration"),
        maximum: readOptionalInputNumber(input, "maximum"),
        datatype: readOptionalInputString(input, "datatype"),
      },
      context,
    );
  },
  call_official_function(input, context) {
    return executeRawFunction(
      readRequiredInputString(input, "functionName"),
      readParametersInput(input),
      context,
      readOptionalInputString(input, "responseFormat") === "text" ? "text" : "json",
    );
  },
};

export async function validateAlphaVantageCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredInputString({ apiKey: input.apiKey }, "apiKey");
  await alphaVantageQuery("MARKET_STATUS", {}, apiKey, fetcher, "validate", "json", signal);

  return {
    profile: {
      accountId: "alpha_vantage_api_key",
      displayName: "Alpha Vantage API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: alphaVantageApiBaseUrl,
      validationEndpoint: "/query",
      validationFunction: "MARKET_STATUS",
    },
  };
}

async function executeSearchSymbols(
  input: Record<string, unknown>,
  context: AlphaVantageActionContext,
) {
  const payload = readRequiredObject(
    await alphaVantageQuery(
      "SYMBOL_SEARCH",
      {
        keywords: readRequiredInputString(input, "keywords"),
      },
      context.apiKey,
      context.fetcher,
      "execute",
      "json",
      context.signal,
    ),
    "response",
  );

  const bestMatches = readOptionalArray(payload.bestMatches) ?? [];
  return {
    matches: bestMatches.map((item, index) =>
      normalizeSymbolSearchMatch(readRequiredObject(item, `bestMatches[${index}]`)),
    ),
  };
}

async function executeGlobalQuote(
  input: Record<string, unknown>,
  context: AlphaVantageActionContext,
) {
  const payload = readRequiredObject(
    await alphaVantageQuery(
      "GLOBAL_QUOTE",
      {
        symbol: readRequiredInputString(input, "symbol"),
      },
      context.apiKey,
      context.fetcher,
      "execute",
      "json",
      context.signal,
    ),
    "response",
  );
  const quote = readRequiredObject(payload["Global Quote"], "Global Quote");
  if (Object.keys(quote).length === 0) {
    throw new ProviderRequestError(
      400,
      "Alpha Vantage returned an empty global quote for the requested symbol",
    );
  }

  return normalizeGlobalQuote(quote);
}

async function executeTimeSeries(
  input: Record<string, unknown>,
  context: AlphaVantageActionContext,
  seriesDefinition: {
    functionName: string;
    seriesType: AlphaVantageSeriesType;
    seriesKey: string;
  },
) {
  const payload = readRequiredObject(
    await alphaVantageQuery(
      seriesDefinition.functionName,
      compactObject({
        symbol: readRequiredInputString(input, "symbol"),
        outputsize:
          seriesDefinition.seriesType === "daily"
            ? readOptionalInputString(input, "outputSize")
            : undefined,
      }),
      context.apiKey,
      context.fetcher,
      "execute",
      "json",
      context.signal,
    ),
    "response",
  );
  const meta = readRequiredObject(payload["Meta Data"], "Meta Data");
  const series = readRequiredObject(
    payload[seriesDefinition.seriesKey],
    seriesDefinition.seriesKey,
  );

  return {
    meta: normalizeTimeSeriesMeta(meta, seriesDefinition.seriesType),
    values: Object.entries(series).map(([timestamp, value]) =>
      normalizeTimeSeriesValue(
        timestamp,
        readRequiredObject(value, `${seriesDefinition.seriesKey}.${timestamp}`),
      ),
    ),
  };
}

async function executeMarketStatus(context: AlphaVantageActionContext) {
  const payload = readRequiredObject(
    await alphaVantageQuery("MARKET_STATUS", {}, context.apiKey, context.fetcher, "execute", "json", context.signal),
    "response",
  );

  return {
    endpoint: readRequiredString(payload.endpoint, "endpoint"),
    markets: readRequiredArray(payload.markets, "markets").map((item, index) =>
      normalizeMarketStatus(readRequiredObject(item, `markets[${index}]`)),
    ),
  };
}

async function executeDigitalCurrency(
  functionName: string,
  input: Record<string, unknown>,
  context: AlphaVantageActionContext,
) {
  return executeRawFunction(
    functionName,
    {
      symbol: readRequiredInputString(input, "symbol"),
      market: readRequiredInputString(input, "market"),
    },
    context,
  );
}

async function executeStockSymbolFunction(
  functionName: string,
  input: Record<string, unknown>,
  context: AlphaVantageActionContext,
) {
  return executeRawFunction(
    functionName,
    { symbol: readRequiredInputString(input, "symbol") },
    context,
  );
}

async function executeRawFunction(
  functionName: string,
  query: Record<string, QueryValue>,
  context: AlphaVantageActionContext,
  responseFormat: AlphaVantageResponseFormat = "json",
) {
  const resolvedResponseFormat =
    responseFormat === "json" && query.datatype === "csv" ? "text" : responseFormat;
  const data = await alphaVantageQuery(
    functionName,
    query,
    context.apiKey,
    context.fetcher,
    "execute",
    resolvedResponseFormat,
    context.signal,
  );

  return { data };
}

async function alphaVantageQuery(
  functionName: string,
  query: Record<string, QueryValue>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: AlphaVantageRequestPhase,
  responseFormat: AlphaVantageResponseFormat = "json",
  signal?: AbortSignal,
) {
  const url = new URL("/query", alphaVantageApiBaseUrl);
  for (const [key, value] of Object.entries(compactObject({ function: functionName, ...query }))) {
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("apikey", apiKey);

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    payload = await readAlphaVantagePayload(response, responseFormat);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Alpha Vantage request failed: ${error.message}`
        : "Alpha Vantage request failed",
    );
  }

  if (!response.ok || hasAlphaVantageError(payload)) {
    throw createAlphaVantageError(response, payload, phase);
  }

  return payload;
}

async function readAlphaVantagePayload(
  response: Response,
  responseFormat: AlphaVantageResponseFormat,
) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  if (responseFormat === "text") {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function hasAlphaVantageError(payload: unknown) {
  return extractAlphaVantageErrorMessage(payload) !== undefined;
}

function extractAlphaVantageErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    if (typeof payload !== "string") {
      return undefined;
    }

    const text = payload.trim();
    if (!text) {
      return undefined;
    }

    return isAlphaVantageTextError(text) ? text : undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["Error Message", "Information", "Note"]) {
    const message = readOptionalString(record[key]);
    if (message) {
      return message;
    }
  }

  return undefined;
}

function isAlphaVantageTextError(text: string) {
  const loweredText = text.toLowerCase();
  return (
    loweredText.includes("thank you for using alpha vantage") ||
    loweredText.includes("api call frequency") ||
    loweredText.includes("rate limit") ||
    loweredText.includes("invalid api call") ||
    loweredText.includes("apikey is invalid or missing")
  );
}

function createAlphaVantageError(
  response: Response,
  payload: unknown,
  phase: AlphaVantageRequestPhase,
) {
  const message =
    extractAlphaVantageErrorMessage(payload) ??
    response.statusText ??
    "Alpha Vantage request failed";
  const loweredMessage = message.toLowerCase();

  if (
    response.status === 429 ||
    loweredMessage.includes("higher api call frequency") ||
    loweredMessage.includes("api call frequency") ||
    loweredMessage.includes("free api requests") ||
    loweredMessage.includes("request per second") ||
    loweredMessage.includes("rate limit") ||
    loweredMessage.includes("please query the demo urls at no more than 2 requests per second")
  ) {
    return new ProviderRequestError(429, message);
  }

  if (loweredMessage.includes("apikey is invalid or missing")) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (loweredMessage.includes("invalid api call")) {
    return new ProviderRequestError(400, message);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  return new ProviderRequestError(response.ok ? 502 : response.status || 502, message);
}

function normalizeSymbolSearchMatch(record: Record<string, unknown>) {
  return {
    symbol: readRequiredString(record["1. symbol"], "1. symbol"),
    name: readRequiredString(record["2. name"], "2. name"),
    type: readRequiredString(record["3. type"], "3. type"),
    region: readRequiredString(record["4. region"], "4. region"),
    marketOpen: readRequiredString(record["5. marketOpen"], "5. marketOpen"),
    marketClose: readRequiredString(record["6. marketClose"], "6. marketClose"),
    timezone: readRequiredString(record["7. timezone"], "7. timezone"),
    currency: readRequiredString(record["8. currency"], "8. currency"),
    matchScore: readRequiredString(record["9. matchScore"], "9. matchScore"),
  };
}

function normalizeGlobalQuote(record: Record<string, unknown>) {
  return {
    symbol: readRequiredString(record["01. symbol"], "01. symbol"),
    open: readRequiredString(record["02. open"], "02. open"),
    high: readRequiredString(record["03. high"], "03. high"),
    low: readRequiredString(record["04. low"], "04. low"),
    price: readRequiredString(record["05. price"], "05. price"),
    volume: readRequiredString(record["06. volume"], "06. volume"),
    latestTradingDay: readRequiredString(
      record["07. latest trading day"],
      "07. latest trading day",
    ),
    previousClose: readRequiredString(record["08. previous close"], "08. previous close"),
    change: readRequiredString(record["09. change"], "09. change"),
    changePercent: readRequiredString(record["10. change percent"], "10. change percent"),
  };
}

function normalizeTimeSeriesMeta(
  record: Record<string, unknown>,
  seriesType: AlphaVantageSeriesType,
) {
  if (seriesType === "daily") {
    return {
      seriesType,
      information: readRequiredString(record["1. Information"], "Meta Data.1. Information"),
      symbol: readRequiredString(record["2. Symbol"], "Meta Data.2. Symbol"),
      lastRefreshed: readRequiredString(record["3. Last Refreshed"], "Meta Data.3. Last Refreshed"),
      outputSize: readRequiredString(record["4. Output Size"], "Meta Data.4. Output Size"),
      timeZone: readRequiredString(record["5. Time Zone"], "Meta Data.5. Time Zone"),
    };
  }

  return {
    seriesType,
    information: readRequiredString(record["1. Information"], "Meta Data.1. Information"),
    symbol: readRequiredString(record["2. Symbol"], "Meta Data.2. Symbol"),
    lastRefreshed: readRequiredString(record["3. Last Refreshed"], "Meta Data.3. Last Refreshed"),
    timeZone: readRequiredString(record["4. Time Zone"], "Meta Data.4. Time Zone"),
  };
}

function normalizeTimeSeriesValue(timestamp: string, record: Record<string, unknown>) {
  return {
    timestamp,
    open: readRequiredString(record["1. open"], "1. open"),
    high: readRequiredString(record["2. high"], "2. high"),
    low: readRequiredString(record["3. low"], "3. low"),
    close: readRequiredString(record["4. close"], "4. close"),
    volume: readRequiredString(record["5. volume"], "5. volume"),
  };
}

function normalizeMarketStatus(record: Record<string, unknown>) {
  return {
    marketType: readRequiredString(record.market_type, "market_type"),
    region: readRequiredString(record.region, "region"),
    primaryExchanges: readRequiredString(record.primary_exchanges, "primary_exchanges"),
    localOpen: readRequiredString(record.local_open, "local_open"),
    localClose: readRequiredString(record.local_close, "local_close"),
    currentStatus: readRequiredString(record.current_status, "current_status"),
    notes: readStringAllowEmpty(record.notes, "notes"),
  };
}

function readRequiredInputString(input: Record<string, unknown>, key: string) {
  const value = readOptionalInputString(input, key);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function readOptionalInputString(input: Record<string, unknown>, key: string) {
  return readOptionalString(input[key])?.trim() || undefined;
}

function readRequiredInputNumber(input: Record<string, unknown>, key: string) {
  const value = readOptionalInputNumber(input, key);
  if (value === undefined) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function readOptionalInputNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalInputBoolean(input: Record<string, unknown>, key: string) {
  return typeof input[key] === "boolean" ? input[key] : undefined;
}

function readParametersInput(input: Record<string, unknown>) {
  const parameters = input.parameters;
  if (parameters === undefined) {
    return {};
  }

  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    throw new ProviderRequestError(400, "parameters must be an object");
  }

  return Object.fromEntries(
    Object.entries(parameters as Record<string, unknown>).flatMap(([key, value]) => {
      if (key === "function" || key === "apikey" || value === null || value === undefined) {
        return [];
      }

      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return [[key, value] as const];
      }

      throw new ProviderRequestError(
        400,
        `parameters.${key} must be a string, number, boolean, or null`,
      );
    }),
  );
}

function readRequiredObject(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readRequiredArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value;
}

function readOptionalArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = readOptionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return text;
}

function readStringAllowEmpty(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `${fieldName} must be a string`);
  }
  return value;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
