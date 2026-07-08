import type { CredentialValidationResult } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { LongbridgeReadonlyActionSpec, LongbridgeReadonlyParamSpec } from "./readonly-action-specs.ts";

import {
  compactObject,
  objectArray,
  optionalRecord,
  optionalScalarString,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { longbridgeOAuthScopes } from "./actions.ts";
import { indexSymbolToCounterId, symbolToCounterId } from "./counter-id.ts";
import { longbridgeReadonlyActionSpecs, longbridgeScreenerDefaultReturns } from "./readonly-action-specs.ts";

const longbridgeApiBaseUrl = "https://openapi.longbridge.com";
const longbridgeRequestTimeoutMs = 30_000;

export type LongbridgeHttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type LongbridgeRequestPhase = "connect" | "execute";
type LongbridgeQueryValue = string | readonly string[] | undefined;

export interface LongbridgeRequestOptions {
  method: LongbridgeHttpMethod;
  path: string;
  context: Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;
  phase: LongbridgeRequestPhase;
  query?: Record<string, LongbridgeQueryValue>;
  body?: Record<string, unknown>;
}

type LongbridgeActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

const longbridgeReadonlyActionHandlers: Record<string, LongbridgeActionHandler> = Object.fromEntries(
  longbridgeReadonlyActionSpecs.map((spec) => [spec.name, createLongbridgeReadonlyActionHandler(spec)]),
);

export const longbridgeActionHandlers: Record<string, LongbridgeActionHandler> = {
  async list_securities(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/quote/get_security_list",
      context,
      phase: "execute",
      query: {
        market: requiredString(input.market, "market"),
        category: requiredString(input.category, "category"),
      },
    });

    return {
      securities: readLongbridgeDataList(payload),
      raw: payload,
    };
  },
  async list_account_cash(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/asset/account",
      context,
      phase: "execute",
      query: compactObject({
        currency: optionalString(input.currency),
      }),
    });

    return {
      balances: readLongbridgeDataList(payload),
      raw: payload,
    };
  },
  async list_stock_positions(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/asset/stock",
      context,
      phase: "execute",
      query: compactObject({
        symbol: input.symbols === undefined ? undefined : stringArray(input.symbols, "symbols"),
      }),
    });

    return {
      positionGroups: readLongbridgeDataList(payload),
      raw: payload,
    };
  },
  async get_market_temperature(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/quote/market_temperature",
      context,
      phase: "execute",
      query: {
        market: requiredString(input.market, "market"),
      },
    });

    return {
      temperature: readLongbridgeDataRecord(payload),
      raw: payload,
    };
  },
  async list_market_temperature(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/quote/history_market_temperature",
      context,
      phase: "execute",
      query: {
        market: requiredString(input.market, "market"),
        start_date: requiredString(input.startDate, "startDate"),
        end_date: requiredString(input.endDate, "endDate"),
      },
    });

    return {
      temperatures: readLongbridgeDataArray(payload, "list"),
      raw: payload,
    };
  },
  async list_filings(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/quote/filings",
      context,
      phase: "execute",
      query: {
        symbol: requiredString(input.symbol, "symbol"),
      },
    });

    return {
      filings: readLongbridgeDataArray(payload, "items"),
      raw: payload,
    };
  },
  async list_news(input, context) {
    const symbol = requiredString(input.symbol, "symbol");
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: `/v1/content/${encodePathSegment(symbol)}/news`,
      context,
      phase: "execute",
    });

    return {
      news: readLongbridgeDataArray(payload, "items"),
      raw: payload,
    };
  },
  async list_watchlist_groups(_input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/watchlist/groups",
      context,
      phase: "execute",
    });

    return {
      groups: readLongbridgeDataArray(payload, "groups"),
      raw: payload,
    };
  },
  async list_cash_flow(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/asset/cashflow",
      context,
      phase: "execute",
      query: compactObject({
        start_time: optionalScalarString(input.startTime),
        end_time: optionalScalarString(input.endTime),
        business_type: optionalScalarString(input.businessType),
        symbol: optionalStringList(input.symbols, "symbols"),
        page: optionalScalarString(input.page),
        size: optionalScalarString(input.size),
      }),
    });

    return {
      cashFlows: readLongbridgeDataArray(payload, "list"),
      raw: payload,
    };
  },
  async list_fund_positions(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/asset/fund",
      context,
      phase: "execute",
      query: compactObject({
        symbol: optionalStringList(input.symbols, "symbols"),
      }),
    });

    return {
      positionGroups: readLongbridgeDataArray(payload, "list"),
      raw: payload,
    };
  },
  async list_history_executions(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/trade/execution/history",
      context,
      phase: "execute",
      query: compactObject({
        start_at: optionalScalarString(input.startAt),
        end_at: optionalScalarString(input.endAt),
        order_id: optionalString(input.orderId),
        symbol: optionalString(input.symbol),
        page: optionalScalarString(input.page),
      }),
    });

    return {
      executions: readLongbridgeDataArray(payload, "trades"),
      raw: payload,
    };
  },
  async get_order_detail(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/trade/order",
      context,
      phase: "execute",
      query: {
        order_id: requiredString(input.orderId, "orderId"),
      },
    });

    return {
      order: readLongbridgeDataRecord(payload),
      raw: payload,
    };
  },
  async estimate_max_buy_quantity(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/trade/estimate/buy_limit",
      context,
      phase: "execute",
      query: compactObject({
        symbol: requiredString(input.symbol, "symbol"),
        order_type: requiredString(input.orderType, "orderType"),
        side: requiredString(input.side, "side"),
        price: optionalString(input.price),
        currency: optionalString(input.currency),
        market: optionalString(input.market),
        fractional_shares: optionalScalarString(input.fractionalShares),
        order_id: optionalString(input.orderId),
      }),
    });

    return {
      estimate: readLongbridgeDataRecord(payload),
      raw: payload,
    };
  },
  async list_history_orders(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/trade/order/history",
      context,
      phase: "execute",
      query: compactObject({
        start_at: optionalScalarString(input.startAt),
        end_at: optionalScalarString(input.endAt),
        symbol: optionalString(input.symbol),
        market: optionalString(input.market),
        side: optionalString(input.side),
        status: optionalStringList(input.statuses, "statuses"),
        page: optionalScalarString(input.page),
        size: optionalScalarString(input.size),
      }),
    });

    return {
      orders: readLongbridgeDataArray(payload, "orders"),
      raw: payload,
    };
  },
  async list_today_executions(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/trade/execution/today",
      context,
      phase: "execute",
      query: compactObject({
        order_id: optionalString(input.orderId),
        symbol: optionalString(input.symbol),
      }),
    });

    return {
      executions: readLongbridgeDataArray(payload, "trades"),
      raw: payload,
    };
  },
  async list_today_orders(input, context) {
    const payload = await requestLongbridgeJson({
      method: "GET",
      path: "/v1/trade/order/today",
      context,
      phase: "execute",
      query: compactObject({
        symbol: optionalString(input.symbol),
        market: optionalString(input.market),
        side: optionalString(input.side),
        status: optionalStringList(input.statuses, "statuses"),
        order_id: optionalString(input.orderId),
        page: optionalScalarString(input.page),
        size: optionalScalarString(input.size),
      }),
    });

    return {
      orders: readLongbridgeDataArray(payload, "orders"),
      raw: payload,
    };
  },
  ...longbridgeReadonlyActionHandlers,
};

