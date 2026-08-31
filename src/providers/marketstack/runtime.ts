import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBooleanOrNull,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const marketstackApiBaseUrl = "https://api.marketstack.com/v2";

type MarketstackActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MarketstackActionHandler = (input: Record<string, unknown>, context: MarketstackActionContext) => Promise<unknown>;
type MarketstackQueryValue = string | number | undefined;

export const marketstackActionHandlers: ProviderActionHandlers<"marketstack", MarketstackActionHandler> = {
  list_tickers(input, context) {
    return listTickers(input, context);
  },
  get_ticker_info(input, context) {
    return getTickerInfo(input, context);
  },
  get_latest_eod(input, context) {
    return getLatestEod(input, context);
  },
  get_historical_eod(input, context) {
    return getHistoricalEod(input, context);
  },
  list_exchanges(input, context) {
    return listExchanges(input, context);
  },
  list_currencies(input, context) {
    return listCurrencies(input, context);
  },
};

export async function validateMarketstackCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await marketstackGet("/currencies", { limit: 1 }, { apiKey: input.apiKey, fetcher, signal });
  const pagination = requireProviderRecord(payload.pagination, "pagination");

  return {
    profile: {
      accountId: "marketstack",
      displayName: "Marketstack API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/currencies",
      apiBaseUrl: marketstackApiBaseUrl,
      currenciesCount: optionalInteger(pagination.total),
      validationLimit: optionalInteger(pagination.limit),
    }),
  };
}

async function listTickers(input: Record<string, unknown>, context: MarketstackActionContext): Promise<unknown> {
  const payload = await marketstackGet(
    "/tickers",
    {
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      search: optionalString(input.search),
      exchange: optionalString(input.exchange),
    },
    context,
  );

  return {
    tickers: requireArray(payload.data, "data").map((item, index) =>
      normalizeTickerSummary(requireProviderRecord(item, `data[${index}]`)),
    ),
    pagination: normalizePagination(requireProviderRecord(payload.pagination, "pagination")),
  };
}

async function getTickerInfo(input: Record<string, unknown>, context: MarketstackActionContext): Promise<unknown> {
  const ticker = requiredInputString(input.ticker, "ticker");
  const payload = await marketstackGet(`/tickers/${encodeURIComponent(ticker)}`, {}, context);

  return {
    ticker: normalizeTickerInfo(readDataObject(payload)),
  };
}

async function getLatestEod(input: Record<string, unknown>, context: MarketstackActionContext): Promise<unknown> {
  const payload = await marketstackGet(
    "/eod/latest",
    {
      symbols: requiredInputString(input.symbol, "symbol"),
      exchange: optionalString(input.exchange),
    },
    context,
  );

  return {
    eod: normalizeEod(readDataObject(payload)),
  };
}

async function getHistoricalEod(input: Record<string, unknown>, context: MarketstackActionContext): Promise<unknown> {
  const payload = await marketstackGet(
    "/eod",
    {
      symbols: requiredInputString(input.symbols, "symbols"),
      exchange: optionalString(input.exchange),
      date_from: optionalString(input.dateFrom),
      date_to: optionalString(input.dateTo),
      sort: optionalString(input.sort),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
    context,
  );

  return {
    eod: requireArray(payload.data, "data").map((item, index) =>
      normalizeEod(requireProviderRecord(item, `data[${index}]`)),
    ),
    pagination: normalizePagination(requireProviderRecord(payload.pagination, "pagination")),
  };
}

async function listExchanges(input: Record<string, unknown>, context: MarketstackActionContext): Promise<unknown> {
  const payload = await marketstackGet(
    "/exchanges",
    {
      search: optionalString(input.search),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
    context,
  );

  return {
    exchanges: requireArray(payload.data, "data").map((item, index) =>
      normalizeExchange(requireProviderRecord(item, `data[${index}]`)),
    ),
    pagination: normalizePagination(requireProviderRecord(payload.pagination, "pagination")),
  };
}

async function listCurrencies(input: Record<string, unknown>, context: MarketstackActionContext): Promise<unknown> {
  const payload = await marketstackGet(
    "/currencies",
    {
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    },
    context,
  );

  return {
    currencies: requireArray(payload.data, "data").map((item, index) =>
      normalizeCurrency(requireProviderRecord(item, `data[${index}]`)),
    ),
    pagination: normalizePagination(requireProviderRecord(payload.pagination, "pagination")),
  };
}

async function marketstackGet(
  path: string,
  query: Record<string, MarketstackQueryValue>,
  context: MarketstackActionContext,
): Promise<Record<string, unknown>> {
  const url = new URL(path.replace(/^\//, ""), `${marketstackApiBaseUrl}/`);
  for (const [key, value] of Object.entries(compactObject({ ...query, access_key: context.apiKey }))) {
    url.searchParams.set(key, String(value));
  }

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
      error instanceof Error ? `Marketstack request failed: ${error.message}` : "Marketstack request failed",
      error,
    );
  }

  const payload = await readMarketstackPayload(response);
  const errorObject = optionalRecord(payload.error);
  if (!response.ok || errorObject) {
    throw buildMarketstackError(response.status, payload);
  }

  return requireProviderRecord(payload, "payload");
}

async function readMarketstackPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Marketstack returned an empty response");
  }

  try {
    return requiredRecord(JSON.parse(text) as unknown, "payload", (message) => new ProviderRequestError(502, message));
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Marketstack returned invalid JSON");
  }
}

