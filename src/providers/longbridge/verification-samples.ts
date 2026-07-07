import type { LongbridgeActionName } from "./actions.ts";

export const longbridgeVerificationSamples: Record<LongbridgeActionName, Record<string, unknown>> = {
  list_securities: {
    market: "US",
    category: "Overnight",
  },
  list_account_cash: {},
  list_stock_positions: {
    symbols: ["AAPL.US"],
  },
  get_market_temperature: {
    market: "US",
  },
  list_market_temperature: {
    market: "US",
    startDate: "20260101",
    endDate: "20260131",
  },
  list_filings: {
    symbol: "AAPL.US",
  },
  list_news: {
    symbol: "AAPL.US",
  },
  list_watchlist_groups: {},
  list_cash_flow: {
    page: 1,
    size: 20,
  },
  list_fund_positions: {},
  list_history_executions: {
    page: 1,
  },
  get_order_detail: {
    orderId: "replace-with-real-order-id",
  },
  estimate_max_buy_quantity: {
    symbol: "AAPL.US",
    orderType: "LO",
    side: "Buy",
    price: "100",
    market: "US",
  },
  list_history_orders: {
    page: 1,
    size: 20,
  },
  list_today_executions: {
    symbol: "AAPL.US",
  },
  list_today_orders: {
    symbol: "AAPL.US",
    page: 1,
    size: 20,
  },
  market_status: {},
  broker_holding: {
    symbol: "700.HK",
    period: "rct_5",
  },
  broker_holding_detail: {
    symbol: "700.HK",
  },
  broker_holding_daily: {
    symbol: "700.HK",
    brokerId: "1",
  },
  ah_premium: {
    symbol: "939.HK",
    period: "day",
    count: 10,
  },
  ah_premium_intraday: {
    symbol: "700.HK",
  },
  trade_stats: {
    symbol: "AAPL.US",
  },
  anomaly: {
    market: "US",
  },
  market_stock_events: {
    markets: ["US"],
    limit: 20,
    sort: 2,
    date: "2026-07-07",
  },
  constituent: {
    symbol: "HSI.HK",
  },
  finance_calendar: {
    categories: ["report"],
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    symbols: ["AAPL.US"],
    market: "US",
    count: 20,
  },
  rank_categories: {},
  rank_list: {
    key: "hot_all-us",
    needArticle: false,
    market: "US",
    size: 10,
  },
  short_positions: {
    symbol: "AAPL.US",
    count: 10,
  },
  short_trades: {
    symbol: "AAPL.US",
    count: 10,
  },
  short_margin: {},
  option_volume: {
    symbol: "AAPL.US",
  },
  option_volume_daily: {
    symbol: "AAPL.US",
  },
  financial_report: {
    symbol: "AAPL.US",
    kind: "IS",
    period: "af",
  },
  financial_report_latest: {
    symbol: "AAPL.US",
  },
  financial_report_snapshot: {
    symbol: "AAPL.US",
    report: "qf",
    fiscalYear: 2026,
    fiscalPeriod: "2",
  },
  financial_statement: {
    symbol: "AAPL.US",
    kind: "IS",
    period: "af",
  },
  dividend: {
    symbol: "AAPL.US",
    page: 1,
    size: 20,
  },
  dividend_detail: {
    symbol: "AAPL.US",
  },
  forecast_eps: {
    symbol: "AAPL.US",
  },
  consensus: {
    symbol: "AAPL.US",
  },
  valuation: {
    symbol: "AAPL.US",
  },
  valuation_history: {
    symbol: "AAPL.US",
    indicator: "pe",
  },
  valuation_rank: {
    symbol: "AAPL.US",
    startDate: "20260701",
    endDate: "20260731",
  },
  valuation_comparison: {
    symbol: "AAPL.US",
    currency: "USD",
    comparisonSymbols: ["MSFT.US", "GOOGL.US"],
  },
  industry_valuation: {
    symbol: "AAPL.US",
    currency: "USD",
  },
  industry_valuation_dist: {
    symbol: "AAPL.US",
  },
  industry_peers: {
    symbol: "AAPL.US",
    market: "US",
  },
  company: {
    symbol: "AAPL.US",
  },
  executive: {
    symbol: "AAPL.US",
  },
  shareholder: {
    symbol: "AAPL.US",
    range: "1",
    sortField: "holding_ratio",
    sortOrder: "desc",
  },
  shareholder_top: {
    symbol: "AAPL.US",
  },
  shareholder_detail: {
    symbol: "AAPL.US",
    objectId: 1,
  },
  fund_holder: {
    symbol: "AAPL.US",
    limit: 20,
  },
  corp_action: {
    symbol: "AAPL.US",
  },
  invest_relation: {
    symbol: "AAPL.US",
  },
  operating: {
    symbol: "AAPL.US",
    report: "af",
  },
  business_segments: {
    symbol: "AAPL.US",
  },
  business_segments_history: {
    symbol: "AAPL.US",
    report: "af",
    category: "product",
  },
  buyback: {
    symbol: "AAPL.US",
  },
  institution_rating: {
    symbol: "AAPL.US",
  },
  institution_rating_detail: {
    symbol: "AAPL.US",
  },
  institution_rating_history: {
    symbol: "AAPL.US",
  },
  institution_rating_industry_rank: {
    symbol: "AAPL.US",
  },
  institutional_views: {
    symbol: "AAPL.US",
  },
  stock_ratings: {
    symbol: "AAPL.US",
  },
  stock_rating_history: {
    symbol: "AAPL.US",
  },
  news: {
    symbol: "AAPL.US",
  },
  screener_indicators: {},
  screener_search: {
    market: "US",
    conditions: [{ key: "pettm", min: "10", max: "50" }],
    extraReturns: ["marketcap"],
    sortByKey: "pettm",
    page: 0,
    size: 5,
  },
  screener_recommend_strategies: {
    market: "US",
  },
  screener_user_strategies: {
    market: "US",
  },
  screener_strategy: {
    id: 1,
  },
  exchange_rate: {},
  profit_analysis: {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  },
  profit_analysis_detail: {
    symbol: "AAPL.US",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  },
  profit_analysis_by_market: {
    market: "US",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    currency: "USD",
  },
  profit_analysis_flows: {
    symbol: "AAPL.US",
    page: 1,
    size: 20,
    derivative: false,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  },
  profit_analysis_sublist: {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  },
};

export const longbridgeVerificationSampleNotes: Partial<Record<LongbridgeActionName, string>> = {
  get_order_detail: "Override orderId with a real order ID to verify a successful detail response.",
  screener_strategy: "Override id with a real screener strategy ID if strategy 1 is not visible.",
  shareholder_detail: "Override objectId with an object_id returned by shareholder_top for the same symbol.",
};