export async function validateLongbridgeCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLongbridgeJson({
    method: "GET",
    path: "/v1/asset/account",
    context: {
      accessToken,
      fetcher,
      signal,
    },
    phase: "connect",
  });
  const records = readLongbridgeDataList(payload);
  const firstRecord = optionalRecord(records[0]);
  const primaryCurrency = optionalString(firstRecord?.currency);

  return {
    profile: {
      accountId: "longbridge:account",
      displayName: "Longbridge account",
      grantedScopes: longbridgeOAuthScopes,
    },
    grantedScopes: longbridgeOAuthScopes,
    metadata: compactObject({
      apiBaseUrl: longbridgeApiBaseUrl,
      validationEndpoint: "/v1/asset/account",
      primaryCurrency,
      balanceCount: records.length,
    }),
  };
}

export async function requestLongbridgeJson(input: LongbridgeRequestOptions): Promise<unknown> {
  const url = buildLongbridgeUrl(input.path, input.query);
  const timeout = createProviderTimeout(input.context.signal, longbridgeRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, buildLongbridgeRequestInit(input, timeout.signal));
    const payload = await readLongbridgeJson(response);
    if (!response.ok) {
      throw mapLongbridgeHttpError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Longbridge request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Longbridge request failed: ${error.message}` : "Longbridge request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLongbridgeRequestInit(input: LongbridgeRequestOptions, signal: AbortSignal): RequestInit {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.context.accessToken}`,
    "user-agent": providerUserAgent,
  };
  if ((input.method === "POST" || input.method === "PUT") && input.body !== undefined) {
    headers["content-type"] = "application/json";
    return {
      method: input.method,
      headers,
      body: JSON.stringify(input.body),
      signal,
    };
  }
  return {
    method: input.method,
    headers,
    signal,
  };
}

