import type { TransitFileWriter } from "../../core/types.ts";

import { compactObject } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";
import { createMarketDumpHandlers } from "./market-dumps.ts";

type HithinkFinanceQueryValue = string | number | undefined;
export interface HithinkFinanceActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}
type HithinkFinanceActionHandler = (
  input: Record<string, unknown>,
  context: HithinkFinanceActionContext,
) => Promise<unknown>;
type HithinkFinanceGet = (
  path: string,
  query: Record<string, HithinkFinanceQueryValue>,
  context: HithinkFinanceActionContext,
) => Promise<unknown>;

function requiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw hithinkError("invalid_input", `${fieldName} is required`, 400);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function requiredStringArray(value: unknown, fieldName: string) {
  const result = optionalStringArray(value);
  if (!result || result.length === 0) {
    throw hithinkError("invalid_input", `${fieldName} is required`, 400);
  }
  return result.map((item, index) => requiredString(item, `${fieldName}[${index}]`));
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function requiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw hithinkError("invalid_input", `${fieldName} is required`, 400);
  }
  return value;
}

type QueryValue = HithinkFinanceQueryValue;
type ActionContext = HithinkFinanceActionContext;
type ActionHandler = HithinkFinanceActionHandler;

type RequestPhase = "validate" | "execute";
interface HithinkFinanceProxyInput {
  url: URL;
  init: RequestInit;
  fetcher: typeof fetch;
}
export const hithinkFinanceProxyMaxResponseBytes: number = 4 * 1024 * 1024;
const hithinkFinanceActionMaxResponseBytes = 16 * 1024 * 1024;

export const hithinkFinanceApiBaseUrl = "https://fuyao.aicubes.cn";

export async function validateHithinkFinanceCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<import("../../core/types.ts").CredentialValidationResult> {
  await hithinkFinanceGet("/api/meta/tickers/search", { q: "600519.SH", limit: 1 }, apiKey, fetcher, "validate");

  return {
    profile: { accountId: "hithink-finance", displayName: "Tonghuashun Financial Data API Key" },
    metadata: {
      apiBaseUrl: hithinkFinanceApiBaseUrl,
      validationEndpoint: "/api/meta/tickers/search",
    },
  };
}

export async function fetchHithinkFinanceProxy(input: HithinkFinanceProxyInput): Promise<Response> {
  const method = (input.init.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    throw hithinkError("policy_denied", "Tonghuashun Financial Data proxy is read-only", 403);
  }
  if (input.url.pathname.includes("%")) {
    throw hithinkError("policy_denied", "Tonghuashun Financial Data proxy does not allow encoded path segments", 403);
  }
  if (!input.url.pathname.startsWith("/api/")) {
    throw hithinkError("policy_denied", "Tonghuashun Financial Data proxy only allows official /api/ data paths", 403);
  }
  if (input.url.pathname.startsWith("/api/dump/")) {
    throw hithinkError("policy_denied", "Tonghuashun market dumps must use the persistent export actions", 403);
  }

  const upstreamResponse = await input.fetcher(input.url, {
    ...input.init,
    redirect: "manual",
  });
  await rejectOfficialApiRedirect(upstreamResponse);
  if (!upstreamResponse.body && !upstreamResponse.ok) {
    throw buildProviderError(upstreamResponse.status, undefined, {}, "execute");
  }
  const response = await readBoundedResponse(
    upstreamResponse,
    hithinkFinanceProxyMaxResponseBytes,
    () => hithinkError("proxy_response_too_large", "proxy response is too large", 502),
    "Tonghuashun Financial Data returned an empty proxy response",
  );
  let payload: Record<string, unknown>;
  try {
    payload = await readPayload(response.clone());
  } catch (error) {
    if (!response.ok) {
      throw buildProviderError(response.status, undefined, {}, "execute");
    }
    throw error;
  }
  const code = readInteger(payload.code);
  if (!response.ok || code !== 0) {
    throw buildProviderError(response.status, code, payload, "execute");
  }
  if (!("data" in payload) || payload.data === null) {
    throw hithinkError("provider_error", "Tonghuashun Financial Data returned an invalid proxy response", 502);
  }
  return response;
}

