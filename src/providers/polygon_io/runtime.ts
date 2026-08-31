import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "polygon_io";
const polygonIoApiBaseUrl = "https://api.massive.com";

type PolygonIoPhase = "validate" | "execute";
type PolygonIoQueryValue = string | number | boolean | undefined;
type PolygonIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const polygonIoActionHandlers: ProviderActionHandlers<"polygon_io", PolygonIoActionHandler> = {
  async list_tickers(input, context) {
    const response = optionalRecord(
      await requestPolygonIoJson(context, "/v3/reference/tickers", {
        ticker: optionalString(input.ticker),
        type: optionalString(input.type),
        market: optionalString(input.market),
        exchange: optionalString(input.exchange),
        cusip: optionalString(input.cusip),
        cik: optionalString(input.cik),
        date: optionalString(input.date),
        search: optionalString(input.search),
        active: optionalBoolean(input.active),
        "ticker.gte": optionalString(input.tickerGte),
        "ticker.gt": optionalString(input.tickerGt),
        "ticker.lte": optionalString(input.tickerLte),
        "ticker.lt": optionalString(input.tickerLt),
        order: optionalString(input.order),
        limit: optionalIntegerString(input.limit),
        sort: optionalString(input.sort),
        cursor: optionalString(input.cursor),
      }),
    );
    return {
      meta: normalizeMeta(response),
      tickers: objectItems(response?.results).map((item) => normalizeTickerSummary(item)),
      page: normalizePage(response),
    };
  },
  async get_ticker_details(input, context) {
    const ticker = requiredInputText(input.ticker, "ticker");
    const response = optionalRecord(
      await requestPolygonIoJson(context, `/v3/reference/tickers/${encodeURIComponent(ticker)}`, {
        date: optionalString(input.date),
      }),
    );
    return {
      meta: normalizeMeta(response),
      ticker: normalizeTickerDetails(optionalRecord(response?.results)),
    };
  },
  async get_previous_day_bar(input, context) {
    const ticker = requiredInputText(input.ticker, "ticker");
    const response = optionalRecord(
      await requestPolygonIoJson(context, `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`, {
        adjusted: optionalBoolean(input.adjusted),
      }),
    );
    return normalizeAggregateResponse(response);
  },
  async get_aggregate_bars(input, context) {
    const ticker = requiredInputText(input.ticker, "ticker");
    const multiplier = requiredInteger(input.multiplier, "multiplier");
    const timespan = requiredInputText(input.timespan, "timespan");
    const from = requiredInputText(input.from, "from");
    const to = requiredInputText(input.to, "to");
    const path = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${encodeURIComponent(timespan)}/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
    const response = optionalRecord(
      await requestPolygonIoJson(context, path, {
        adjusted: optionalBoolean(input.adjusted),
        sort: optionalString(input.sort),
        limit: optionalIntegerString(input.limit),
      }),
    );
    return normalizeAggregateResponse(response);
  },
  async list_exchanges(input, context) {
    const response = optionalRecord(
      await requestPolygonIoJson(context, "/v3/reference/exchanges", {
        asset_class: optionalString(input.assetClass),
        locale: optionalString(input.locale),
      }),
    );
    return {
      meta: normalizeMeta(response),
      exchanges: normalizeExchangeList(response?.results),
    };
  },
  async list_ticker_types(input, context) {
    const response = optionalRecord(
      await requestPolygonIoJson(context, "/v3/reference/tickers/types", {
        asset_class: optionalString(input.assetClass),
        locale: optionalString(input.locale),
      }),
    );
    return {
      meta: normalizeMeta(response),
      tickerTypes: normalizeTickerTypeList(response?.results),
    };
  },
  async get_market_status(_input, context) {
    const response = optionalRecord(await requestPolygonIoJson(context, "/v1/marketstatus/now"));
    return normalizeMarketStatus(response);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, polygonIoActionHandlers);

export async function validatePolygonIoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const response = optionalRecord(
    await requestPolygonIoJson({ apiKey, fetcher }, "/v3/reference/tickers/types", { limit: 1 }, "validate"),
  );
  const firstTickerType = optionalRecord(objectItems(response?.results)[0]);
  return {
    profile: {
      accountId: "polygon-io-api-key",
      displayName: "Polygon.io API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: polygonIoApiBaseUrl,
      validationEndpoint: "/v3/reference/tickers/types",
      tickerTypeCount: optionalInteger(response?.count),
      firstTickerTypeCode: optionalString(firstTickerType?.code),
    }),
  };
}