function buildLongbridgeUrl(path: string, query: Record<string, LongbridgeQueryValue> = {}): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${longbridgeApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      url.searchParams.set(key, value);
      continue;
    }
    for (const item of value) {
      url.searchParams.append(key, item);
    }
  }
  return url.toString();
}

async function readLongbridgeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function readLongbridgeDataList(payload: unknown): unknown[] {
  return readLongbridgeDataArray(payload, "list");
}

function readLongbridgeDataRecord(payload: unknown): Record<string, unknown> {
  const data = optionalRecord(optionalRecord(payload)?.data);
  if (!data) {
    throw new ProviderRequestError(502, "Longbridge response is missing data");
  }
  return data;
}

function readLongbridgeDataArray(payload: unknown, key: string): unknown[] {
  const data = readLongbridgeDataRecord(payload);
  const list = data[key];
  if (!Array.isArray(list)) {
    throw new ProviderRequestError(502, `Longbridge response is missing data.${key}`);
  }
  return list;
}

function optionalStringList(value: unknown, fieldName: string): string[] | undefined {
  return value === undefined ? undefined : stringArray(value, fieldName);
}

function createLongbridgeReadonlyActionHandler(spec: LongbridgeReadonlyActionSpec): LongbridgeActionHandler {
  return async (input, context) => {
    const payload = await requestLongbridgeJson({
      method: spec.method ?? "GET",
      path: resolveReadonlyPath(spec, input),
      context,
      phase: "execute",
      query: buildReadonlyQuery(spec, input),
      body: buildReadonlyBody(spec, input),
    });

    return {
      [spec.outputKey]: readLongbridgeReadonlyOutput(payload, spec),
      raw: payload,
    };
  };
}

function resolveReadonlyPath(spec: LongbridgeReadonlyActionSpec, input: Record<string, unknown>): string {
  let path = spec.marketPath ? resolveReadonlyMarketPath(spec, input) : spec.path;
  if (spec.symbolMarketPath) {
    path = resolveReadonlySymbolMarketPath(spec, input);
  }
  if (spec.pathParam) {
    const value = readReadonlyPathValue(spec.pathParam.inputName, input[spec.pathParam.inputName]);
    path = path.replace(spec.pathParam.token, encodePathSegment(value));
  }
  return path;
}

function resolveReadonlyMarketPath(spec: LongbridgeReadonlyActionSpec, input: Record<string, unknown>): string {
  if (!spec.marketPath) {
    return spec.path;
  }
  const market = requiredString(input[spec.marketPath.inputName], spec.marketPath.inputName).toUpperCase();
  if (market === "HK" || market === "US") {
    return spec.marketPath.paths[market];
  }
  throw new ProviderRequestError(400, `${spec.marketPath.inputName} must be HK or US`);
}