async function readBoundedResponse(
  response: Response,
  maximumBytes: number,
  tooLargeError: () => ProviderRequestError,
  emptyMessage: string,
) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLargeError();
  }
  if (!response.body) {
    throw hithinkError("provider_error", emptyMessage, 502);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(bytes, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const hithinkFinanceActionHandlers: Record<string, ActionHandler> = {
  search_tickers(input, context) {
    return get(
      "/api/meta/tickers/search",
      {
        q: requiredString(input.query, "query"),
        exchange: optionalString(input.exchange),
        asset_type: optionalStringArray(input.assetTypes)?.join(","),
        limit: optionalNumber(input.limit),
      },
      context,
    );
  },
  list_tickers(input, context) {
    return get(
      "/api/meta/tickers/list",
      {
        exchange: optionalStringArray(input.exchanges)?.join(","),
        asset_type: optionalStringArray(input.assetTypes)?.join(","),
        limit: optionalNumber(input.limit),
        offset: optionalNumber(input.offset),
      },
      context,
    );
  },
  get_stock_snapshot(input, context) {
    return get(
      "/api/a-share/prices/snapshot",
      {
        thscodes: optionalStringArray(input.thscodes)?.join(","),
        limit: optionalNumber(input.limit),
        offset: optionalNumber(input.offset),
      },
      context,
    );
  },
  get_stock_history(input, context) {
    return get(
      "/api/a-share/prices/historical",
      {
        thscode: requiredString(input.thscode, "thscode"),
        interval: "1d",
        start: requiredNumber(input.startTimeMs, "startTimeMs"),
        end: requiredNumber(input.endTimeMs, "endTimeMs"),
        adjust: optionalString(input.adjust),
        offset: optionalNumber(input.offset),
      },
      context,
    );
  },
  get_adjustment_factors(input, context) {
    return get(
      "/api/a-share/corporate-actions/adjustment-factors",
      {
        thscode: requiredString(input.thscode, "thscode"),
        from: optionalString(input.from),
        to: optionalString(input.to),
      },
      context,
    );
  },
  get_income_statements(input, context) {
    return getFinancialStatements("/api/a-share/financials/income-statements", input, context);
  },
  get_balance_sheets(input, context) {
    return getFinancialStatements("/api/a-share/financials/balance-sheets", input, context);
  },
  get_cash_flow_statements(input, context) {
    return getFinancialStatements("/api/a-share/financials/cash-flow-statements", input, context);
  },
  get_financial_indicators(input, context) {
    return get(
      "/api/a-share/financials/indicators",
      {
        thscode: requiredString(input.thscode, "thscode"),
        report: requiredString(input.report, "report"),
      },
      context,
    );
  },
  get_valuation_snapshot(input, context) {
    return get(
      "/api/a-share/valuations/snapshot",
      { thscodes: requiredStringArray(input.thscodes, "thscodes").join(",") },
      context,
    );
  },
  list_trading_days(_input, context) {
    return get("/api/a-share/calendar/trading-days", {}, context);
  },
  list_ths_indexes(input, context) {
    return get("/api/a-share-index/catalog/ths-index-list", { tag: optionalString(input.tag) }, context);
  },
  get_index_constituents(input, context) {
    return get(
      "/api/a-share-index/constituents/ths-stock-list",
      { thscode: requiredString(input.thscode, "thscode") },
      context,
    );
  },
  get_index_snapshot(input, context) {
    return get(
      "/api/a-share-index/prices/snapshot",
      { thscodes: requiredStringArray(input.thscodes, "thscodes").join(",") },
      context,
    );
  },
  get_index_history(input, context) {
    return get(
      "/api/a-share-index/prices/historical",
      {
        thscode: requiredString(input.thscode, "thscode"),
        interval: "1d",
        start: requiredNumber(input.startTimeMs, "startTimeMs"),
        end: requiredNumber(input.endTimeMs, "endTimeMs"),
      },
      context,
    );
  },
  get_auction_snapshot(input, context) {
    return get(
      "/api/a-share/auction/snapshot",
      {
        thscodes: requiredStringArray(input.thscodes, "thscodes").join(","),
        stage: optionalString(input.stage),
      },
      context,
    );
  },
  get_auction_short_term_benchmark(input, context) {
    return get("/api/a-share/auction/short-term-benchmark", { date: optionalString(input.date) }, context);
  },
  ...createSpecialDataHandlers(get),
  ...createFundHandlers(get),
  ...createMarketDumpHandlers(get),
};

function createFundHandlers(get: HithinkFinanceGet): Record<string, HithinkFinanceActionHandler> {
  return {
    get_fund_profile(input, context) {
      return getFund(get, "/api/fund/profile/detail", input, context);
    },
    get_fund_holdings(input, context) {
      return getFund(get, "/api/fund/portfolio/holdings", input, context);
    },
    get_fund_nav(input, context) {
      return getFund(get, "/api/fund/performance/nav", input, context, {
        range: optionalString(input.range),
        nav_type: normalizeNavTypes(input.navTypes),
      });
    },
    get_fund_returns(input, context) {
      return getFund(get, "/api/fund/performance/returns", input, context);
    },
    get_fund_holder_structure(input, context) {
      return getFund(get, "/api/fund/holders/detail", input, context, {
        merge_scope: optionalString(input.mergeScope),
      });
    },
    get_fund_market_snapshot(input, context) {
      return get("/api/fund/market/snapshot", { thscode: requiredString(input.thscode, "thscode") }, context);
    },
    get_fund_market_history(input, context) {
      return get(
        "/api/fund/market/historical",
        {
          thscode: requiredString(input.thscode, "thscode"),
          interval: "1d",
          start: requiredNumber(input.startTimeMs, "startTimeMs"),
          end: requiredNumber(input.endTimeMs, "endTimeMs"),
        },
        context,
      );
    },
    get_fund_company(input, context) {
      return get("/api/fund/companies/detail", { company_id: requiredString(input.companyId, "companyId") }, context);
    },
    get_fund_industry_allocation(input, context) {
      return getFund(get, "/api/fund/portfolio/industry-allocation", input, context);
    },
    get_fund_performance_indicators(input, context) {
      return getFund(get, "/api/fund/performance/indicators-historical", input, context, {
        start: requiredNumber(input.startTimeMs, "startTimeMs"),
        end: requiredNumber(input.endTimeMs, "endTimeMs"),
      });
    },
    get_fund_drawdowns(input, context) {
      return getFund(get, "/api/fund/performance/drawdowns", input, context);
    },
    get_fund_top_holders(input, context) {
      return getFund(get, "/api/fund/holders/top", input, context, {
        limit: optionalNumber(input.limit),
      });
    },
    get_fund_dividends(input, context) {
      return getFund(get, "/api/fund/corporate-actions/dividends", input, context);
    },
    get_fund_diagnostics(input, context) {
      return getFund(get, "/api/fund/diagnostics/detail", input, context);
    },
    get_fund_financial_indicators(input, context) {
      return getFund(get, "/api/fund/financials/indicators", input, context);
    },
    get_fund_income_statements(input, context) {
      return getFund(get, "/api/fund/financials/income-statements", input, context);
    },
    get_fund_balance_sheets(input, context) {
      return getFund(get, "/api/fund/financials/balance-sheets", input, context);
    },
    get_fund_manager_investment_style(input, context) {
      return getManager(get, "/api/fund/managers/investment-style", input, context);
    },
    get_fund_manager_performance(input, context) {
      return getManager(get, "/api/fund/managers/performance", input, context, {
        range: requiredString(input.range, "range"),
      });
    },
    get_fund_manager_experience(input, context) {
      return getManager(get, "/api/fund/managers/experience", input, context);
    },
    get_fund_manager(input, context) {
      return getManager(get, "/api/fund/managers/detail", input, context);
    },
    list_fund_news(input, context) {
      return getFund(get, "/api/fund/news/article-list", input, context, {
        limit: optionalNumber(input.limit),
        offset: optionalString(input.offset),
      });
    },
    list_fund_offerings(input, context) {
      return get(
        "/api/fund/offerings/list",
        { subscribe: requiredString(input.subscriptionStatus, "subscriptionStatus") },
        context,
      );
    },
    get_fund_stock_holdings_history(input, context) {
      return getFundHoldingsHistory(get, "/api/fund/portfolio/stock-history", input, context);
    },
    list_fund_stock_report_dates(input, context) {
      return getFundReportDates(get, "/api/fund/portfolio/stock-report-dates", input, context);
    },
    get_fund_bond_holdings_history(input, context) {
      return getFundHoldingsHistory(get, "/api/fund/portfolio/bond-history", input, context);
    },
    list_fund_bond_report_dates(input, context) {
      return getFundReportDates(get, "/api/fund/portfolio/bond-report-dates", input, context);
    },
    get_fund_asset_allocation(input, context) {
      return getFund(get, "/api/fund/portfolio/asset-allocation", input, context);
    },
  };
}

function getFund(
  get: HithinkFinanceGet,
  path: string,
  input: Record<string, unknown>,
  context: HithinkFinanceActionContext,
  extra: Record<string, HithinkFinanceQueryValue> = {},
) {
  return get(
    path,
    {
      fund_type: requiredString(input.fundType, "fundType"),
      thscode: requiredString(input.thscode, "thscode"),
      ...extra,
    },
    context,
  );
}

function normalizeNavTypes(value: unknown) {
  const values = optionalStringArray(value);
  if (!values) return undefined;
  const selected = new Set(values);
  if (selected.has("unit") && selected.has("adj")) return "unit,adj";
  if (selected.has("unit")) return "unit";
  if (selected.has("adj")) return "adj";
  return undefined;
}

function getManager(
  get: HithinkFinanceGet,
  path: string,
  input: Record<string, unknown>,
  context: HithinkFinanceActionContext,
  extra: Record<string, HithinkFinanceQueryValue> = {},
) {
  return get(path, { manager_id: requiredString(input.managerId, "managerId"), ...extra }, context);
}

function getFundHoldingsHistory(
  get: HithinkFinanceGet,
  path: string,
  input: Record<string, unknown>,
  context: HithinkFinanceActionContext,
) {
  return getFund(get, path, input, context, {
    report_type: requiredString(input.reportType, "reportType"),
    end_date: requiredString(input.endDate, "endDate"),
  });
}

function getFundReportDates(
  get: HithinkFinanceGet,
  path: string,
  input: Record<string, unknown>,
  context: HithinkFinanceActionContext,
) {
  return getFund(get, path, input, context, {
    report_type: optionalString(input.reportType),
  });
}

function createSpecialDataHandlers(get: HithinkFinanceGet): Record<string, HithinkFinanceActionHandler> {
  return {
    list_limit_up_stocks(input, context) {
      return getPool(get, "/api/a-share/special-data/limit-up-pool", input, context);
    },
    get_limit_up_ladder(_input, context) {
      return get("/api/a-share/special-data/limit-up-ladder", {}, context);
    },
    list_stock_anomalies(input, context) {
      return get(
        "/api/a-share/special-data/anomaly-analysis-list",
        { tag_codes: optionalStringArray(input.tagCodes)?.join(",") },
        context,
      );
    },
    get_stock_anomalies(input, context) {
      return get(
        "/api/a-share/special-data/anomaly-analysis-stock",
        { thscodes: requiredStringArray(input.thscodes, "thscodes").join(",") },
        context,
      );
    },
    list_skyrocketing_stocks(input, context) {
      return get("/api/a-share/special-data/skyrocket-list", { period: optionalString(input.period) }, context);
    },
    list_hot_stocks(input, context) {
      return get("/api/a-share/special-data/hot-stock-list", { period: optionalString(input.period) }, context);
    },
    get_hot_stock_history(input, context) {
      return get(
        "/api/a-share/special-data/hot-stock-list-history",
        { date: requiredString(input.date, "date") },
        context,
      );
    },
    get_hot_stock_rank_trend(input, context) {
      return get(
        "/api/a-share/special-data/hot-stock-rank-trend",
        {
          thscode: requiredString(input.thscode, "thscode"),
          start_date: requiredString(input.startDate, "startDate"),
          end_date: requiredString(input.endDate, "endDate"),
        },
        context,
      );
    },
    get_dragon_tiger_list(input, context) {
      return get(
        "/api/a-share/special-data/dragon-tiger-list",
        { board_type: optionalString(input.boardType), date: optionalString(input.date) },
        context,
      );
    },
    list_limit_down_stocks(input, context) {
      return getPool(get, "/api/a-share/special-data/limit-down-pool", input, context);
    },
    list_limit_break_stocks(input, context) {
      return getPool(get, "/api/a-share/special-data/limit-break-pool", input, context);
    },
  };
}

function getPool(
  get: HithinkFinanceGet,
  path: string,
  input: Record<string, unknown>,
  context: HithinkFinanceActionContext,
) {
  return get(
    path,
    {
      date_ms: optionalNumber(input.dateMs),
      page: optionalNumber(input.page),
      size: optionalNumber(input.size),
      sort_field: optionalString(input.sortField),
      sort_dir: optionalString(input.sortDirection),
    },
    context,
  );
}

function getFinancialStatements(path: string, input: Record<string, unknown>, context: ActionContext) {
  return get(
    path,
    {
      thscode: requiredString(input.thscode, "thscode"),
      period: optionalString(input.period),
      limit: optionalNumber(input.limit),
      start: optionalNumber(input.startTimeMs),
      end: optionalNumber(input.endTimeMs),
    },
    context,
  );
}

function get(path: string, query: Record<string, QueryValue>, context: ActionContext) {
  return hithinkFinanceGet(path, query, context.apiKey, context.fetcher, "execute", context.signal);
}

async function hithinkFinanceGet(
  path: string,
  query: Record<string, QueryValue>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: RequestPhase,
  signal?: AbortSignal,
) {
  const url = new URL(path, hithinkFinanceApiBaseUrl);
  for (const [key, value] of Object.entries(compactObject(query))) {
    url.searchParams.set(key, String(value));
  }

  const timeout = createProviderTimeout(signal);
  let response: Response;
  try {
    const upstreamResponse = await fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": apiKey,
      },
      redirect: "manual",
      signal: timeout.signal,
    });
    await rejectOfficialApiRedirect(upstreamResponse);
    if (!upstreamResponse.body && !upstreamResponse.ok) {
      throw buildProviderError(upstreamResponse.status, undefined, {}, phase);
    }
    response = await readBoundedResponse(
      upstreamResponse,
      hithinkFinanceActionMaxResponseBytes,
      () => hithinkError("provider_error", "Tonghuashun Financial Data response is too large", 502),
      "Tonghuashun Financial Data returned an empty response",
    );
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw hithinkError("provider_error", "Tonghuashun Financial Data request timed out", 504);
    throw hithinkError(
      "provider_error",
      error instanceof Error
        ? `Tonghuashun Financial Data request failed: ${error.message}`
        : "Tonghuashun Financial Data request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }

  let payload: Record<string, unknown>;
  try {
    payload = await readPayload(response);
  } catch (error) {
    if (!response.ok) {
      throw buildProviderError(response.status, undefined, {}, phase);
    }
    throw error;
  }
  const code = readInteger(payload.code);
  if (!response.ok || code !== 0) {
    throw buildProviderError(response.status, code, payload, phase);
  }

  if (!("data" in payload) || payload.data === null) {
    throw hithinkError("provider_error", "Tonghuashun Financial Data returned an invalid success response", 502);
  }

  return payload.data;
}

async function rejectOfficialApiRedirect(response: Response) {
  if (response.status < 300 || response.status >= 400) return;
  await response.body?.cancel().catch(() => undefined);
  throw hithinkError("provider_error", "Tonghuashun Financial Data API redirects are not allowed", 502);
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    throw hithinkError("provider_error", "Tonghuashun Financial Data returned an empty response", 502);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw hithinkError("provider_error", "Tonghuashun Financial Data returned a non-JSON response", 502);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw hithinkError("provider_error", "Tonghuashun Financial Data returned an invalid response", 502);
  }
  return payload as Record<string, unknown>;
}

