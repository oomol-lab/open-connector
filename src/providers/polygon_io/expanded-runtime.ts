import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringArray,
} from "../../core/cast.ts";
import { providerInputError, requiredInputString } from "../provider-runtime.ts";
import { expandedPolygonIoActions } from "./expanded-actions.ts";

type RequestMassiveJson = (input: {
  path: string;
  apiKey: string;
  query: Record<string, string | number | boolean | undefined>;
  fetcher: typeof fetch;
  phase: "execute";
}) => Promise<unknown>;

export const expandedPolygonIoActionNames: ReadonlySet<string> = new Set(
  expandedPolygonIoActions.map((action) => action.name),
);

export async function executeExpandedPolygonIoAction(input: {
  actionName: string;
  input: Record<string, unknown>;
  fetcher: typeof fetch;
  apiKey: string;
  requestJson: RequestMassiveJson;
}): Promise<unknown> {
  const request = resolveRequest(input.actionName, input.input);
  const payload = await input.requestJson({
    ...request,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    phase: "execute",
  });
  if (request.mode === "list") {
    return normalizeList(payload);
  }
  if (request.mode === "pagedResult") {
    return { ...normalizeResult(payload), page: normalizePage(optionalRecord(payload)) };
  }
  return normalizeResult(payload);
}