function resolveReadonlySymbolMarketPath(spec: LongbridgeReadonlyActionSpec, input: Record<string, unknown>): string {
  if (!spec.symbolMarketPath) {
    return spec.path;
  }
  const symbol = requiredString(input[spec.symbolMarketPath.inputName], spec.symbolMarketPath.inputName).toUpperCase();
  return symbol.endsWith(".HK") ? spec.symbolMarketPath.paths.HK : spec.symbolMarketPath.paths.US;
}

function readReadonlyPathValue(fieldName: string, value: unknown): string {
  const text = optionalScalarString(value);
  if (text !== undefined && text.trim()) {
    return text.trim();
  }
  throw new ProviderRequestError(400, `${fieldName} is required.`);
}

function buildReadonlyQuery(
  spec: LongbridgeReadonlyActionSpec,
  input: Record<string, unknown>,
): Record<string, LongbridgeQueryValue> {
  const query: Record<string, LongbridgeQueryValue> = { ...(spec.queryDefaults ?? {}) };
  for (const dynamicDefault of spec.queryDynamicDefaults ?? []) {
    query[dynamicDefault.apiName] = readReadonlyDynamicQueryDefault(dynamicDefault.value);
  }
  for (const derivedDefault of spec.queryDerivedDefaults ?? []) {
    query[derivedDefault.apiName] = readReadonlyDerivedQueryDefault(derivedDefault, input);
  }
  for (const param of spec.queryParams ?? []) {
    const value = readReadonlyQueryValue(param, input[param.inputName]);
    if (value !== undefined) {
      query[param.apiName] = value;
    }
  }
  return query;
}

function readReadonlyDynamicQueryDefault(_value: "unixNowSeconds"): string {
  return String(Math.floor(Date.now() / 1000));
}

function readReadonlyDerivedQueryDefault(
  spec: NonNullable<LongbridgeReadonlyActionSpec["queryDerivedDefaults"]>[number],
  input: Record<string, unknown>,
): string {
  const rawKey = optionalString(input[spec.inputName])?.trim() ?? "";
  const key = rawKey.startsWith("ib_") ? rawKey : `ib_${rawKey}`;
  const suffix = key.includes("-") ? key.slice(key.lastIndexOf("-") + 1).toUpperCase() : "";
  return suffix === "HK" || suffix === "US" || suffix === "CN" || suffix === "SG" ? suffix : "US";
}

function buildReadonlyBody(
  spec: LongbridgeReadonlyActionSpec,
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!spec.bodyDefaults && !spec.bodyParams) {
    return undefined;
  }
  const body: Record<string, unknown> = { ...(spec.bodyDefaults ?? {}) };
  for (const param of spec.bodyParams ?? []) {
    const value = readReadonlyBodyValue(param, input[param.inputName]);
    if (value !== undefined) {
      body[param.apiName] = value;
    }
  }
  if (spec.bodyPostProcessor === "screenerSearch") {
    return normalizeScreenerSearchBody(body);
  }
  return body;
}

function readReadonlyQueryValue(param: LongbridgeReadonlyParamSpec, value: unknown): LongbridgeQueryValue {
  if (param.kind === "stringArray") {
    if (value === undefined) {
      return readMissingReadonlyParam(param);
    }
    const values = stringArray(value, param.inputName);
    if (param.transform === "symbolsToCounterIdsJson") {
      return JSON.stringify(values.map(symbolToCounterId));
    }
    if (param.transform === "symbolsToCounterIds") {
      return values.map(symbolToCounterId);
    }
    return values;
  }
  if (value === undefined) {
    return readMissingReadonlyParam(param);
  }
  const scalar = readReadonlyScalar(param, value);
  return applyReadonlyQueryTransform(param, scalar);
}

