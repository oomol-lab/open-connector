import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FinageActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "finage";
const finageApiBaseUrl = "https://api.finage.co.uk";

type FinageRequestPhase = "validate" | "execute";
type FinageQueryValue = string | number | boolean | undefined;
type FinageActionContext = ApiKeyProviderContext;
type FinageActionHandler = (input: Record<string, unknown>, context: FinageActionContext) => Promise<unknown>;

export const finageActionHandlers: Record<FinageActionName, FinageActionHandler> = {
  list_stock_symbols(input, context) {
    return listStockSymbols(input, context);
  },
  get_last_quote(input, context) {
    return getLastQuote(readInputString(input.symbol, "symbol"), context, "execute");
  },
  get_last_trade(input, context) {
    return getLastTrade(readInputString(input.symbol, "symbol"), context, "execute");
  },
  get_aggregates(input, context) {
    return getAggregates(input, context);
  },
  get_previous_close(input, context) {
    return getPreviousClose(readInputString(input.symbol, "symbol"), context);
  },
  get_snapshot(input, context) {
    return getSnapshot(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, finageActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const quote = optionalRecord(
      await getLastQuote(
        "AAPL",
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        "validate",
      ),
    );

    return {
      profile: {
        accountId: "finage",
        displayName: "Finage API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/last/stock/AAPL",
        apiBaseUrl: finageApiBaseUrl,
        symbol: optionalString(quote?.symbol),
      }),
    };
  },
};

async function listStockSymbols(input: Record<string, unknown>, context: FinageActionContext): Promise<unknown> {
  const payload = await finageGet(
    "/symbol-list/us-stock",
    {
      page: optionalInteger(input.page),
      search: optionalString(input.search),
    },
    context,
    "execute",
  );

  return {
    page: readRequiredInteger(payload.page, "page"),
    symbols: objectArray(payload.symbols, "symbols", providerError).map(normalizeSymbol),
  };
}

async function getLastQuote(symbol: string, context: FinageActionContext, phase: FinageRequestPhase): Promise<unknown> {
  const payload = await finageGet(`/last/stock/${encodeURIComponent(symbol)}`, {}, context, phase);
  return normalizeQuote(payload);
}

async function getLastTrade(symbol: string, context: FinageActionContext, phase: FinageRequestPhase): Promise<unknown> {
  const payload = await finageGet(`/last/trade/stock/${encodeURIComponent(symbol)}`, {}, context, phase);
  return normalizeTrade(payload);
}

async function getAggregates(input: Record<string, unknown>, context: FinageActionContext): Promise<unknown> {
  const symbol = readInputString(input.symbol, "symbol");
  const multiplier = readRequiredInputInteger(input.multiplier, "multiplier");
  const timespan = readInputString(input.timespan, "timespan");
  const dateFrom = readInputString(input.dateFrom, "dateFrom");
  const dateTo = readInputString(input.dateTo, "dateTo");
  if (dateFrom > dateTo) {
    throw new ProviderRequestError(400, "dateTo must be greater than or equal to dateFrom");
  }

  const payload = await finageGet(
    `/agg/stock/${encodeURIComponent(symbol)}/${encodeURIComponent(multiplier)}/${encodeURIComponent(timespan)}/${encodeURIComponent(dateFrom)}/${encodeURIComponent(dateTo)}`,
    {
      limit: optionalInteger(input.limit),
      sort: optionalString(input.sort),
    },
    context,
    "execute",
  );

  return normalizeAggregateResponse(payload);
}

async function getPreviousClose(symbol: string, context: FinageActionContext): Promise<unknown> {
  const payload = await finageGet(`/agg/stock/prev-close/${encodeURIComponent(symbol)}`, {}, context, "execute");
  return normalizeAggregateResponse(payload);
}

async function getSnapshot(input: Record<string, unknown>, context: FinageActionContext): Promise<unknown> {
  const symbols = stringArray(input.symbols, "symbols", (message) => new ProviderRequestError(400, message)).map(
    (value, index) => readInputString(value, `symbols[${index}]`),
  );
  if (symbols.length === 0) {
    throw new ProviderRequestError(400, "symbols must be a non-empty string array");
  }
  const includeQuotes = optionalBoolean(input.includeQuotes) ?? true;
  const includeTrades = optionalBoolean(input.includeTrades) ?? false;
  if (!includeQuotes && !includeTrades) {
    throw new ProviderRequestError(400, "at least one of includeQuotes or includeTrades must be enabled");
  }

  const payload = await finageGet(
    "/snapshot/stock",
    {
      quotes: includeQuotes,
      trades: includeTrades,
      symbols: symbols.join(","),
    },
    context,
    "execute",
  );

  return {
    totalResults: readRequiredInteger(payload.totalResults, "totalResults"),
    lastQuotes: includeQuotes
      ? objectArray(payload.lastQuotes, "lastQuotes", providerError).map(normalizeSnapshotQuote)
      : [],
    lastTrades: includeTrades
      ? objectArray(payload.lastTrades, "lastTrades", providerError).map(normalizeSnapshotTrade)
      : [],
  };
}

