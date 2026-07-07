import type { OAuthProviderContext } from "../provider-runtime.ts";

import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { longbridgeActions } from "./actions.ts";
import { longbridgeActionHandlers, requestLongbridgeJson, validateLongbridgeCredential } from "./runtime.ts";
import { longbridgeVerificationSamples } from "./verification-samples.ts";

describe("Longbridge runtime", () => {
  it("keeps action definitions and runtime handlers in sync for the readonly REST expansion", () => {
    const actionNames = longbridgeActions.map((action) => action.name);
    const handlerNames = Object.keys(longbridgeActionHandlers);

    expect(actionNames.length).toBeGreaterThanOrEqual(60);
    expect(new Set(actionNames).size).toBe(actionNames.length);
    expect(handlerNames.toSorted()).toEqual(actionNames.toSorted());
    expect(actionNames).toEqual(
      expect.arrayContaining([
        "get_market_temperature",
        "list_market_temperature",
        "list_filings",
        "list_news",
        "list_watchlist_groups",
        "list_cash_flow",
        "list_fund_positions",
        "list_history_executions",
        "get_order_detail",
        "estimate_max_buy_quantity",
        "list_history_orders",
        "list_today_executions",
        "list_today_orders",
        "financial_report",
        "institution_rating",
        "market_status",
        "news",
        "rank_list",
        "profit_analysis",
        "screener_search",
      ]),
    );
    expect(actionNames).not.toEqual(
      expect.arrayContaining([
        "statement_list",
        "statement_export",
        "topic",
        "topic_search",
        "topic_detail",
        "topic_replies",
        "topic_create",
        "topic_create_reply",
        "news_search",
      ]),
    );
  });

  it("does not expose the unstable IPO readonly actions", () => {
    const actionNames = longbridgeActions.map((action) => action.name);
    expect(actionNames.filter((name) => name.startsWith("ipo_"))).toEqual([]);
  });

  it("has sample inputs that exercise every Longbridge action handler", async () => {
    const actionNames = longbridgeActions.map((action) => action.name).toSorted();
    const sampleNames = Object.keys(longbridgeVerificationSamples).toSorted();
    expect(sampleNames).toEqual(actionNames);

    const calls: FetchCall[] = [];
    const context = createContext(calls, createUniversalLongbridgePayload());
    for (const actionName of actionNames) {
      await callLongbridgeAction(actionName, longbridgeVerificationSamples[actionName] ?? {}, context);
    }

    expect(calls).toHaveLength(actionNames.length);
    expect(calls.every((call) => call.url.startsWith("https://openapi.longbridge.com/v1/"))).toBe(true);
  });

  it("sends bearer authorization, user agent, and repeated array query parameters", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        list: [{ symbol: "AAPL.US" }],
      },
    });

    const result = await longbridgeActionHandlers.list_stock_positions(
      {
        symbols: ["AAPL.US", "700.HK"],
      },
      context,
    );

    expect(result).toMatchObject({
      positionGroups: [{ symbol: "AAPL.US" }],
    });
    expect(calls).toHaveLength(1);
    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(requestUrl.toString()).toBe("https://openapi.longbridge.com/v1/asset/stock?symbol=AAPL.US&symbol=700.HK");
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.headers).toMatchObject({
      accept: "application/json",
      authorization: "Bearer test-token",
      "user-agent": "oomol-connect/0.1",
    });
  });

  it("serializes JSON bodies for non-GET requests", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      ok: true,
    });

    await requestLongbridgeJson({
      method: "POST",
      path: "/v1/example",
      context,
      phase: "execute",
      query: { market: "US" },
      body: { name: "Growth" },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/example?market=US");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.headers).toMatchObject({
      accept: "application/json",
      authorization: "Bearer test-token",
      "content-type": "application/json",
      "user-agent": "oomol-connect/0.1",
    });
    expect(calls[0]?.init.body).toBe('{"name":"Growth"}');
  });

  it("maps Longbridge HTTP errors to provider request errors", async () => {
    const context = createContext(
      [],
      {
        error_description: "token expired",
      },
      { status: 403 },
    );

    await expect(longbridgeActionHandlers.list_account_cash({}, context)).rejects.toMatchObject({
      status: 403,
      message: "token expired",
    });
  });

  it("returns invalid JSON response text as error details", async () => {
    const context = createTextContext("temporarily unavailable", { status: 502 });

    await expect(
      requestLongbridgeJson({
        method: "GET",
        path: "/v1/example",
        context,
        phase: "execute",
      }),
    ).rejects.toMatchObject({
      status: 502,
      details: {
        message: "temporarily unavailable",
      },
    });
  });

  it("validates credentials with account cash and preserves metadata", async () => {
    const calls: FetchCall[] = [];
    const fetcher = createFetch(calls, {
      data: {
        list: [{ currency: "USD" }, { currency: "HKD" }],
      },
    });

    const result = await validateLongbridgeCredential("credential-token", fetcher);

    expect(result).toMatchObject({
      profile: {
        accountId: "longbridge:account",
        displayName: "Longbridge account",
        grantedScopes: ["4", "6", "10", "11"],
      },
      grantedScopes: ["4", "6", "10", "11"],
      metadata: {
        apiBaseUrl: "https://openapi.longbridge.com",
        validationEndpoint: "/v1/asset/account",
        primaryCurrency: "USD",
        balanceCount: 2,
      },
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/asset/account");
  });

  it("throws when a list response is missing data.list", async () => {
    const context = createContext([], {
      data: {},
    });

    await expect(
      longbridgeActionHandlers.list_securities({ market: "US", category: "Overnight" }, context),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });

  it("builds the current market temperature request", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        temperature: 61,
      },
    });

    const result = await longbridgeActionHandlers.get_market_temperature({ market: "US" }, context);

    expect(result).toMatchObject({
      temperature: {
        temperature: 61,
      },
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/quote/market_temperature?market=US");
  });

  it("encodes the symbol path segment for symbol news", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        items: [{ id: "news-1" }],
      },
    });

    const result = await longbridgeActionHandlers.list_news({ symbol: "BRK B.US" }, context);

    expect(result).toMatchObject({
      news: [{ id: "news-1" }],
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/content/BRK%20B.US/news");
  });

  it("builds the readonly symbol news request instead of keyword news search", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        items: [{ id: "news-1" }],
      },
    });

    const result = await callLongbridgeAction("news", { symbol: "BRK B.US" }, context);

    expect(result).toMatchObject({
      news: [{ id: "news-1" }],
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/content/BRK%20B.US/news");
  });

  it("builds fund position requests with repeated symbol filters", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        list: [{ account_channel: "fund" }],
      },
    });

    const result = await longbridgeActionHandlers.list_fund_positions(
      {
        symbols: ["HK0000676533", "HK0000000001"],
      },
      context,
    );

    expect(result).toMatchObject({
      positionGroups: [{ account_channel: "fund" }],
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/asset/fund?symbol=HK0000676533&symbol=HK0000000001");
  });

  it("builds historical order requests with repeated status filters", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        orders: [{ order_id: "order-1" }],
        has_more: false,
      },
    });

    const result = await longbridgeActionHandlers.list_history_orders(
      {
        startAt: 1770000000,
        endAt: 1770000600,
        market: "US",
        side: "Buy",
        statuses: ["FilledStatus", "CanceledStatus"],
        page: 2,
        size: 50,
      },
      context,
    );

    expect(result).toMatchObject({
      orders: [{ order_id: "order-1" }],
    });
    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/trade/order/history?start_at=1770000000&end_at=1770000600&market=US&side=Buy&status=FilledStatus&status=CanceledStatus&page=2&size=50",
    );
  });

  it("builds the financial report request with symbol counter conversion", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        report: { counter_id: "ST/US/AAPL" },
      },
    });

    const result = await callLongbridgeAction(
      "financial_report",
      {
        symbol: "AAPL.US",
        kind: "IS",
        period: "af",
      },
      context,
    );

    expect(result).toMatchObject({
      report: { counter_id: "ST/US/AAPL" },
    });
    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/financial-reports?kind=IS&counter_id=ST%2FUS%2FAAPL&report=af",
    );
  });

  it("builds the financial report request with the CLI kind default", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        report: { counter_id: "ST/US/AAPL" },
      },
    });

    await callLongbridgeAction("financial_report", { symbol: "AAPL.US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/financial-reports?kind=ALL&counter_id=ST%2FUS%2FAAPL",
    );
  });

  it("builds the dividend request with Longbridge stock counter_id format", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        list: [{ counter_id: "ST/US/AAPL" }],
      },
    });

    const result = await callLongbridgeAction("dividend", { symbol: "AAPL.US" }, context);

    expect(result).toMatchObject({
      dividends: [{ counter_id: "ST/US/AAPL" }],
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/quote/dividends?counter_id=ST%2FUS%2FAAPL");
  });

  it("builds the financial statement request with CLI statement defaults", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        list: [{ id: "statement" }],
      },
    });

    await callLongbridgeAction("financial_statement", { symbol: "AAPL.US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/financials/statements?kind=IS&report=af&counter_id=ST%2FUS%2FAAPL",
    );
  });

  it("uses simplified symbol counter_id conversion without ETF or warrant lookup data", async () => {
    const cases = [
      ["SPY.US", "ST/US/SPY"],
      ["QQQ.US", "ST/US/QQQ"],
      ["DRAM.US", "ST/US/DRAM"],
      ["SPY.us", "ST/US/SPY"],
      [".DJI.US", "IX/US/.DJI"],
      [".VIX.US", "IX/US/.VIX"],
      ["HSI.HK", "ST/HK/HSI"],
      ["10005.HK", "ST/HK/10005"],
      ["00700.HK", "ST/HK/700"],
      ["000001.SZ", "ST/SZ/000001"],
      ["NODOT", "NODOT"],
    ] as const;

    for (const [symbol, counterId] of cases) {
      const calls: FetchCall[] = [];
      const context = createContext(calls, {
        data: {
          list: [{ counter_id: counterId }],
        },
      });

      await callLongbridgeAction("dividend", { symbol }, context);

      expect(calls[0]?.url).toBe(
        `https://openapi.longbridge.com/v1/quote/dividends?counter_id=${encodeURIComponent(counterId)}`,
      );
    }
  });

  it("builds the latest institution rating request", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        rating: { recommend: "Buy" },
      },
    });

    const result = await callLongbridgeAction("institution_rating", { symbol: "700.HK" }, context);

    expect(result).toMatchObject({
      rating: { rating: { recommend: "Buy" } },
    });
    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/institution-rating-latest?counter_id=ST%2FHK%2F700",
    );
  });

  it("builds the institution rating industry rank request with CLI pagination defaults", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        items: [{ id: "rank" }],
      },
    });

    await callLongbridgeAction("institution_rating_industry_rank", { symbol: "AAPL.US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/institution-ratings/industry-rank?page=1&size=20&counter_id=ST%2FUS%2FAAPL",
    );
  });

  it("builds the market status request", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        markets: [{ market: "US" }],
      },
    });

    const result = await callLongbridgeAction("market_status", {}, context);

    expect(result).toMatchObject({
      status: { markets: [{ market: "US" }] },
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/quote/market-status");
  });

  it("builds short positions by inferring the market path from the symbol", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        data: [],
      },
    });

    await callLongbridgeAction("short_positions", { symbol: "700.HK", count: 10 }, context);

    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://openapi.longbridge.com/v1/quote/short-positions/hk",
    );
    expect(requestUrl.searchParams.get("counter_id")).toBe("ST/HK/700");
    expect(requestUrl.searchParams.get("page_size")).toBe("10");
    expect(requestUrl.searchParams.get("last_timestamp")).toMatch(/^\d+$/);
  });

  it("builds short trades with the MCP page_size default", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        data: [],
      },
    });

    await callLongbridgeAction("short_trades", { symbol: "AAPL.US" }, context);

    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://openapi.longbridge.com/v1/quote/short-trades/us",
    );
    expect(requestUrl.searchParams.get("counter_id")).toBe("ST/US/AAPL");
    expect(requestUrl.searchParams.get("page_size")).toBe("20");
    expect(requestUrl.searchParams.get("last_timestamp")).toMatch(/^\d+$/);
  });

  it("builds option volume daily with MCP timestamp and count defaults", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        stats: [],
      },
    });

    await callLongbridgeAction("option_volume_daily", { symbol: "AAPL.US" }, context);

    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://openapi.longbridge.com/v1/quote/option-volume-stats/daily",
    );
    expect(requestUrl.searchParams.get("counter_id")).toBe("ST/US/AAPL");
    expect(requestUrl.searchParams.get("timestamp")).toMatch(/^\d+$/);
    expect(requestUrl.searchParams.get("line_num")).toBe("20");
    expect(requestUrl.searchParams.get("direction")).toBe("1");
  });

  it("builds the A/H premium intraday request with the SDK day default", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        klines: [{ id: "premium" }],
      },
    });

    await callLongbridgeAction("ah_premium_intraday", { symbol: "700.HK" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/ahpremium/timeshares?days=1&counter_id=ST%2FHK%2F700",
    );
  });

  it("builds the A/H premium kline request with SDK period codes", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        klines: [{ id: "premium" }],
      },
    });

    await callLongbridgeAction(
      "ah_premium",
      {
        symbol: "939.HK",
        period: "day",
        count: 5,
      },
      context,
    );

    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://openapi.longbridge.com/v1/quote/ahpremium/klines",
    );
    expect(requestUrl.searchParams.get("counter_id")).toBe("ST/HK/939");
    expect(requestUrl.searchParams.get("line_type")).toBe("1000");
    expect(requestUrl.searchParams.get("line_num")).toBe("5");
  });

  it("builds the executive request with counter_ids like the SDK", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        professional_list: [{ id: "ceo" }],
      },
    });

    await callLongbridgeAction("executive", { symbol: "AAPL.US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/company-professionals?counter_ids=ST%2FUS%2FAAPL",
    );
  });

  it("builds the industry peers request with SDK fixed parameters", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        peers: [{ id: "peer" }],
      },
    });

    await callLongbridgeAction("industry_peers", { symbol: "AAPL.US", market: "US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/industries/peers?type=1&industry_id=&counter_id=ST%2FUS%2FAAPL&market=US",
    );
  });

  it("builds the valuation request with official defaults", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        metrics: {},
      },
    });

    await callLongbridgeAction("valuation", { symbol: "AAPL.US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/valuation?indicator=pe&range=1&counter_id=ST%2FUS%2FAAPL",
    );
  });

  it("builds the investor relations request with the SDK count default", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        invest_securities: [{ id: "holder" }],
      },
    });

    await callLongbridgeAction("invest_relation", { symbol: "AAPL.US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/invest-relations?count=0&counter_id=ST%2FUS%2FAAPL",
    );
  });

  it("builds the operating request with CLI report parameter", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        list: [{ id: "operating" }],
      },
    });

    await callLongbridgeAction("operating", { symbol: "AAPL.US", report: "af" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/operatings?counter_id=ST%2FUS%2FAAPL&report=af",
    );
  });

  it("builds the business segment history request with SDK optional filters", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        list: [{ id: "segment" }],
      },
    });

    await callLongbridgeAction(
      "business_segments_history",
      {
        symbol: "AAPL.US",
        report: "af",
        category: "product",
      },
      context,
    );

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/fundamentals/business-segments/history?counter_id=ST%2FUS%2FAAPL&report=af&cate=product",
    );
  });

  it("builds the financial report snapshot request with SDK optional filters", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        snapshot: { id: "snapshot" },
      },
    });

    await callLongbridgeAction(
      "financial_report_snapshot",
      {
        symbol: "AAPL.US",
        report: "qf",
        fiscalYear: 2026,
        fiscalPeriod: "2",
      },
      context,
    );

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/financials/earnings-snapshot?counter_id=ST%2FUS%2FAAPL&report=qf&fiscal_year=2026&fiscal_period=2",
    );
  });

  it("builds the finance calendar request with SDK array query parameters", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        list: [{ date: "2026-07-07" }],
      },
    });

    await callLongbridgeAction(
      "finance_calendar",
      {
        categories: ["report", "financial"],
        symbols: ["AAPL.US"],
        market: "US",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
        count: 50,
        star: [3],
      },
      context,
    );

    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://openapi.longbridge.com/v1/quote/finance_calendar",
    );
    expect(requestUrl.searchParams.get("date")).toBe("2026-07-01");
    expect(requestUrl.searchParams.get("date_end")).toBe("2026-07-31");
    expect(requestUrl.searchParams.get("count")).toBe("50");
    expect(requestUrl.searchParams.get("next")).toBe("later");
    expect(requestUrl.searchParams.get("offset")).toBe("0");
    expect(requestUrl.searchParams.getAll("types[]")).toEqual(["report", "financial"]);
    expect(requestUrl.searchParams.getAll("counter_ids[]")).toEqual(["ST/US/AAPL"]);
    expect(requestUrl.searchParams.getAll("markets[]")).toEqual(["US"]);
    expect(requestUrl.searchParams.getAll("star[]")).toEqual(["3"]);
  });

  it("builds the market stock events request as the SDK POST body", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        events: [{ id: "event" }],
      },
    });

    await callLongbridgeAction(
      "market_stock_events",
      {
        markets: ["US"],
        limit: 20,
        sort: 2,
        date: "2026-07-07",
      },
      context,
    );

    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/quote/market/stock-events");
    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"next_params":{},"date":"2026-07-07","limit":20,"sort":2,"markets":["US"]}');
  });

  it("builds the anomaly request with MCP count default and optional counter_id", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        changes: [{ id: "change" }],
      },
    });

    await callLongbridgeAction("anomaly", { market: "US", symbol: "AAPL.US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/quote/changes?category=0&size=50&market=US&counter_id=ST%2FUS%2FAAPL",
    );
  });

  it("builds the ranked securities request with article flag", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        lists: [{ symbol: "AAPL.US" }],
      },
    });

    const result = await callLongbridgeAction(
      "rank_list",
      {
        key: "hot_all-us",
        needArticle: true,
      },
      context,
    );

    expect(result).toMatchObject({
      securities: [{ symbol: "AAPL.US" }],
    });
    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://openapi.longbridge.com/v1/quote/market/rank/list",
    );
    expect(requestUrl.searchParams.get("key")).toBe("ib_hot_all-us");
    expect(requestUrl.searchParams.get("delay_bmp")).toBe("false");
    expect(requestUrl.searchParams.get("need_article")).toBe("true");
    expect(requestUrl.searchParams.get("market")).toBe("US");
  });

  it("builds ranked securities with MCP defaults and market inferred from key", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        lists: [{ symbol: "700.HK" }],
      },
    });

    await callLongbridgeAction("rank_list", { key: "hot_all-hk" }, context);

    const requestUrl = new URL(calls[0]?.url ?? "");
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      "https://openapi.longbridge.com/v1/quote/market/rank/list",
    );
    expect(requestUrl.searchParams.get("key")).toBe("ib_hot_all-hk");
    expect(requestUrl.searchParams.get("delay_bmp")).toBe("false");
    expect(requestUrl.searchParams.get("need_article")).toBe("false");
    expect(requestUrl.searchParams.get("market")).toBe("HK");
    expect(requestUrl.searchParams.get("size")).toBe("20");
  });

  it("builds the profit analysis request", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        total_pl: "12.34",
      },
    });

    const result = await callLongbridgeAction(
      "profit_analysis",
      {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
      context,
    );

    expect(result).toMatchObject({
      analysis: { total_pl: "12.34" },
    });
    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/portfolio/profit-analysis-summary?start=1767225600&end=1769903999",
    );
  });

  it("builds profit analysis flows with Unix date filters like the CLI", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        flows: [{ id: "flow" }],
      },
    });

    await callLongbridgeAction(
      "profit_analysis_flows",
      {
        symbol: "AAPL.US",
        page: 1,
        size: 20,
        derivative: false,
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      },
      context,
    );

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/portfolio/profit-analysis/flows?counter_id=ST%2FUS%2FAAPL&page=1&size=20&derivative=false&start=1767225600&end=1769903999",
    );
  });

  it("builds profit analysis by market with CLI pagination defaults", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        stock_items: [{ market: "US" }],
      },
    });

    await callLongbridgeAction("profit_analysis_by_market", { market: "US" }, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/portfolio/profit-analysis/by-market?page=1&size=50&market=US",
    );
  });

  it("builds profit analysis sublist with SDK profit/loss default", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        stock_items: [{ symbol: "AAPL.US" }],
      },
    });

    await callLongbridgeAction("profit_analysis_sublist", {}, context);

    expect(calls[0]?.url).toBe(
      "https://openapi.longbridge.com/v1/portfolio/profit-analysis-sublist?profit_or_loss=all",
    );
  });

  it("builds the screener search request body", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        items: [{ symbol: "AAPL.US" }],
      },
    });

    const result = await callLongbridgeAction(
      "screener_search",
      {
        market: "US",
        conditions: [{ key: "pettm", min: "10", max: "50" }],
        extraReturns: ["marketcap"],
        sortByKey: "pettm",
        page: 0,
        size: 5,
      },
      context,
    );

    expect(result).toMatchObject({
      results: [{ symbol: "AAPL.US" }],
    });
    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/quote/ai/screener/search");
    expect(calls[0]?.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      market: "US",
      filters: [{ key: "filter_pettm", min: "10", max: "50", tech_values: {} }],
      returns: [
        "filter_pettm",
        "filter_marketcap",
        "filter_prevclose",
        "filter_prevchg",
        "filter_salesgrowthyoy",
        "filter_pbmrq",
        "filter_industry",
      ],
      sort_by: 0,
      sort_order: 1,
      industries: [],
      page: 0,
      size: 5,
    });
  });

  it("builds the screener search request with MCP body defaults", async () => {
    const calls: FetchCall[] = [];
    const context = createContext(calls, {
      data: {
        items: [],
      },
    });

    await callLongbridgeAction("screener_search", {}, context);

    expect(calls[0]?.url).toBe("https://openapi.longbridge.com/v1/quote/ai/screener/search");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      market: "US",
      filters: [],
      returns: [
        "filter_prevclose",
        "filter_prevchg",
        "filter_marketcap",
        "filter_salesgrowthyoy",
        "filter_pettm",
        "filter_pbmrq",
        "filter_industry",
      ],
      sort_by: 0,
      sort_order: 1,
      industries: [],
      page: 0,
      size: 20,
    });
  });
});