function readReadonlyBodyValue(param: LongbridgeReadonlyParamSpec, value: unknown): unknown {
  if (value === undefined) {
    return readMissingReadonlyParam(param);
  }
  if (param.kind === "objectArray") {
    return objectArray(value, param.inputName);
  }
  if (param.kind === "stringArray") {
    return stringArray(value, param.inputName);
  }
  if (param.kind === "integer") {
    const scalar = readReadonlyScalar(param, value);
    const parsed = Number(scalar);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
    throw new ProviderRequestError(400, `${param.inputName} must be an integer`);
  }
  if (param.kind === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    throw new ProviderRequestError(400, `${param.inputName} must be a boolean`);
  }
  return applyReadonlyBodyTransform(param, readReadonlyScalar(param, value));
}

function readMissingReadonlyParam(param: LongbridgeReadonlyParamSpec): undefined {
  if (param.required) {
    throw new ProviderRequestError(400, `${param.inputName} is required.`);
  }
  return undefined;
}

function readReadonlyScalar(param: LongbridgeReadonlyParamSpec, value: unknown): string {
  const text = param.kind === "string" ? optionalString(value) : optionalScalarString(value);
  if (text !== undefined && text.trim()) {
    return text.trim();
  }
  if (param.required) {
    throw new ProviderRequestError(400, `${param.inputName} is required.`);
  }
  return "";
}

function applyReadonlyQueryTransform(param: LongbridgeReadonlyParamSpec, value: string): string {
  if (param.transform === "ahPremiumPeriod") {
    return ahPremiumLineType(value);
  }
  if (param.transform === "symbolToCounterId") {
    return symbolToCounterId(value);
  }
  if (param.transform === "indexSymbolToCounterId") {
    return indexSymbolToCounterId(value);
  }
  if (param.transform === "rankKey") {
    return value.startsWith("ib_") ? value : `ib_${value}`;
  }
  if (param.transform === "booleanString") {
    return booleanString(value);
  }
  if (param.transform === "dateToUnixStart") {
    return String(dateToUnixSeconds(value, "start"));
  }
  if (param.transform === "dateToUnixEnd") {
    return String(dateToUnixSeconds(value, "end"));
  }
  return value;
}

function applyReadonlyBodyTransform(param: LongbridgeReadonlyParamSpec, value: string): unknown {
  if (param.transform === "ahPremiumPeriod") {
    return ahPremiumLineType(value);
  }
  if (param.transform === "symbolToCounterId") {
    return symbolToCounterId(value);
  }
  if (param.transform === "indexSymbolToCounterId") {
    return indexSymbolToCounterId(value);
  }
  if (param.transform === "rankKey") {
    return value.startsWith("ib_") ? value : `ib_${value}`;
  }
  if (param.transform === "booleanString") {
    return booleanString(value) === "true";
  }
  return value;
}

function booleanString(value: string): "false" | "true" {
  return value === "true" || value === "1" ? "true" : "false";
}

function ahPremiumLineType(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "1m" || normalized === "min1" || normalized === "1") {
    return "1";
  }
  if (normalized === "5m" || normalized === "min5" || normalized === "5") {
    return "5";
  }
  if (normalized === "15m" || normalized === "min15" || normalized === "15") {
    return "15";
  }
  if (normalized === "30m" || normalized === "min30" || normalized === "30") {
    return "30";
  }
  if (normalized === "60m" || normalized === "min60" || normalized === "60") {
    return "60";
  }
  if (normalized === "week" || normalized === "w" || normalized === "2000") {
    return "2000";
  }
  if (normalized === "month" || normalized === "m" || normalized === "3000") {
    return "3000";
  }
  if (normalized === "year" || normalized === "y" || normalized === "4000") {
    return "4000";
  }
  return "1000";
}