function buildProviderError(
  status: number,
  code: number | undefined,
  payload: Record<string, unknown>,
  phase: RequestPhase,
) {
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : `Tonghuashun Financial Data request failed${code === undefined ? "" : ` (${code})`}`;
  const requestId =
    typeof payload.request_id === "string" && payload.request_id.trim() ? payload.request_id.trim() : undefined;
  const detail = requestId ? `${message} (request_id: ${requestId})` : message;

  if (code === 2001 || code === 2002 || code === 2004 || status === 401) {
    return hithinkError(
      phase === "validate" ? "invalid_input" : "credential_expired",
      detail,
      phase === "validate" ? 400 : 401,
    );
  }
  if (code === 2003 || status === 403) {
    return hithinkError(
      phase === "validate" ? "invalid_input" : "scope_missing",
      detail,
      phase === "validate" ? 400 : 403,
    );
  }
  if (code === 4001 || status === 429) {
    return hithinkError("rate_limited", detail, 429);
  }
  if (code === 4040) {
    return hithinkError(
      "provider_error",
      requestId
        ? `Tonghuashun market dump data is not ready (request_id: ${requestId})`
        : "Tonghuashun market dump data is not ready",
      503,
    );
  }
  if (
    code === 1001 ||
    code === 1002 ||
    code === 1003 ||
    code === 1004 ||
    code === 3001 ||
    code === 3004 ||
    status === 400 ||
    status === 404
  ) {
    return hithinkError("invalid_input", detail, 400);
  }
  if (code === 5001 || code === 5002 || code === 5003) {
    return hithinkError("provider_error", detail, 502);
  }
  return hithinkError("provider_error", detail, status >= 500 ? 502 : 503);
}

function readInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function hithinkError(code: string, message: string, status: number): ProviderRequestError {
  return new ProviderRequestError(status, message, { code });
}
