import type { FutunnActionInput } from "./transport.ts";

import { optionalNumber, optionalRecord } from "../../core/cast.ts";
import { ProviderRequestError, requiredInputString, requiredResponseRecord } from "../provider-runtime.ts";
import { futunnResearchActions } from "./actions.research.ts";
import { readFutunnData, readFutunnList, requestFutunn } from "./transport.ts";

const researchNames = new Set<string>(futunnResearchActions.map((action) => action.name));
export function isFutunnResearchAction(name: string): boolean {
  return researchNames.has(name);
}

export async function executeFutunnResearchAction(input: FutunnActionInput, fetcher: typeof fetch): Promise<unknown> {
  const v = input.input;
  const request = (path: string, query?: Record<string, unknown>, body?: unknown, allowNoData = false) =>
    requestFutunn(input, fetcher, path, query, body, allowNoData);
  const securityPath = (suffix: string) =>
    `/api/v1.0/quote/${encodeURIComponent(requiredInputString(v.symbol, "symbol"))}/${suffix}`;
  switch (input.actionName) {
    case "search_news":
    case "search_community": {
      const news = input.actionName === "search_news";
      const envelope = await request(`/api/v1.0/quote/${news ? "find-news" : "find-community"}`, {
        symbol: v.keyword,
        size: v.size,
        [news ? "news_type" : "community_type"]: v.type,
        sort_type: v.sortType,
        lang: v.language,
      });
      return { items: readFutunnList(readFutunnData(envelope), "search results") };
    }
    case "get_security_info": {
      const data = requiredResponseRecord(
        readFutunnData(await request("/api/v1.0/quote/stock-basicinfo", {}, { code_list: v.symbols })),
        "Futunn security info",
      );
      return { securities: readFutunnList(data.basic_list, "basic_list") };
    }
    case "get_market_state": {
      const data = requiredResponseRecord(
        readFutunnData(
          await request(
            "/api/v1.0/quote/market-state",
            {},
            {
              code_list: v.symbols,
              is_contain_ba: v.includePreAfterMarket,
              is_contain_overnight: v.includeOvernight,
              is_need_crypto_multi_broker: v.includeCryptoBrokers,
            },
          ),
        ),
        "Futunn market state",
      );
      return { states: readFutunnList(data.market_state_list, "market_state_list") };
    }
    case "screen_stocks": {
      const envelope = await request(
        "/api/v1.0/quote/stock-screen",
        {},
        {
          screen_queries: v.screenQueries,
          retrieve_queries: v.retrieveQueries,
          sort: v.sort,
          sorts: v.sorts,
          next_key: v.nextKey,
          limit: v.limit,
          watchlist_stock_ids: v.watchlistStockIds,
          holding_stock_ids: v.holdingStockIds,
          user_stock_list_mode: v.userStockListMode,
        },
      );
      const data = requiredResponseRecord(readFutunnData(envelope), "Futunn screening data");
      return {
        items: readFutunnList(data.items, "screening items"),
        pagination: optionalRecord(envelope.pagination) ?? null,
      };
    }
    case "get_financial_statements": {
      const envelope = await request(
        securityPath("financials/statements"),
        {
          statement_type: v.statementType,
          financial_type: v.financialType,
          currency_code: v.currencyCode,
          next_key: v.nextKey,
          limit: v.limit,
        },
        undefined,
        true,
      );
      const noData = envelope.ret_code === -10;
      const data = noData ? null : requiredResponseRecord(readFutunnData(envelope), "Futunn financial statements");
      return {
        reports: data === null ? [] : readFutunnList(data.report_list, "report_list"),
        pagination: optionalRecord(envelope.pagination) ?? null,
        noData,
      };
    }
    case "get_revenue_breakdown": {
      const envelope = await request(
        securityPath("financials/revenue-breakdown"),
        { date: v.date, financial_type: v.financialType, currency_code: v.currencyCode },
        undefined,
        true,
      );
      const noData = envelope.ret_code === -10;
      return {
        revenue: noData ? null : requiredResponseRecord(readFutunnData(envelope), "Futunn revenue breakdown"),
        noData,
      };
    }
    case "get_operational_efficiency": {
      const envelope = await request(
        securityPath("company/operational-efficiency"),
        {
          limit: v.limit,
          financial_type: v.financialType,
          currency_code: v.currencyCode,
          next_key: v.nextKey,
        },
        undefined,
        true,
      );
      const noData = envelope.ret_code === -10;
      return {
        efficiency: noData ? null : requiredResponseRecord(readFutunnData(envelope), "Futunn operational efficiency"),
        pagination: optionalRecord(envelope.pagination) ?? null,
        noData,
      };
    }
    case "get_valuation":
      return {
        valuation: requiredResponseRecord(
          readFutunnData(
            await request(securityPath("valuation/detail"), {
              valuation_type: v.valuationType,
              interval_type: v.intervalType,
            }),
          ),
          "Futunn valuation",
        ),
      };
    case "get_capital_flow": {
      const data = requiredResponseRecord(
        readFutunnData(await request(securityPath("capital-flow"), { section: v.section })),
        "Futunn capital flow",
      );
      return {
        flows: readFutunnList(data.flow_list, "flow_list"),
        lastValidTime: optionalNumber(data.last_valid_time) ?? null,
      };
    }
    case "get_capital_flow_history": {
      const envelope = await request(securityPath("capital-flow/history"), {
        period_type: v.periodType,
        start: v.start,
        end: v.end,
        count: v.count,
      });
      const data = requiredResponseRecord(readFutunnData(envelope), "Futunn capital flow history");
      return {
        flows: readFutunnList(data.flow_list, "flow_list"),
        pagination: optionalRecord(envelope.pagination) ?? null,
      };
    }
    case "get_capital_distribution": {
      const envelope = await request(securityPath("capital-distribution"), {}, undefined, true);
      const noData = envelope.ret_code === -10;
      return {
        distribution: noData ? null : requiredResponseRecord(readFutunnData(envelope), "Futunn capital distribution"),
        noData,
      };
    }
    default:
      throw new ProviderRequestError(400, `Unknown Futunn research action: ${input.actionName}`);
  }
}
