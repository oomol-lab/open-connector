import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { looseArray, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  defaultProviderJsonMaxResponseBytes,
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "zyhub";
const baseUrl = "https://mcp.finance.sina.com.cn/api-call/";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type Operation = { code: string; query?: (input: Record<string, unknown>) => Record<string, unknown> };

const operations: Record<string, Operation> = {
  search_symbols: {
    code: "globalStockSearchSymbols",
    query: (i) => ({ type: i.marketTypes, key: i.query, format: "text", num: 4 }),
  },
  get_stock_quote: { code: "globalStockQuoteRealtime", query: (i) => pick(i, { market: "market", symbol: "symbol" }) },
  get_daily_kline: {
    code: "globalStockKlineDaily",
    query: (i) => ({
      market: i.market,
      symbol: i.symbol,
      fq_type: i.adjustment,
      compare: i.comparison,
      in_date: i.date,
      num: i.limit,
    }),
  },
  get_company_profile: { code: "cnCompanyBasicInfo", query: symbol },
  get_forex_quote: { code: "forexQuoteLatest", query: symbol },
  search_news: { code: "newsSearch", query: (i) => ({ keyword: join(i.keywords), page: i.page, num: i.pageSize }) },
  get_intraday_kline: {
    code: "cnStockKLine",
    query: (i) => ({ symbol: i.symbol, scale: i.intervalMinutes, datalen: i.limit }),
  },
  list_financial_report_dates: { code: "cnFinanceReportDateList", query: (i) => ({ paperCode: i.symbol }) },
  get_financial_report: {
    code: "cnFinanceReportsFull",
    query: (i) => ({
      paperCode: i.symbol,
      source: map(i.reportType, {
        income_statement: "lrb",
        balance_sheet: "fzb",
        cash_flow: "llb",
        key_indicators: "gjzb",
        special_indicators: "zxzb",
      }),
      rDate: i.reportDate,
    }),
  },
  get_revenue_composition: {
    code: "cnFinanceRevenueComposition",
    query: (i) => ({ paperCode: i.symbol, frDate: i.reportDate }),
  },
  get_valuation_history: {
    code: "cnStockValuationDetail",
    query: (i) => ({
      symbol: i.symbol,
      rank: map(i.period, { "1y": "y1", "3y": "y3", "5y": "y5", "10y": "y10", all: "all" }),
      type: map(i.metric, { pe_ttm: "syl", pb: "sjl", pcf: "sxl", dividend_yield: "gxl", market_cap: "zsz" }),
    }),
  },
  get_major_events: {
    code: "globalStockMajorEvents",
    query: (i) => ({ market: map(i.market, { cn: "0", hk: "1", us: "2" }), symbols: i.symbol, pageSize: i.limit }),
  },
  get_margin_trading: { code: "cnStockTradingMarginList", query: pageSymbol },
  get_block_trades: { code: "cnTradingBlockList", query: pageSymbol },
  list_stock_connect_holdings: {
    code: "cnStockConnectHoldings",
    query: (i) => ({ type: i.channel, sort: i.sortBy, asc: direction(i.sortDirection), page: i.page, num: i.pageSize }),
  },
  get_stock_industry: { code: "swSymbolList", query: symbol },
  list_sector_rankings: {
    code: "cnVirtualSectorRanking",
    query: (i) => ({
      index_type: map(i.sectorType, {
        all: "",
        shenwan_level_1: "hy1",
        shenwan_level_2: "hy",
        shenwan_level_3: "hy3",
        concept: "gn",
        region: "dy",
      }),
      sort: i.sortBy,
      asc: direction(i.sortDirection),
      page: i.page,
      num: i.pageSize,
    }),
  },
  get_sector_constituents: {
    code: "cnSectorComponentsRanking",
    query: (i) => ({
      node: i.sectorSymbol,
      ret: join(i.fields),
      sort: i.sortBy,
      asc: direction(i.sortDirection),
      page: i.page,
      num: i.pageSize,
      hnew: flag(i.includeNewStocks),
      hcnew: flag(i.includeRecentStocks),
    }),
  },
  list_strong_sectors: {
    code: "cnMarketStrongSectors",
    query: (i) => ({
      type: map(i.boardGroup, { all: "all", growth: "ck", other: "other" }),
      bk: map(i.sectorType, { concept: "gn", industry: "hy", region: "dy" }),
      isNotSt: flag(i.excludeSt),
    }),
  },
  list_limit_up_stocks: { code: "cnMarketLimitUpPool" },
  list_consecutive_limit_up_stocks: { code: "cnStockLianBC" },
  list_hot_stocks: {
    code: "globalStockHotBoard",
    query: (i) => ({ type: map(i.period, { day: "d", hour: "h" }), market: i.market, page: i.page, num: i.pageSize }),
  },
  get_batch_forex_quotes: {
    code: "forexQuotesBatch",
    query: (i) => ({ from: i.baseCurrency, to: join(i.targetCurrencies) }),
  },
  get_futures_quote: {
    code: "future_quotes",
    query: (i) => ({ market: map(i.market, { domestic: "gn", global: "global", financial: "cff" }), symbol: i.symbol }),
  },
  search_stock_news: {
    code: "stockNewsSearch",
    query: (i) => ({ market: i.market, symbol: i.symbol, page: i.page, num: i.pageSize }),
  },
  search_flash_news: {
    code: "qNewsSearch",
    query: (i) => ({ keyword: join(i.keywords), page: i.page, num: i.pageSize }),
  },
  list_flash_news: {
    code: "newsFlashList",
    query: (i) => ({
      id: i.documentId,
      type: map(i.direction, { after: "0", before: "1" }),
      page: i.page,
      num: i.pageSize,
    }),
  },
  get_news_article: { code: "newsArticleDetail", query: (i) => ({ docid: i.documentId }) },
  get_fund_profile: { code: "fund_info", query: symbol },
  get_fund_net_values: { code: "fund_networth", query: symbol },
  get_fund_returns: { code: "fund_cum_return", query: symbol },
  get_fund_metrics: { code: "fund_core_metrics", query: symbol },
  get_fund_stock_holdings: { code: "fund_heavy_stock", query: pageSymbol },
  get_fund_industry_allocation: { code: "fund_industry_alloc", query: symbol },
  get_fund_asset_allocation: { code: "fund_asset_alloc", query: symbol },
  get_fund_manager: { code: "fund_manager_detail", query: (i) => ({ pscode: i.managerCode }) },
};

const handlers = Object.fromEntries(
  Object.entries(operations).map(([name, operation]) => [
    name,
    (input: Record<string, unknown>, context: ApiKeyProviderContext) => execute(operation, input, context),
  ]),
) as ProviderActionHandlers<"zyhub", Handler>;
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, context) {
    await request("cnMarketUpdownDistribution", {}, input.apiKey, context.fetcher, context.signal, true);
    return {
      profile: { accountId: "zyhub-api-key", displayName: "Sina Finance ZYHub API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "cnMarketUpdownDistribution" },
    };
  },
};
async function execute(operation: Operation, input: Record<string, unknown>, context: ApiKeyProviderContext) {
  return {
    response: await request(
      operation.code,
      operation.query?.(input) ?? {},
      context.apiKey,
      context.fetcher,
      context.signal,
      false,
    ),
  };
}
async function request(
  code: string,
  query: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal: AbortSignal | undefined,
  validating: boolean,
) {
  return runProviderRequest({ signal: parentSignal, label: "Sina Finance ZYHub" }, async (signal) => {
    const url = new URL(code, baseUrl);
    for (const [key, value] of Object.entries(query)) if (value != null) url.searchParams.set(key, String(value));
    const response = await fetcher(url, {
      headers: { accept: "application/json", "user-agent": providerUserAgent, "X-Auth-Token": apiKey },
      signal,
    });
    const text =
      code === "globalStockSearchSymbols" && response.ok
        ? new TextDecoder("gb18030").decode(
            await readBoundedResponseBytes(response, {
              maxBytes: defaultProviderJsonMaxResponseBytes,
              fieldName: "ZYHub response",
              createError: (message) => new ProviderRequestError(413, message),
            }),
          )
        : await readProviderTextBody(response, "ZYHub response");
    const payload = parse(text);
    if (!response.ok) {
      const message = errorMessage(payload) ?? `ZYHub request failed with status ${response.status}`;
      if (response.status === 429) throw new ProviderRequestError(429, message, payload);
      if (validating && response.status === 401) throw new ProviderRequestError(400, message, payload);
      throw new ProviderRequestError(response.status, message, payload);
    }
    return payload;
  });
}
function parse(text: string) {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
function errorMessage(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  const body = optionalRecord(value);
  return optionalString(body?.message) ?? optionalString(body?.msg) ?? optionalString(body?.error);
}
function map(value: unknown, values: Record<string, string>) {
  const key = optionalString(value);
  return key == null ? undefined : values[key];
}
function direction(value: unknown) {
  return map(value, { desc: "0", asc: "1" });
}
function flag(value: unknown) {
  const result = optionalBoolean(value);
  return result == null ? undefined : result ? 1 : 0;
}
function join(value: unknown) {
  return value == null ? undefined : looseArray(value).join(",");
}
function symbol(input: Record<string, unknown>) {
  return { symbol: optionalString(input.symbol) };
}
function pageSymbol(input: Record<string, unknown>) {
  return {
    symbol: optionalString(input.symbol),
    page: optionalInteger(input.page),
    num: optionalInteger(input.pageSize),
  };
}
function pick(input: Record<string, unknown>, fields: Record<string, string>) {
  return Object.fromEntries(Object.entries(fields).map(([to, from]) => [to, input[from]]));
}
