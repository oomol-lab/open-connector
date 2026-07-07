import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TwelveDataActionName } from "./actions.ts";

import { compactObject } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const twelveDataApiBaseUrl: string = "https://api.twelvedata.com";

type QueryValue = string | number | boolean | undefined;
type TwelveDataRequestPhase = "validate" | "execute";
type TwelveDataActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const twelveDataActionHandlers: Record<TwelveDataActionName, TwelveDataActionHandler> = {
  symbol_search(input, context) {
    return executeSymbolSearch(input, context);
  },
  price(input, context) {
    return executePrice(input, context);
  },
  quote(input, context) {
    return executeQuote(input, context);
  },
  eod(input, context) {
    return executeEod(input, context);
  },
  time_series(input, context) {
    return executeTimeSeries(input, context);
  },
  stocks(input, context) {
    return executeStocks(input, context);
  },
  forex_pairs(input, context) {
    return executeForexPairs(input, context);
  },
  exchanges(input, context) {
    return executeExchanges(input, context);
  },
  market_state(input, context) {
    return executeMarketState(input, context);
  },
  earliest_timestamp(input, context) {
    return executeEarliestTimestamp(input, context);
  },
  profile(input, context) {
    return executeProfile(input, context);
  },
  market_movers(input, context) {
    return executeMarketMovers(input, context);
  },
};

export async function validateTwelveDataCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await twelveDataGet("/price", { symbol: "AAPL" }, { apiKey, fetcher, signal }, "validate");
  return {
    profile: {
      accountId: "twelve-data-api-key",
      displayName: "Twelve Data API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/price",
      apiBaseUrl: twelveDataApiBaseUrl,
    },
  };
}