function resolveRequest(actionName: string, input: Record<string, unknown>) {
  const ticker = () => encodeURIComponent(requiredInputString(input.ticker, "ticker"));
  const underlyingTicker = () => encodeURIComponent(requiredInputString(input.underlyingTicker, "underlyingTicker"));
  const optionsTicker = () => encodeURIComponent(requiredInputString(input.optionsTicker, "optionsTicker"));
  const list = (path: string, query: Record<string, string | number | boolean | undefined> = {}) => ({
    path,
    query,
    mode: "list" as const,
  });
  const result = (path: string, query: Record<string, string | number | boolean | undefined> = {}) => ({
    path,
    query,
    mode: "result" as const,
  });
  const pagedResult = (path: string, query: Record<string, string | number | boolean | undefined> = {}) => ({
    path,
    query,
    mode: "pagedResult" as const,
  });

  switch (actionName) {
    case "list_related_tickers":
      return list(`/v1/related-companies/${ticker()}`);
    case "get_daily_open_close":
      return result(`/v1/open-close/${ticker()}/${encodeURIComponent(requiredInputString(input.date, "date"))}`, {
        adjusted: optionalBoolean(input.adjusted),
      });
    case "get_stock_snapshot":
      return result(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker()}`);
    case "get_unified_snapshot":
      return list("/v3/snapshot", {
        "ticker.any_of": readStringArray(input.tickers)?.join(","),
        "type": readText(input.assetType),
        ...pagingQuery(input),
      });
    case "get_stock_movers":
      return list(
        `/v2/snapshot/locale/us/markets/stocks/${encodeURIComponent(requiredInputString(input.direction, "direction"))}`,
      );
    case "list_trades":
      return list(`/v3/trades/${ticker()}`, timestampQuery(input));
    case "get_last_stock_trade":
      return result(`/v2/last/trade/${ticker()}`);
    case "list_quotes":
      return list(`/v3/quotes/${ticker()}`, timestampQuery(input));
    case "get_last_stock_quote":
      return result(`/v2/last/nbbo/${ticker()}`);
    case "list_market_holidays":
      return list("/v1/marketstatus/upcoming");
    case "list_condition_codes":
      return list(
        "/v3/reference/conditions",
        compactObject({
          asset_class: readText(input.assetClass),
          data_type: readText(input.dataType),
          id: readIntegerString(input.id),
          sip_mapping: readText(input.sipMapping),
        }),
      );
    case "list_ticker_news":
      return list(
        "/v2/reference/news",
        compactObject({
          "ticker": readText(input.ticker),
          "published_utc.gte": readText(input.publishedUtcGte),
          "published_utc.lte": readText(input.publishedUtcLte),
          ...pagingQuery(input),
        }),
      );
    case "list_dividends":
      return list(
        "/stocks/v1/dividends",
        compactObject({
          "ticker": readText(input.ticker),
          "ex_dividend_date": readText(input.exDividendDate),
          "ex_dividend_date.gte": readText(input.exDividendDateGte),
          "ex_dividend_date.lte": readText(input.exDividendDateLte),
          ...pagingQuery(input),
        }),
      );
    case "list_splits":
      return list(
        "/stocks/v1/splits",
        compactObject({
          "ticker": readText(input.ticker),
          "execution_date": readText(input.executionDate),
          "execution_date.gte": readText(input.executionDateGte),
          "execution_date.lte": readText(input.executionDateLte),
          ...pagingQuery(input),
        }),
      );
    case "list_balance_sheets":
      return list("/stocks/financials/v1/balance-sheets", financialsQuery(input));
    case "list_income_statements":
      return list("/stocks/financials/v1/income-statements", financialsQuery(input));
    case "list_cash_flow_statements":
      return list("/stocks/financials/v1/cash-flow-statements", financialsQuery(input));
    case "list_financial_ratios":
      return list("/stocks/financials/v1/ratios", financialsQuery(input));
    case "list_short_interest":
      return list(
        "/stocks/v1/short-interest",
        compactObject({
          "ticker": readText(input.ticker),
          "settlement_date": readText(input.settlementDate),
          "settlement_date.gte": readText(input.settlementDateGte),
          "settlement_date.lte": readText(input.settlementDateLte),
          ...pagingQuery(input),
        }),
      );
    case "list_short_volume":
      return list("/stocks/v1/short-volume", datedListQuery(input));
    case "list_option_contracts":
      return list("/v3/reference/options/contracts", optionFilters(input));
    case "get_option_contract":
      return result(`/v3/reference/options/contracts/${optionsTicker()}`, {
        as_of: readText(input.asOf),
      });
    case "get_option_chain_snapshot":
      return list(`/v3/snapshot/options/${underlyingTicker()}`, optionFilters(input));
    case "get_option_contract_snapshot":
      return result(`/v3/snapshot/options/${underlyingTicker()}/${optionsTicker()}`);
    case "list_treasury_yields":
      return list("/fed/v1/treasury-yields", datedListQuery(input));
    case "list_inflation":
      return list("/fed/v1/inflation", datedListQuery(input));
    case "list_inflation_expectations":
      return list("/fed/v1/inflation-expectations", datedListQuery(input));
    case "list_labor_market":
      return list("/fed/v1/labor-market", datedListQuery(input));
    case "list_funding_conditions":
      return list("/fed/v1/funding-conditions", datedListQuery(input));
    case "get_sma":
      return pagedResult(`/v1/indicators/sma/${ticker()}`, indicatorQuery(input));
    case "get_ema":
      return pagedResult(`/v1/indicators/ema/${ticker()}`, indicatorQuery(input));
    case "get_rsi":
      return pagedResult(`/v1/indicators/rsi/${ticker()}`, indicatorQuery(input));
    case "get_macd":
      return pagedResult(
        `/v1/indicators/macd/${ticker()}`,
        compactObject({
          ...indicatorQuery(input),
          short_window: readIntegerString(input.shortWindow),
          long_window: readIntegerString(input.longWindow),
          signal_window: readIntegerString(input.signalWindow),
        }),
      );
  }
  throw providerInputError(`Unknown polygon_io action: ${actionName}`);
}

function pagingQuery(input: Record<string, unknown>) {
  return compactObject({
    order: readText(input.order),
    limit: readIntegerString(input.limit),
    sort: readText(input.sort),
    cursor: readText(input.cursor),
  });
}

function timestampQuery(input: Record<string, unknown>) {
  return compactObject({
    "timestamp": readText(input.timestamp),
    "timestamp.gte": readText(input.timestampGte),
    "timestamp.lte": readText(input.timestampLte),
    ...pagingQuery(input),
  });
}

function datedListQuery(input: Record<string, unknown>) {
  return compactObject({
    "ticker": readText(input.ticker),
    "date": readText(input.date),
    "date.gte": readText(input.dateGte),
    "date.lte": readText(input.dateLte),
    ...pagingQuery(input),
  });
}

function financialsQuery(input: Record<string, unknown>) {
  return compactObject({
    "tickers": readStringArray(input.tickers)?.join(","),
    "cik": readText(input.cik),
    "timeframe": readText(input.timeframe),
    "fiscal_year": readIntegerString(input.fiscalYear),
    "fiscal_quarter": readIntegerString(input.fiscalQuarter),
    "period_end": readText(input.periodEnd),
    "period_end.gte": readText(input.periodEndGte),
    "period_end.lte": readText(input.periodEndLte),
    "filing_date.gte": readText(input.filingDateGte),
    "filing_date.lte": readText(input.filingDateLte),
    ...pagingQuery(input),
  });
}

function optionFilters(input: Record<string, unknown>) {
  return compactObject({
    "underlying_ticker": readText(input.underlyingTicker),
    "contract_type": readText(input.contractType),
    "expiration_date": readText(input.expirationDate),
    "expiration_date.gte": readText(input.expirationDateGte),
    "expiration_date.lte": readText(input.expirationDateLte),
    "strike_price": readNumberString(input.strikePrice),
    "strike_price.gte": readNumberString(input.strikePriceGte),
    "strike_price.lte": readNumberString(input.strikePriceLte),
    "expired": optionalBoolean(input.expired),
    "as_of": readText(input.asOf),
    ...pagingQuery(input),
  });
}

function indicatorQuery(input: Record<string, unknown>) {
  return compactObject({
    "timespan": readText(input.timespan),
    "window": readIntegerString(input.window),
    "adjusted": optionalBoolean(input.adjusted),
    "expand_underlying": optionalBoolean(input.expandUnderlying),
    "series_type": readText(input.seriesType),
    "timestamp": readText(input.timestamp),
    "timestamp.gte": readText(input.timestampGte),
    "timestamp.lte": readText(input.timestampLte),
    ...pagingQuery(input),
  });
}

function normalizeList(payload: unknown) {
  const response = optionalRecord(payload);
  const results = Array.isArray(payload)
    ? payload
    : Array.isArray(response?.results)
      ? response.results
      : Array.isArray(response?.tickers)
        ? response.tickers
        : [];
  return {
    meta: normalizeMeta(response),
    results: results
      .map((item) => optionalRecord(item))
      .filter((item): item is Record<string, unknown> => item !== undefined),
    page: normalizePage(response),
  };
}

function normalizeResult(payload: unknown) {
  const response = optionalRecord(payload);
  return {
    meta: normalizeMeta(response),
    result: response?.results ?? payload,
  };
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
  return { nextUrl, nextCursor: nextUrl ? readCursor(nextUrl) : null };
}

function readCursor(nextUrl: string) {
  try {
    return new URL(nextUrl).searchParams.get("cursor");
  } catch {
    return null;
  }
}

function readText(value: unknown) {
  return optionalString(value);
}

function readIntegerString(value: unknown) {
  const number = optionalInteger(value);
  return number === undefined ? undefined : String(number);
}

function readNumberString(value: unknown) {
  const number = optionalNumber(value);
  return number === undefined ? undefined : String(number);
}

function readStringArray(value: unknown) {
  return optionalStringArray(value)
    ?.map((item) => item.trim())
    .filter(Boolean);
}