async function requestPolygonIoJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  query: Record<string, PolygonIoQueryValue> = {},
  phase: PolygonIoPhase = "execute",
): Promise<unknown> {
  const url = new URL(path.replace(/^\//, ""), `${polygonIoApiBaseUrl}/`);
  url.searchParams.set("apiKey", context.apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
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
      error instanceof Error ? `Polygon.io request failed: ${error.message}` : "Polygon.io request failed",
    );
  }

  const payload = await readPolygonIoPayload(response);
  if (!response.ok) {
    throw createPolygonIoError(response.status, payload, phase);
  }
  if (!optionalRecord(payload) && !Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Polygon.io returned an invalid payload", payload);
  }
  return payload;
}

async function readPolygonIoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Polygon.io returned invalid JSON");
  }
}

function createPolygonIoError(status: number, payload: unknown, phase: PolygonIoPhase): ProviderRequestError {
  const message = extractPolygonIoErrorMessage(payload) ?? `Polygon.io request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractPolygonIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return record ? (optionalString(record.message) ?? optionalString(record.error)) : undefined;
}

function normalizeMeta(response: Record<string, unknown> | undefined) {
  return {
    status: optionalString(response?.status) ?? null,
    requestId: optionalString(response?.request_id) ?? null,
    count: optionalInteger(response?.count) ?? null,
  };
}

function normalizePage(response: Record<string, unknown> | undefined) {
  const nextUrl = optionalString(response?.next_url) ?? null;
  return {
    nextUrl,
    nextCursor: nextUrl ? cursorFromNextUrl(nextUrl) : null,
  };
}

function normalizeAggregateResponse(response: Record<string, unknown> | undefined) {
  return {
    meta: normalizeMeta(response),
    ticker: optionalString(response?.ticker) ?? null,
    adjusted: optionalBoolean(response?.adjusted) ?? null,
    queryCount: optionalInteger(response?.queryCount) ?? null,
    resultsCount: optionalInteger(response?.resultsCount) ?? null,
    bars: objectItems(response?.results).map((item) => normalizeAggregateBar(item)),
    page: normalizePage(response),
  };
}

function normalizeTickerSummary(input: Record<string, unknown>) {
  return {
    ticker: optionalString(input.ticker) ?? null,
    name: optionalString(input.name) ?? null,
    market: optionalString(input.market) ?? null,
    locale: optionalString(input.locale) ?? null,
    active: optionalBoolean(input.active) ?? null,
    type: optionalString(input.type) ?? null,
    currencyName: optionalString(input.currency_name) ?? null,
    currencySymbol: optionalString(input.currency_symbol) ?? null,
    baseCurrencyName: optionalString(input.base_currency_name) ?? null,
    baseCurrencySymbol: optionalString(input.base_currency_symbol) ?? null,
    cik: optionalString(input.cik) ?? null,
    compositeFigi: optionalString(input.composite_figi) ?? null,
    shareClassFigi: optionalString(input.share_class_figi) ?? null,
    primaryExchange: optionalString(input.primary_exchange) ?? null,
    lastUpdatedUtc: optionalString(input.last_updated_utc) ?? null,
    delistedUtc: optionalString(input.delisted_utc) ?? null,
    raw: input,
  };
}

function normalizeTickerDetails(input: Record<string, unknown> | undefined) {
  return {
    ticker: optionalString(input?.ticker) ?? null,
    name: optionalString(input?.name) ?? null,
    market: optionalString(input?.market) ?? null,
    locale: optionalString(input?.locale) ?? null,
    active: optionalBoolean(input?.active) ?? null,
    type: optionalString(input?.type) ?? null,
    currencyName: optionalString(input?.currency_name) ?? null,
    cik: optionalString(input?.cik) ?? null,
    compositeFigi: optionalString(input?.composite_figi) ?? null,
    shareClassFigi: optionalString(input?.share_class_figi) ?? null,
    primaryExchange: optionalString(input?.primary_exchange) ?? null,
    description: optionalString(input?.description) ?? null,
    homepageUrl: optionalString(input?.homepage_url) ?? null,
    listDate: optionalString(input?.list_date) ?? null,
    marketCap: optionalNumber(input?.market_cap) ?? null,
    phoneNumber: optionalString(input?.phone_number) ?? null,
    roundLot: optionalNumber(input?.round_lot) ?? null,
    shareClassSharesOutstanding: optionalNumber(input?.share_class_shares_outstanding) ?? null,
    sicCode: optionalString(input?.sic_code) ?? null,
    sicDescription: optionalString(input?.sic_description) ?? null,
    tickerRoot: optionalString(input?.ticker_root) ?? null,
    tickerSuffix: optionalString(input?.ticker_suffix) ?? null,
    totalEmployees: optionalNumber(input?.total_employees) ?? null,
    weightedSharesOutstanding: optionalNumber(input?.weighted_shares_outstanding) ?? null,
    address: normalizeAddress(optionalRecord(input?.address)),
    branding: normalizeBranding(optionalRecord(input?.branding)),
    raw: input ?? {},
  };
}

function normalizeAggregateBar(input: Record<string, unknown>) {
  return {
    ticker: optionalString(input.T) ?? null,
    open: optionalNumber(input.o) ?? null,
    high: optionalNumber(input.h) ?? null,
    low: optionalNumber(input.l) ?? null,
    close: optionalNumber(input.c) ?? null,
    volume: optionalNumber(input.v) ?? null,
    vwap: optionalNumber(input.vw) ?? null,
    timestamp: optionalInteger(input.t) ?? null,
    transactions: optionalInteger(input.n) ?? null,
    otc: optionalBoolean(input.otc) ?? null,
    raw: input,
  };
}

function normalizeExchangeList(value: unknown) {
  return objectItems(value).map((item) => ({
    id: optionalInteger(item.id) ?? null,
    type: optionalString(item.type) ?? null,
    assetClass: optionalString(item.asset_class) ?? null,
    locale: optionalString(item.locale) ?? null,
    name: optionalString(item.name) ?? null,
    acronym: optionalString(item.acronym) ?? null,
    mic: optionalString(item.mic) ?? null,
    operatingMic: optionalString(item.operating_mic) ?? null,
    participantId: optionalString(item.participant_id) ?? null,
    url: optionalString(item.url) ?? null,
    raw: item,
  }));
}

function normalizeTickerTypeList(value: unknown) {
  return objectItems(value).map((item) => ({
    code: optionalString(item.code) ?? null,
    description: optionalString(item.description) ?? null,
    assetClass: optionalString(item.asset_class) ?? null,
    locale: optionalString(item.locale) ?? null,
    raw: item,
  }));
}

function normalizeMarketStatus(response: Record<string, unknown> | undefined) {
  return {
    meta: normalizeMeta(response),
    market: optionalString(response?.market) ?? null,
    serverTime: optionalString(response?.serverTime) ?? null,
    afterHours: optionalBoolean(response?.afterHours) ?? null,
    earlyHours: optionalBoolean(response?.earlyHours) ?? null,
    exchanges: normalizeStatusRecord(optionalRecord(response?.exchanges)),
    currencies: normalizeStatusRecord(optionalRecord(response?.currencies)),
    indicesGroups: normalizeStatusRecord(optionalRecord(response?.indicesGroups)),
    raw: response ?? {},
  };
}

function normalizeAddress(input: Record<string, unknown> | undefined) {
  if (!input) {
    return null;
  }
  return {
    address1: optionalString(input.address1) ?? null,
    city: optionalString(input.city) ?? null,
    state: optionalString(input.state) ?? null,
    postalCode: optionalString(input.postal_code) ?? null,
  };
}

function normalizeBranding(input: Record<string, unknown> | undefined) {
  if (!input) {
    return null;
  }
  return {
    iconUrl: optionalString(input.icon_url) ?? null,
    logoUrl: optionalString(input.logo_url) ?? null,
  };
}

function normalizeStatusRecord(value: Record<string, unknown> | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!value) {
    return normalized;
  }
  for (const [key, child] of Object.entries(value)) {
    const status = optionalString(child);
    if (status) {
      normalized[key] = status;
    }
  }
  return normalized;
}

function objectItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function requiredInputText(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an integer`);
}

function optionalIntegerString(value: unknown): string | undefined {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function cursorFromNextUrl(nextUrl: string): string | null {
  try {
    return new URL(nextUrl).searchParams.get("cursor") ?? null;
  } catch {
    return null;
  }
}