async function executeSymbolSearch(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/symbol_search",
      compactObject({
        symbol: readRequiredInputString(input, "symbol"),
        outputsize: readOptionalInputInteger(input, "outputSize"),
        show_plan: readOptionalInputBoolean(input, "showPlan"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    data: readRequiredArray(payload.data, "data").map((item) =>
      normalizeSymbolSearchItem(readRequiredObject(item, "data[]")),
    ),
  };
}

async function executePrice(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/price",
      compactObject({
        ...requireInstrumentSelector(input),
        ...buildInstrumentFilterQuery(input),
        prepost: readOptionalInputBoolean(input, "prepost"),
        dp: readOptionalInputInteger(input, "dp"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return { price: readRequiredScalarString(payload.price, "price") };
}

async function executeQuote(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/quote",
      compactObject({
        ...requireInstrumentSelector(input),
        ...buildInstrumentFilterQuery(input),
        interval: readOptionalInputString(input, "interval"),
        volume_time_period: readOptionalInputInteger(input, "volumeTimePeriod"),
        prepost: readOptionalInputBoolean(input, "prepost"),
        eod: readOptionalInputBoolean(input, "eod"),
        rolling_period: readOptionalInputInteger(input, "rollingPeriod"),
        dp: readOptionalInputInteger(input, "dp"),
        timezone: readOptionalInputString(input, "timezone"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return normalizeQuote(payload);
}

async function executeEod(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/eod",
      compactObject({
        ...requireInstrumentSelector(input),
        ...buildInstrumentFilterQuery(input),
        date: readOptionalInputString(input, "date"),
        prepost: readOptionalInputBoolean(input, "prepost"),
        dp: readOptionalInputInteger(input, "dp"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    symbol: readRequiredString(payload.symbol, "symbol"),
    exchange: readRequiredString(payload.exchange, "exchange"),
    micCode: readOptionalString(payload.mic_code),
    currency: readOptionalString(payload.currency),
    datetime: readRequiredString(payload.datetime, "datetime"),
    close: readRequiredScalarString(payload.close, "close"),
  };
}

async function executeTimeSeries(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/time_series",
      compactObject({
        ...requireInstrumentSelector(input),
        ...buildInstrumentFilterQuery(input),
        interval: readRequiredInputString(input, "interval"),
        outputsize: readOptionalInputInteger(input, "outputSize"),
        prepost: readOptionalInputBoolean(input, "prepost"),
        dp: readOptionalInputInteger(input, "dp"),
        order: readOptionalInputString(input, "order"),
        timezone: readOptionalInputString(input, "timezone"),
        date: readOptionalInputString(input, "date"),
        start_date: readOptionalInputString(input, "startDate"),
        end_date: readOptionalInputString(input, "endDate"),
        previous_close: readOptionalInputBoolean(input, "previousClose"),
        adjust: readOptionalInputString(input, "adjust"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    meta: normalizeTimeSeriesMeta(readRequiredObject(payload.meta, "meta")),
    values: readRequiredArray(payload.values, "values").map((item) =>
      normalizeTimeSeriesValue(readRequiredObject(item, "values[]")),
    ),
  };
}

async function executeStocks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/stocks",
      compactObject({
        ...buildInstrumentQuery(input),
        ...buildInstrumentFilterQuery(input),
        cik: readOptionalInputString(input, "cik"),
        show_plan: readOptionalInputBoolean(input, "showPlan"),
        include_delisted: readOptionalInputBoolean(input, "includeDelisted"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    data: readRequiredArray(payload.data, "data").map((item) => normalizeStockItem(readRequiredObject(item, "data[]"))),
  };
}

async function executeForexPairs(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/forex_pairs",
      compactObject({
        symbol: readOptionalInputString(input, "symbol"),
        currency_base: readOptionalInputString(input, "currencyBase"),
        currency_quote: readOptionalInputString(input, "currencyQuote"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    data: readRequiredArray(payload.data, "data").map((item) =>
      normalizeForexPairItem(readRequiredObject(item, "data[]")),
    ),
  };
}

async function executeExchanges(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/exchanges",
      compactObject({
        type: readOptionalInputString(input, "type"),
        name: readOptionalInputString(input, "name"),
        code: readOptionalInputString(input, "code"),
        country: readOptionalInputString(input, "country"),
        show_plan: readOptionalInputBoolean(input, "showPlan"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    data: readRequiredArray(payload.data, "data").map((item) =>
      normalizeExchangeItem(readRequiredObject(item, "data[]")),
    ),
  };
}

async function executeMarketState(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await twelveDataGet(
    "/market_state",
    compactObject({
      exchange: readOptionalInputString(input, "exchange"),
      code: readOptionalInputString(input, "code"),
      country: readOptionalInputString(input, "country"),
    }),
    context,
    "execute",
  );
  return readRequiredArray(payload, "response").map((item) =>
    normalizeMarketStateItem(readRequiredObject(item, "response[]")),
  );
}

async function executeEarliestTimestamp(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/earliest_timestamp",
      compactObject({
        ...requireInstrumentSelector(input),
        interval: readRequiredInputString(input, "interval"),
        exchange: readOptionalInputString(input, "exchange"),
        mic_code: readOptionalInputString(input, "micCode"),
        timezone: readOptionalInputString(input, "timezone"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    datetime: readRequiredString(payload.datetime, "datetime"),
    unixTime: readRequiredInteger(payload.unix_time, "unix_time"),
  };
}

async function executeProfile(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = readRequiredObject(
    await twelveDataGet(
      "/profile",
      compactObject({
        ...requireInstrumentSelector(input),
        exchange: readOptionalInputString(input, "exchange"),
        mic_code: readOptionalInputString(input, "micCode"),
        country: readOptionalInputString(input, "country"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return normalizeProfile(payload);
}

async function executeMarketMovers(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const market = readRequiredInputString(input, "market");
  const payload = readRequiredObject(
    await twelveDataGet(
      `/market_movers/${encodeURIComponent(market)}`,
      compactObject({
        direction: readOptionalInputString(input, "direction"),
        outputsize: readOptionalInputInteger(input, "outputSize"),
        country: readOptionalInputString(input, "country"),
        price_greater_than: readOptionalInputNumber(input, "priceGreaterThan"),
        dp: readOptionalInputInteger(input, "dp"),
      }),
      context,
      "execute",
    ),
    "response",
  );
  return {
    values: readRequiredArray(payload.values, "values").map((item) =>
      normalizeMarketMoverItem(readRequiredObject(item, "values[]")),
    ),
  };
}

async function twelveDataGet(
  path: string,
  query: Record<string, QueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: TwelveDataRequestPhase,
): Promise<unknown> {
  const url = new URL(path, twelveDataApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        authorization: `apikey ${context.apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readTwelveDataPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Twelve Data request failed: ${error.message}` : "Twelve Data request failed",
    );
  }

  if (!response.ok || isTwelveDataErrorPayload(payload)) {
    throw createTwelveDataError(response, payload, phase);
  }
  return payload;
}

async function readTwelveDataPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isTwelveDataErrorPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return record.status === "error" || (record.code !== undefined && typeof record.message === "string");
}

function createTwelveDataError(
  response: Response,
  payload: unknown,
  phase: TwelveDataRequestPhase,
): ProviderRequestError {
  const statusCode = readTwelveDataStatusCode(payload) ?? response.status ?? 500;
  const message =
    readTwelveDataErrorMessage(payload) ??
    response.statusText ??
    `Twelve Data request failed with status ${statusCode}`;
  if (statusCode === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (statusCode === 401 || statusCode === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && statusCode === 401) return new ProviderRequestError(401, message, payload);
  if (statusCode === 400 || statusCode === 404 || statusCode === 414) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(statusCode, message, payload);
}

function buildInstrumentQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    symbol: readOptionalInputString(input, "symbol"),
    figi: readOptionalInputString(input, "figi"),
    isin: readOptionalInputString(input, "isin"),
    cusip: readOptionalInputString(input, "cusip"),
  };
}

function requireInstrumentSelector(input: Record<string, unknown>): Record<string, string | undefined> {
  const query = buildInstrumentQuery(input);
  if (query.symbol || query.figi || query.isin || query.cusip) return query;
  throw new ProviderRequestError(400, "At least one of symbol, figi, isin, or cusip is required.");
}

function buildInstrumentFilterQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    exchange: readOptionalInputString(input, "exchange"),
    mic_code: readOptionalInputString(input, "micCode"),
    country: readOptionalInputString(input, "country"),
    type: readOptionalInputString(input, "type"),
  };
}

function normalizeSymbolSearchItem(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    symbol: readRequiredString(record.symbol, "symbol"),
    instrumentName: readRequiredString(record.instrument_name, "instrument_name"),
    exchange: readRequiredString(record.exchange, "exchange"),
    micCode: readRequiredString(record.mic_code, "mic_code"),
    exchangeTimezone: readRequiredString(record.exchange_timezone, "exchange_timezone"),
    instrumentType: readRequiredString(record.instrument_type, "instrument_type"),
    country: readRequiredString(record.country, "country"),
    currency: readRequiredString(record.currency, "currency"),
    access: normalizeAccess(record.access),
  });
}

function normalizeQuote(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    symbol: readRequiredString(record.symbol, "symbol"),
    name: readRequiredString(record.name, "name"),
    exchange: readRequiredString(record.exchange, "exchange"),
    micCode: readOptionalString(record.mic_code),
    currency: readOptionalString(record.currency),
    datetime: readRequiredString(record.datetime, "datetime"),
    timestamp: readRequiredInteger(record.timestamp, "timestamp"),
    lastQuoteAt: readOptionalInteger(record.last_quote_at),
    open: readRequiredScalarString(record.open, "open"),
    high: readRequiredScalarString(record.high, "high"),
    low: readRequiredScalarString(record.low, "low"),
    close: readRequiredScalarString(record.close, "close"),
    volume: readOptionalScalarString(record.volume),
    previousClose: readOptionalScalarString(record.previous_close),
    change: readOptionalScalarString(record.change),
    percentChange: readOptionalScalarString(record.percent_change),
    averageVolume: readOptionalScalarString(record.average_volume),
    rolling1dChange: readOptionalScalarString(record.rolling_1d_change),
    rolling7dChange: readOptionalScalarString(record.rolling_7d_change),
    rollingChange: readOptionalScalarString(record.rolling_change),
    isMarketOpen: readOptionalBoolean(record.is_market_open),
    fiftyTwoWeek: normalizeFiftyTwoWeek(record.fifty_two_week),
    extendedChange: readOptionalScalarString(record.extended_change),
    extendedPercentChange: readOptionalScalarString(record.extended_percent_change),
    extendedPrice: readOptionalScalarString(record.extended_price),
    extendedTimestamp: readOptionalInteger(record.extended_timestamp),
  });
}

function normalizeFiftyTwoWeek(value: unknown): Record<string, unknown> | undefined {
  const record = readOptionalObject(value);
  if (!record) return undefined;
  return compactObject({
    low: readOptionalScalarString(record.low),
    high: readOptionalScalarString(record.high),
    lowChange: readOptionalScalarString(record.low_change),
    highChange: readOptionalScalarString(record.high_change),
    lowChangePercent: readOptionalScalarString(record.low_change_percent),
    highChangePercent: readOptionalScalarString(record.high_change_percent),
    range: readOptionalScalarString(record.range),
  });
}

function normalizeTimeSeriesMeta(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    symbol: readRequiredString(record.symbol, "meta.symbol"),
    interval: readRequiredString(record.interval, "meta.interval"),
    currency: readOptionalString(record.currency),
    exchangeTimezone: readOptionalString(record.exchange_timezone),
    exchange: readOptionalString(record.exchange),
    micCode: readOptionalString(record.mic_code),
    type: readOptionalString(record.type),
  });
}

function normalizeTimeSeriesValue(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    datetime: readRequiredString(record.datetime, "values[].datetime"),
    open: readRequiredScalarString(record.open, "values[].open"),
    high: readRequiredScalarString(record.high, "values[].high"),
    low: readRequiredScalarString(record.low, "values[].low"),
    close: readRequiredScalarString(record.close, "values[].close"),
    volume: readOptionalScalarString(record.volume),
    previousClose: readOptionalScalarString(record.previous_close),
  });
}

function normalizeStockItem(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    symbol: readRequiredString(record.symbol, "symbol"),
    name: readRequiredString(record.name, "name"),
    currency: readRequiredString(record.currency, "currency"),
    exchange: readRequiredString(record.exchange, "exchange"),
    micCode: readRequiredString(record.mic_code, "mic_code"),
    country: readRequiredString(record.country, "country"),
    type: readRequiredString(record.type, "type"),
    figiCode: readRequiredString(record.figi_code, "figi_code"),
    cfiCode: readRequiredString(record.cfi_code, "cfi_code"),
    isin: readOptionalString(record.isin),
    cusip: readOptionalString(record.cusip),
    access: normalizeAccess(record.access),
  });
}

function normalizeForexPairItem(record: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: readRequiredString(record.symbol, "symbol"),
    currencyGroup: readRequiredString(record.currency_group, "currency_group"),
    currencyBase: readRequiredString(record.currency_base, "currency_base"),
    currencyQuote: readRequiredString(record.currency_quote, "currency_quote"),
  };
}

function normalizeExchangeItem(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: readRequiredString(record.title, "title"),
    name: readRequiredString(record.name, "name"),
    code: readRequiredString(record.code, "code"),
    country: readRequiredString(record.country, "country"),
    timezone: readRequiredString(record.timezone, "timezone"),
    access: normalizeAccess(record.access),
  });
}

function normalizeMarketStateItem(record: Record<string, unknown>): Record<string, unknown> {
  return {
    name: readRequiredString(record.name, "name"),
    code: readRequiredString(record.code, "code"),
    country: readRequiredString(record.country, "country"),
    isMarketOpen: readRequiredBoolean(record.is_market_open, "is_market_open"),
    timeAfterOpen: readRequiredString(record.time_after_open, "time_after_open"),
    timeToOpen: readRequiredString(record.time_to_open, "time_to_open"),
    timeToClose: readRequiredString(record.time_to_close, "time_to_close"),
  };
}

function normalizeProfile(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    symbol: readRequiredString(record.symbol, "symbol"),
    name: readRequiredString(record.name, "name"),
    exchange: readRequiredString(record.exchange, "exchange"),
    micCode: readOptionalString(record.mic_code),
    sector: readOptionalString(record.sector),
    industry: readOptionalString(record.industry),
    employees: readOptionalInteger(record.employees),
    website: readOptionalString(record.website),
    description: readOptionalString(record.description),
    type: readOptionalString(record.type),
    ceo: readOptionalString(record.CEO),
    address: readOptionalString(record.address),
    address2: readOptionalString(record.address2),
    city: readOptionalString(record.city),
    zip: readOptionalString(record.zip),
    state: readOptionalString(record.state),
    country: readOptionalString(record.country),
    phone: readOptionalString(record.phone),
  });
}

function normalizeMarketMoverItem(record: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    symbol: readRequiredString(record.symbol, "symbol"),
    name: readRequiredString(record.name, "name"),
    exchange: readRequiredString(record.exchange, "exchange"),
    micCode: readOptionalString(record.mic_code),
    datetime: readRequiredString(record.datetime, "datetime"),
    last: readRequiredNumber(record.last, "last"),
    high: readRequiredNumber(record.high, "high"),
    low: readRequiredNumber(record.low, "low"),
    volume: readOptionalInteger(record.volume),
    change: readRequiredNumber(record.change, "change"),
    percentChange: readRequiredNumber(record.percent_change, "percent_change"),
  });
}

function normalizeAccess(value: unknown): Record<string, unknown> | undefined {
  const record = readOptionalObject(value);
  if (!record) return undefined;
  const global = readOptionalString(record.global);
  const plan = readOptionalString(record.plan);
  const planBusiness = readOptionalString(record.plan_business);
  return global || plan || planBusiness
    ? { global: global ?? "", plan: plan ?? "", planBusiness: planBusiness ?? "" }
    : undefined;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Twelve Data response missing object field: ${fieldName}`);
  }
  return value as Record<string, unknown>;
}

function readOptionalObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Twelve Data response missing array field: ${fieldName}`);
  }
  return value;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `Twelve Data response missing string field: ${fieldName}`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readRequiredScalarString(value: unknown, fieldName: string): string {
  const parsed = readOptionalScalarString(value);
  if (!parsed) throw new ProviderRequestError(502, `Twelve Data response missing scalar field: ${fieldName}`);
  return parsed;
}

function readOptionalScalarString(value: unknown): string | undefined {
  if (typeof value === "string" && value !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const parsed = readOptionalNumber(value);
  if (parsed === undefined)
    throw new ProviderRequestError(502, `Twelve Data response missing numeric field: ${fieldName}`);
  return parsed;
}

function readOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = readOptionalInteger(value);
  if (parsed === undefined)
    throw new ProviderRequestError(502, `Twelve Data response missing integer field: ${fieldName}`);
  return parsed;
}

function readOptionalInteger(value: unknown): number | undefined {
  const parsed = readOptionalNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean")
    throw new ProviderRequestError(502, `Twelve Data response missing boolean field: ${fieldName}`);
  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readRequiredInputString(input: Record<string, unknown>, fieldName: string): string {
  const value = readOptionalInputString(input, fieldName);
  if (!value) throw new ProviderRequestError(400, `${fieldName} is required`);
  return value;
}

function readOptionalInputString(input: Record<string, unknown>, fieldName: string): string | undefined {
  const value = input[fieldName];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readOptionalInputInteger(input: Record<string, unknown>, fieldName: string): number | undefined {
  const value = input[fieldName];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readOptionalInputNumber(input: Record<string, unknown>, fieldName: string): number | undefined {
  const value = input[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalInputBoolean(input: Record<string, unknown>, fieldName: string): boolean | undefined {
  const value = input[fieldName];
  return typeof value === "boolean" ? value : undefined;
}

function readTwelveDataStatusCode(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  return readOptionalInteger((payload as Record<string, unknown>).code);
}

function readTwelveDataErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const message = readOptionalString((payload as Record<string, unknown>).message);
  return message?.trim() || undefined;
}
