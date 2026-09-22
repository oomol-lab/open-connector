import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zyhub";
const responseSchema = s.object("The response returned by Sina Finance ZYHub.", {
  response: s.unknown("The upstream JSON value or text returned by the selected ZYHub API."),
});
const aShareSymbol = s.nonEmptyString("The A-share symbol with an sh or sz prefix, such as sh600519.", {
  pattern: "^(sh|sz)[0-9]{6}$",
});
const fundSymbol = s.nonEmptyString("The six-digit fund code, such as 016128.", {
  pattern: "^[0-9]{6}$",
});
const page = s.integer("The one-based result page number.", { minimum: 1 });
const pageSize = s.integer("The number of results to return.", { minimum: 1 });

function readAction(name: string, description: string, inputSchema: Record<string, unknown>) {
  return defineProviderAction(service, {
    name,
    description,
    operationType: "read",
    inputSchema,
    outputSchema: responseSchema,
  });
}

function noInputAction(name: string, description: string) {
  return readAction(name, description, s.object("This action does not require input parameters.", {}));
}

function fundAction(name: string, description: string) {
  return readAction(name, description, s.object("The input payload for retrieving fund data.", { symbol: fundSymbol }));
}

export const expandedZyhubActions: ActionDefinition[] = [
  readAction(
    "get_intraday_kline",
    "Get minute-level candlesticks for an A-share, index, or virtual sector.",
    s.object("The input payload for retrieving intraday candlesticks.", {
      symbol: s.nonEmptyString("The A-share, index, or virtual-sector symbol."),
      intervalMinutes: s.stringEnum("The candlestick interval in minutes.", [
        "1",
        "3",
        "5",
        "10",
        "15",
        "30",
        "60",
        "90",
        "120",
        "180",
        "240",
      ]),
      limit: s.integer("The number of candlesticks to return, up to 2000.", {
        minimum: 1,
        maximum: 2000,
      }),
    }),
  ),
  readAction(
    "list_financial_report_dates",
    "List available financial-report dates for an A-share company.",
    s.object("The input payload for listing financial-report dates.", { symbol: aShareSymbol }),
  ),
  readAction(
    "get_financial_report",
    "Get one A-share financial statement or indicator report for a reporting date.",
    s.object("The input payload for retrieving a financial report.", {
      symbol: aShareSymbol,
      reportType: s.stringEnum("The financial-report dataset to retrieve.", [
        "income_statement",
        "balance_sheet",
        "cash_flow",
        "key_indicators",
        "special_indicators",
      ]),
      reportDate: s.string("The reporting date in YYYYMMDD format.", {
        pattern: "^[0-9]{8}$",
      }),
    }),
  ),
  readAction(
    "get_revenue_composition",
    "Get an A-share company's revenue, cost, and gross-margin composition.",
    s.object(
      "The input payload for retrieving revenue composition.",
      {
        symbol: aShareSymbol,
        reportDate: s.string("The optional reporting date in YYYYMMDD format.", {
          pattern: "^[0-9]{8}$",
        }),
      },
      { optional: ["reportDate"] },
    ),
  ),
  readAction(
    "get_valuation_history",
    "Get historical valuation data for an A-share, its industry, and the broad market.",
    s.object("The input payload for retrieving valuation history.", {
      symbol: aShareSymbol,
      period: s.stringEnum("The historical period to retrieve.", ["1y", "3y", "5y", "10y", "all"]),
      metric: s.stringEnum("The valuation metric to retrieve.", [
        "pe_ttm",
        "pb",
        "pcf",
        "dividend_yield",
        "market_cap",
      ]),
    }),
  ),
  readAction(
    "get_major_events",
    "Get major corporate events for an A-share, Hong Kong, or US-listed company.",
    s.object("The input payload for retrieving major corporate events.", {
      market: s.stringEnum("The market containing the company.", ["cn", "hk", "us"]),
      symbol: s.nonEmptyString("The market-specific stock symbol."),
      limit: pageSize,
    }),
  ),
  readAction(
    "get_margin_trading",
    "Get historical margin-financing and securities-lending data for an A-share.",
    s.object(
      "The input payload for retrieving margin-trading data.",
      { symbol: aShareSymbol, page, pageSize },
      { optional: ["page", "pageSize"] },
    ),
  ),
  readAction(
    "get_block_trades",
    "Get block trades for an A-share company.",
    s.object(
      "The input payload for retrieving block trades.",
      { symbol: aShareSymbol, page, pageSize },
      { optional: ["page", "pageSize"] },
    ),
  ),
  readAction(
    "list_stock_connect_holdings",
    "List Shanghai, Shenzhen, or Hong Kong Stock Connect holdings.",
    s.object(
      "The input payload for listing Stock Connect holdings.",
      {
        channel: s.stringEnum("The Stock Connect channel.", ["hk", "sz", "sh"]),
        sortBy: s.stringEnum("The field used to sort holdings.", [
          "hold_date",
          "hold_num",
          "hold_ratio",
          "close",
          "percent",
          "cur_capital",
          "day1_capital_chg",
          "day5_capital_chg",
          "day10_capital_chg",
          "zf_60",
        ]),
        sortDirection: s.stringEnum("The sort direction.", ["asc", "desc"]),
        page,
        pageSize,
      },
      { optional: ["page", "pageSize"] },
    ),
  ),
  readAction(
    "get_stock_industry",
    "Get the Shenwan level-one, level-two, and level-three industries for an A-share.",
    s.object("The input payload for retrieving Shenwan industry classifications.", {
      symbol: s.nonEmptyString("The six-digit A-share code without a market prefix.", {
        pattern: "^[0-9]{6}$",
      }),
    }),
  ),
  readAction(
    "list_sector_rankings",
    "Rank A-share industries, concepts, or regions by market and fund-flow metrics.",
    s.object(
      "The input payload for ranking A-share sectors.",
      {
        sectorType: s.stringEnum("The sector classification to rank.", [
          "all",
          "shenwan_level_1",
          "shenwan_level_2",
          "shenwan_level_3",
          "concept",
          "region",
        ]),
        sortBy: s.nonEmptyString("The official metric used to sort sectors, such as percent or rp_net."),
        sortDirection: s.stringEnum("The sort direction.", ["asc", "desc"]),
        page,
        pageSize: s.integer("The number of sectors to return, up to 30.", {
          minimum: 1,
          maximum: 30,
        }),
      },
      { optional: ["sectorType", "sortBy", "sortDirection", "page", "pageSize"] },
    ),
  ),
  readAction(
    "get_sector_constituents",
    "Get and rank the constituents of an A-share index or virtual sector.",
    s.object(
      "The input payload for retrieving sector constituents.",
      {
        sectorSymbol: s.nonEmptyString("The index or virtual-sector symbol, such as sh000001."),
        fields: s.array(
          "Optional official response fields.",
          s.nonEmptyString("An official response field name without commas.", {
            pattern: "^[^,]+$",
          }),
          { minItems: 1, uniqueItems: true },
        ),
        sortBy: s.nonEmptyString("The official field used to sort constituents."),
        sortDirection: s.stringEnum("The sort direction.", ["asc", "desc"]),
        page,
        pageSize,
        includeNewStocks: s.boolean("Whether to include newly listed stocks."),
        includeRecentStocks: s.boolean("Whether to include recently listed stocks."),
      },
      {
        optional: ["fields", "sortBy", "sortDirection", "page", "pageSize", "includeNewStocks", "includeRecentStocks"],
      },
    ),
  ),
  readAction(
    "list_strong_sectors",
    "List strong A-share concept, industry, or regional sectors.",
    s.object(
      "The input payload for listing strong sectors.",
      {
        boardGroup: s.stringEnum("The board group used to filter stocks.", ["all", "growth", "other"]),
        sectorType: s.stringEnum("The sector classification to return.", ["concept", "industry", "region"]),
        excludeSt: s.boolean("Whether to exclude ST stocks."),
      },
      { optional: ["boardGroup", "sectorType", "excludeSt"] },
    ),
  ),
  noInputAction("list_limit_up_stocks", "List the current A-share limit-up pool."),
  noInputAction("list_consecutive_limit_up_stocks", "List A-shares currently in the consecutive-limit-up pool."),
  readAction(
    "list_hot_stocks",
    "List daily or hourly popular stocks and funds.",
    s.object(
      "The input payload for listing popular instruments.",
      {
        period: s.stringEnum("The popularity ranking period.", ["day", "hour"]),
        market: s.nonEmptyString("The optional market filter, such as cn, hk, us, or fund."),
        page,
        pageSize,
      },
      { optional: ["market", "page", "pageSize"] },
    ),
  ),
  readAction(
    "get_batch_forex_quotes",
    "Get current quotes for multiple target currencies against one base currency.",
    s.object("The input payload for retrieving multiple currency-pair quotes.", {
      baseCurrency: s.nonEmptyString("The uppercase ISO 4217 base-currency code, such as USD.", {
        pattern: "^[A-Z]{3}$",
      }),
      targetCurrencies: s.array(
        "Uppercase ISO 4217 target-currency codes, such as CNY and JPY.",
        s.string("An uppercase ISO 4217 target-currency code.", {
          pattern: "^[A-Z]{3}$",
        }),
        { minItems: 1, uniqueItems: true },
      ),
    }),
  ),
  readAction(
    "get_futures_quote",
    "Get the latest quote for a domestic, global, or Chinese financial futures contract.",
    s.object("The input payload for retrieving a futures quote.", {
      market: s.stringEnum("The futures market.", ["domestic", "global", "financial"]),
      symbol: s.nonEmptyString("The futures contract symbol, such as CHA50CFD."),
    }),
  ),
  readAction(
    "search_stock_news",
    "Search news for one A-share, Hong Kong, or US-listed stock.",
    s.object(
      "The input payload for searching stock-specific news.",
      {
        market: s.stringEnum("The market containing the stock.", ["cn", "hk", "us"]),
        symbol: s.nonEmptyString("The market-specific stock symbol."),
        page,
        pageSize: s.integer("The number of news items per page, up to 20.", {
          minimum: 1,
          maximum: 20,
        }),
      },
      { optional: ["page", "pageSize"] },
    ),
  ),
  readAction(
    "search_flash_news",
    "Search Sina Finance market flashes by one or more keywords.",
    s.object(
      "The input payload for searching market flashes.",
      {
        keywords: s.array(
          "One to ten keywords to search for.",
          s.nonEmptyString("A keyword containing at most 15 characters and no commas.", {
            maxLength: 15,
            pattern: "^[^,]+$",
          }),
          { minItems: 1, maxItems: 10 },
        ),
        page,
        pageSize: s.integer("The number of flashes per page, up to 20.", {
          minimum: 1,
          maximum: 20,
        }),
      },
      { optional: ["page", "pageSize"] },
    ),
  ),
  readAction(
    "list_flash_news",
    "List the latest Sina Finance market flashes or page around a known document ID.",
    s.object(
      "The input payload for listing market flashes.",
      {
        documentId: s.nonEmptyString("A flash document ID used as the pagination anchor."),
        direction: s.stringEnum("Whether to list flashes after or before the anchor.", ["after", "before"]),
        page,
        pageSize,
      },
      { optional: ["documentId", "direction", "page", "pageSize"] },
    ),
  ),
  readAction(
    "get_news_article",
    "Get the title, publication time, and body of one Sina Finance article.",
    s.object("The input payload for retrieving a news article.", {
      documentId: s.nonEmptyString("The article document ID returned by a news action."),
    }),
  ),
  fundAction("get_fund_profile", "Get a fund's profile, classification, manager, scale, and investment mandate."),
  fundAction("get_fund_net_values", "Get historical unit and cumulative net values for a fund."),
  fundAction("get_fund_returns", "Get cumulative returns and peer rankings for a fund."),
  fundAction("get_fund_metrics", "Get core performance and risk metrics for a fund."),
  readAction(
    "get_fund_stock_holdings",
    "Get the major stock holdings of a fund.",
    s.object(
      "The input payload for retrieving fund stock holdings.",
      { symbol: fundSymbol, page, pageSize },
      { optional: ["page", "pageSize"] },
    ),
  ),
  fundAction(
    "get_fund_industry_allocation",
    "Get a fund's industry allocation and changes from the prior reporting period.",
  ),
  fundAction("get_fund_asset_allocation", "Get a fund's asset allocation."),
  readAction(
    "get_fund_manager",
    "Get the background and historical average return of a fund manager.",
    s.object("The input payload for retrieving a fund-manager profile.", {
      managerCode: s.nonEmptyString("The manager code returned by get_fund_profile."),
    }),
  ),
];