function normalizeScreenerSearchBody(body: Record<string, unknown>): Record<string, unknown> {
  const filters = [
    ...readOptionalObjectArray(body.filters, "filters"),
    ...readOptionalObjectArray(body.conditions, "conditions"),
  ].map(normalizeScreenerFilter);
  const rawReturns = readOptionalStringArray(body.returns, "returns");
  const explicitReturns = isDefaultScreenerReturns(rawReturns) ? [] : rawReturns;
  const returns = uniqueStrings([
    ...filters.map((filter) => requiredString(filter.key, "filters.key", providerInputError)),
    ...explicitReturns.map(normalizeScreenerKey),
    ...readOptionalStringArray(body.extra_returns, "extraReturns").map(normalizeScreenerKey),
    ...longbridgeScreenerDefaultReturns,
  ]);
  const sortBy = resolveScreenerSortBy(body.sort_by_key, body.sort_by, returns);
  return {
    market: optionalString(body.market)?.toUpperCase() ?? "US",
    filters,
    returns,
    sort_by: sortBy,
    sort_order: readOptionalInteger(body.sort_order, 1),
    industries: [],
    page: readOptionalInteger(body.page, 0),
    size: readOptionalInteger(body.size, 20),
  };
}

interface ScreenerFilter {
  key: string;
  min: string;
  max: string;
  tech_values: Record<string, unknown>;
}

function normalizeScreenerFilter(filter: Record<string, unknown>): ScreenerFilter {
  return {
    key: normalizeScreenerKey(requiredString(filter.key, "filters.key", providerInputError)),
    min: optionalScalarString(filter.min) ?? "",
    max: optionalScalarString(filter.max) ?? "",
    tech_values: optionalRecord(filter.tech_values) ?? {},
  };
}

function normalizeScreenerKey(value: string): string {
  const key = value.trim();
  return key.startsWith("filter_") ? key : `filter_${key}`;
}

function resolveScreenerSortBy(sortByKey: unknown, sortBy: unknown, returns: readonly string[]): number {
  const key = optionalString(sortByKey);
  if (key) {
    const index = returns.indexOf(normalizeScreenerKey(key));
    return index < 0 ? 0 : index;
  }
  return readOptionalInteger(sortBy, 0);
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] {
  return value === undefined ? [] : stringArray(value, fieldName, providerInputError);
}

function readOptionalObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  return value === undefined ? [] : objectArray(value, fieldName, providerInputError);
}

function readOptionalInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function isDefaultScreenerReturns(values: readonly string[]): boolean {
  return (
    values.length === longbridgeScreenerDefaultReturns.length &&
    values.every((value, index) => value === longbridgeScreenerDefaultReturns[index])
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function dateToUnixSeconds(value: string, edge: "end" | "start"): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new ProviderRequestError(400, "date must use YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ProviderRequestError(400, "date must be valid");
  }
  const timestamp = date.getTime() / 1000;
  return edge === "end" ? timestamp + 86_399 : timestamp;
}

function readLongbridgeReadonlyOutput(payload: unknown, spec: LongbridgeReadonlyActionSpec): unknown {
  const envelope = optionalRecord(payload);
  if (!envelope || envelope.data === undefined) {
    throw new ProviderRequestError(502, "Longbridge response is missing data");
  }
  if (spec.dataKey) {
    const data = optionalRecord(envelope.data);
    if (!data || data[spec.dataKey] === undefined) {
      throw new ProviderRequestError(502, `Longbridge response is missing data.${spec.dataKey}`);
    }
    const value = data[spec.dataKey];
    if (spec.outputMode === "list" && !Array.isArray(value)) {
      throw new ProviderRequestError(502, `Longbridge response data.${spec.dataKey} is not a list`);
    }
    return value;
  }
  if (spec.outputMode === "list") {
    if (Array.isArray(envelope.data)) {
      return envelope.data;
    }
    throw new ProviderRequestError(502, "Longbridge response data is not a list");
  }
  const data = optionalRecord(envelope.data);
  if (!data) {
    throw new ProviderRequestError(502, "Longbridge response data is not an object");
  }
  return data;
}

function mapLongbridgeHttpError(status: number, payload: unknown, phase: LongbridgeRequestPhase): ProviderRequestError {
  const message = readLongbridgeErrorMessage(payload) ?? `Longbridge request failed with HTTP ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "connect" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readLongbridgeErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error_description) ?? optionalString(object?.error);
}