function buildMarketstackError(status: number, payload: Record<string, unknown>): ProviderRequestError {
  const errorObject = optionalRecord(payload.error);
  const message =
    optionalString(errorObject?.message) ??
    optionalString(payload.message) ??
    `Marketstack request failed with status ${status || 502}`;

  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function readDataObject(payload: Record<string, unknown>): Record<string, unknown> {
  return optionalRecord(payload.data) ?? payload;
}

function normalizePagination(input: Record<string, unknown>): Record<string, unknown> {
  return {
    count: requiredInteger(input.count, "pagination.count"),
    limit: requiredInteger(input.limit, "pagination.limit"),
    total: requiredInteger(input.total, "pagination.total"),
    offset: requiredInteger(input.offset, "pagination.offset"),
  };
}

function normalizeTickerSummary(input: Record<string, unknown>): Record<string, unknown> {
  return {
    name: nullableString(input.name),
    ticker: nullableString(input.ticker),
    hasEod: optionalBooleanOrNull(input.has_eod),
    hasIntraday: optionalBooleanOrNull(input.has_intraday),
    stockExchange: normalizeOptionalStockExchange(optionalRecord(input.stock_exchange)),
  };
}

function normalizeTickerInfo(input: Record<string, unknown>): Record<string, unknown> {
  return {
    name: nullableString(input.name),
    ticker: nullableString(input.ticker),
    exchangeCode: nullableString(input.exchange_code),
    website: nullableString(input.website),
    sector: nullableString(input.sector),
    industry: nullableString(input.industry),
    address: normalizeOptionalAddress(optionalRecord(input.address)),
  };
}

function normalizeEod(input: Record<string, unknown>): Record<string, unknown> {
  return {
    open: nullableNumber(input.open),
    high: nullableNumber(input.high),
    low: nullableNumber(input.low),
    close: nullableNumber(input.close),
    volume: nullableNumber(input.volume),
    date: nullableString(input.date),
    symbol: nullableString(input.symbol),
    exchange: nullableString(input.exchange),
    exchangeCode: nullableString(input.exchange_code),
    name: nullableString(input.name),
    adjOpen: nullableNumber(input.adj_open),
    adjHigh: nullableNumber(input.adj_high),
    adjLow: nullableNumber(input.adj_low),
    adjClose: nullableNumber(input.adj_close),
    adjVolume: nullableNumber(input.adj_volume),
    dividend: nullableNumber(input.dividend),
    splitFactor: nullableNumber(input.split_factor),
    assetType: nullableString(input.asset_type),
    priceCurrency: nullableString(input.price_currency),
  };
}

function normalizeExchange(input: Record<string, unknown>): Record<string, unknown> {
  return {
    mic: nullableString(input.mic),
    acronym: nullableString(input.acronym),
    name: nullableString(input.name),
    city: nullableString(input.city),
    country: nullableString(input.country),
    countryCode: nullableString(input.country_code),
    currency: nullableString(input.currency),
    website: nullableString(input.website),
    exchangeStatus: nullableString(input.exchange_status),
    operatingMic: nullableString(input.operating_mic),
  };
}

function normalizeCurrency(input: Record<string, unknown>): Record<string, unknown> {
  return {
    code: nullableString(input.code),
    name: nullableString(input.name),
    symbol: nullableString(input.symbol),
    symbolNative: nullableString(input.symbol_native),
  };
}

function normalizeOptionalStockExchange(input: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!input) {
    return null;
  }

  return {
    mic: nullableString(input.mic),
    name: nullableString(input.name),
    acronym: nullableString(input.acronym),
  };
}

function normalizeOptionalAddress(input: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!input) {
    return null;
  }

  return {
    city: nullableString(input.city),
    street1: nullableString(input.street1),
    street2: nullableString(input.street2),
    postalCode: nullableString(input.postal_code),
    stateOrCountry: nullableString(input.state_or_country) ?? nullableString(input.stateOrCountry),
    stateOrCountryDescription: nullableString(input.state_or_country_description),
  };
}

function requireProviderRecord(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, message, value));
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`, value);
  }
  return value;
}

function requiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}