async function finageGet(
  path: string,
  query: Record<string, FinageQueryValue>,
  context: FinageActionContext,
  phase: FinageRequestPhase,
): Promise<Record<string, unknown>> {
  const url = buildFinageUrl(path, query, context.apiKey);

  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    const payload = await readFinagePayload(response);
    if (!response.ok || isFinageErrorPayload(payload)) {
      throw buildFinageError(phase, response.status, payload);
    }
    return readRequiredObject(payload, "payload");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Finage request failed: ${error.message}` : "Finage request failed",
    );
  }
}

function buildFinageUrl(path: string, query: Record<string, FinageQueryValue>, apiKey: string): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${finageApiBaseUrl}/`);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readFinagePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Finage returned an empty response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Finage returned invalid JSON");
  }
}

function isFinageErrorPayload(payload: unknown): boolean {
  const record = optionalRecord(payload);
  if (!record) {
    return false;
  }

  return (
    optionalString(record.error) !== undefined ||
    optionalString(record.message) !== undefined ||
    optionalString(record.status) === "error"
  );
}

function buildFinageError(phase: FinageRequestPhase, status: number, payload: unknown): ProviderRequestError {
  const message = extractFinageErrorMessage(payload) ?? `Finage request failed with status ${status || 502}`;

  if (status === 429 || looksLikeRateLimitMessage(message)) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 401 || status === 403 || looksLikeCredentialMessage(message)) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (status === 400 || status === 404 || status === 422 || status === 0) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status >= 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 400 ? status : 502, message, payload);
}

function extractFinageErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function looksLikeRateLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("too many") || normalized.includes("rate limit") || normalized.includes("limit exceeded");
}

function looksLikeCredentialMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("api key") ||
    normalized.includes("apikey") ||
    normalized.includes("permission") ||
    normalized.includes("unauthorized")
  );
}

function normalizeSymbol(input: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: readRequiredString(input.symbol, "symbols[].symbol"),
    name: readRequiredString(input.name, "symbols[].name"),
  };
}

function normalizeQuote(input: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: readRequiredString(input.symbol, "symbol"),
    ask: readRequiredNumber(input.ask, "ask"),
    bid: readRequiredNumber(input.bid, "bid"),
    askSize: readRequiredInteger(input.asize, "asize"),
    bidSize: readRequiredInteger(input.bsize, "bsize"),
    timestamp: readRequiredInteger(input.timestamp, "timestamp"),
  };
}

function normalizeTrade(input: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: readRequiredString(input.symbol, "symbol"),
    price: readRequiredNumber(input.price, "price"),
    tradeSize: readRequiredInteger(input.size, "size"),
    timestamp: readRequiredInteger(input.timestamp, "timestamp"),
  };
}

function normalizeAggregateResponse(input: Record<string, unknown>): Record<string, unknown> {
  const results = objectArray(input.results, "results", providerError).map(normalizeAggregateBar);

  return {
    symbol: readRequiredString(input.symbol, "symbol"),
    totalResults: optionalInteger(input.totalResults) ?? results.length,
    results,
  };
}

function normalizeAggregateBar(input: Record<string, unknown>): Record<string, unknown> {
  return {
    open: readRequiredNumber(input.o, "o"),
    high: readRequiredNumber(input.h, "h"),
    low: readRequiredNumber(input.l, "l"),
    close: readRequiredNumber(input.c, "c"),
    volume: readRequiredNumber(input.v, "v"),
    timestamp: readRequiredInteger(input.t, "t"),
  };
}

function normalizeSnapshotQuote(input: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: readRequiredString(input.s, "s"),
    ask: readRequiredNumber(input.a, "a"),
    bid: readRequiredNumber(input.b, "b"),
    askSize: readRequiredInteger(input.asz, "asz"),
    bidSize: readRequiredInteger(input.bsz, "bsz"),
    timestamp: readRequiredInteger(input.t, "t"),
  };
}

function normalizeSnapshotTrade(input: Record<string, unknown>): Record<string, unknown> {
  return {
    symbol: readRequiredString(input.s, "s"),
    price: readRequiredNumber(input.p, "p"),
    tradeSize: readRequiredInteger(input.sz, "sz"),
    timestamp: readRequiredInteger(input.t, "t"),
  };
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new ProviderRequestError(502, `${fieldName} must be a string`);
  }
  return normalized;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be a number`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value;
}

function readRequiredInputInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return value;
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