interface FetchCall {
  url: string;
  init: RequestInit;
}

function createContext(calls: FetchCall[], payload: unknown, init?: ResponseInit): OAuthProviderContext {
  return {
    accessToken: "test-token",
    fetcher: createFetch(calls, payload, init),
  };
}

function createTextContext(text: string, init?: ResponseInit): OAuthProviderContext {
  return {
    accessToken: "test-token",
    fetcher: async () => new Response(text, init),
  };
}

async function callLongbridgeAction(
  name: string,
  input: Record<string, unknown>,
  context: OAuthProviderContext,
): Promise<unknown> {
  const handlers = longbridgeActionHandlers as Record<
    string,
    (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>
  >;
  return handlers[name]?.(input, context);
}

function createFetch(calls: FetchCall[], payload: unknown, init?: ResponseInit): typeof fetch {
  return async (url, requestInit) => {
    calls.push({
      url: url.toString(),
      init: normalizeRequestInit(requestInit),
    });
    return new Response(JSON.stringify(payload), init);
  };
}

function createUniversalLongbridgePayload(): unknown {
  return {
    data: {
      list: [{ id: "list-item" }],
      items: [{ id: "item" }],
      groups: [{ id: "group" }],
      trades: [{ id: "trade" }],
      orders: [{ id: "order" }],
      news_list: [{ id: "news" }],
      changes: [{ id: "change" }],
      lists: [{ id: "ranked-security" }],
      data: [{ id: "nested-data-item" }],
      report: { id: "report" },
      temperature: 61,
      total_pl: "0",
      rate: "1",
    },
  };
}

function normalizeRequestInit(input: RequestInit | undefined): RequestInit {
  if (!input) {
    return {};
  }
  return {
    ...input,
    headers: input.headers ? Object.fromEntries(new Headers(input.headers).entries()) : undefined,
  };
}
