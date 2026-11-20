import type { TongdaxinReadOnlyToolName } from "./actions.ts";

import { compactObject } from "../../core/cast.ts";
import { providerInputError } from "../provider-runtime.ts";

export interface TongdaxinNamedToolCall {
  toolName: TongdaxinReadOnlyToolName;
  arguments: Record<string, unknown>;
}

type NamedActionInput = Record<string, unknown>;

const lookupRanges = {
  A_SHARE: "AG",
  HK_STOCK: "HK-GP",
  HK_FUND: "HK-JJ",
  FUND: "JJ",
  US_STOCK: "MG-GP",
  INDEX: "ZS",
  FUTURES: "QH",
  OPTION: "QQ",
} as const;

const indicatorRanges = {
  A_SHARE: "AG",
  INDEX: "ZS",
  FUND: "JJ",
} as const;

const screenRanges = {
  screen_stocks: "AG",
  screen_hk_stocks: "HK-GP",
  screen_funds: "JJ",
  screen_indices: "ZS",
  screen_fund_managers: "ZG-JJJL",
} as const;

const klinePeriods = {
  "5_SECONDS": "12",
  "1_MINUTE": "7",
  "5_MINUTES": "0",
  "15_MINUTES": "1",
  "30_MINUTES": "2",
  "1_HOUR": "3",
  "DAILY": "4",
  "WEEKLY": "5",
  "MONTHLY": "6",
  "QUARTERLY": "10",
  "YEARLY": "11",
} as const;

const adjustments = {
  NONE: "0",
  FORWARD: "1",
  BACKWARD: "2",
} as const;

const companyProfileSections = {
  OVERVIEW: {
    entry: "TdxSharePCCW.tdxf10_gg_zxts",
    fixedTag: "gsgy",
  },
  BASIC_INFORMATION: {
    entry: "TdxSharePCCW.tdxf10_gg_gsgk",
    fixedTag: "0",
  },
  ISSUANCE_AND_TRADING: {
    entry: "TdxSharePCCW.tdxf10_gg_gsgk",
    fixedTag: "8",
  },
  EXECUTIVES: {
    entry: "TdxSharePCCW.tdxf10_gg_gsgk",
    fixedTag: "20",
  },
  AFFILIATES: {
    entry: "TdxSharePCCW.tdxf10_gg_gsgk",
    fixedTag: "3",
  },
  EMPLOYEE_STRUCTURE: {
    entry: "TdxSharePCCW.tdxf10_gg_gsgk",
    fixedTag: "4",
  },
  EMPLOYEE_EFFICIENCY: {
    entry: "TdxSharePCCW.tdxf10_gg_gsgk",
    fixedTag: "5",
  },
} as const;

const shareholderSections = {
  CONTROLLING_SHAREHOLDER: "kggd",
  SHAREHOLDER_COUNT: "gdrs",
  SHAREHOLDER_COUNT_RANK: "thygdrs",
  TOP_FLOAT_SHAREHOLDERS: "ltgd",
  TOP_SHAREHOLDERS: "sdgdbgq",
} as const;

const dividendSections = {
  OVERVIEW: "pxmz",
  DIVIDEND_CHART: "fh_zzt",
  RIGHTS_ISSUE_PLAN: "pf",
  PLACEMENT_DETAIL: "zfpg",
  REFINANCING_PLAN: "zf",
  PAYOUT_HISTORY: "fhlszs_glzfl",
  YIELD_HISTORY: "fhlszs_gxl",
  PAYOUT_RANK: "fhpm_glzfl",
  YIELD_RANK: "fhpm_gxl",
  CASH_FINANCING_RATIO_RANK: "fhpm_pxrzb",
} as const;

const shareCapitalSections = {
  STRUCTURE: "gbjg",
  CHANGES: "gbbd",
  RESTRICTED_UNLOCKS: "xslt",
  STOCK_BUYBACK: "gphg",
} as const;

const hotTopicSections = {
  BOARD_FAMILY: "zttzbkz",
  THEME_LIBRARY: "zttzztk",
  EVENT_DRIVEN: "sjcd",
  INFORMATION_OVERVIEW: "xxmmg",
} as const;

const hkFinancialSections = {
  INCOME_STATEMENT: "1",
  BALANCE_SHEET: "2",
  CASH_FLOW_STATEMENT: "3",
} as const;

type TongdaxinNamedActionRoute = (input: NamedActionInput) => TongdaxinNamedToolCall;

const tongdaxinNamedActionRoutes: Record<string, TongdaxinNamedActionRoute> = {
  lookup_security: (input) =>
    toolCall("tdx_lookup_stock", {
      query: input.query,
      range: lookupRanges[input.market as keyof typeof lookupRanges],
    }),
  get_quotes: (input) =>
    toolCall("tdx_quotes", {
      code: input.code,
      setcode: input.marketCode,
      bspNum: input.orderBookDepth,
      hasProInfo: booleanFlag(input.includeProfessionalData),
      hasCwInfo: booleanFlag(input.includeFinancialData),
      hasStatInfo: booleanFlag(input.includeStatistics),
      statParam: input.statisticParameter,
    }),
  get_kline: (input) =>
    toolCall("tdx_kline", {
      code: input.code,
      setcode: input.marketCode,
      period: klinePeriods[input.period as keyof typeof klinePeriods],
      wantNum: input.count,
      startxh: input.offset,
      tqFlag: adjustments[input.adjustment as keyof typeof adjustments],
      hasIpoPrice: booleanFlag(input.includeIpoPrice),
    }),
  query_indicators: (input) =>
    toolCall("tdx_indicator_select", {
      message: input.query,
      rang: indicatorRanges[input.market as keyof typeof indicatorRanges],
    }),
  screen_stocks: (input) => screenToolCall("screen_stocks", input),
  screen_hk_stocks: (input) => screenToolCall("screen_hk_stocks", input),
  screen_funds: (input) => screenToolCall("screen_funds", input),
  screen_indices: (input) => screenToolCall("screen_indices", input),
  screen_fund_managers: (input) => screenToolCall("screen_fund_managers", input),
  search_news: (input) => wendaToolCall("wenda_news_query", input),
  search_announcements: (input) => wendaToolCall("wenda_notice_query", input),
  search_reports: (input) => wendaToolCall("wenda_report_query", input),
  query_macro_data: (input) => toolCall("wenda_macro_query", { query: input.query }),
  get_financial_statements: (input) => toolCall("tdx_api_data", financialStatementArguments(input)),
  get_company_profile: (input) => {
    const route = companyProfileSections[input.section as keyof typeof companyProfileSections];
    return toolCall("tdx_api_data", { ...route, code: input.code });
  },
  get_shareholder_research: (input) =>
    toolCall("tdx_api_data", {
      entry: "TdxSharePCCW.tdxf10_gg_gdyj",
      code: input.code,
      fixedTag: shareholderSections[input.section as keyof typeof shareholderSections],
      pageNo: input.page,
      pageSize: input.pageSize,
    }),
  get_institutional_holdings: (input) => toolCall("tdx_api_data", institutionalHoldingArguments(input)),
  get_capital_and_trading_data: (input) => toolCall("tdx_api_data", capitalAndTradingArguments(input)),
  get_dividends_and_financing: (input) =>
    toolCall("tdx_api_data", {
      entry: "TdxSharePCCW.tdxf10_gg_fhrz",
      code: input.code,
      fixedTag: dividendSections[input.section as keyof typeof dividendSections],
    }),
  get_share_capital: (input) =>
    toolCall("tdx_api_data", {
      entry: "TdxSharePCCW.tdxf10_gg_gbjg",
      code: input.code,
      fixedTag: shareCapitalSections[input.section as keyof typeof shareCapitalSections],
    }),
  get_valuation_and_ranking: (input) => toolCall("tdx_api_data", valuationAndRankingArguments(input)),
  get_board_and_industry_data: (input) => toolCall("tdx_api_data", boardAndIndustryArguments(input)),
  get_hot_topics: (input) =>
    toolCall("tdx_api_data", {
      entry: "TdxSharePCCW.tdxf10_gg_rdtc",
      code: input.code,
      fixedTag: hotTopicSections[input.section as keyof typeof hotTopicSections],
    }),
  get_hk_financials: (input) =>
    toolCall("tdx_api_data", {
      entry: "TdxSharePCCW.skef10_hk_cwfx",
      code: input.code,
      fixedTag: hkFinancialSections[input.statement as keyof typeof hkFinancialSections],
    }),
};

export function isTongdaxinNamedActionName(value: string): boolean {
  return value in tongdaxinNamedActionRoutes;
}

export function resolveTongdaxinNamedToolCall(actionName: string, input: NamedActionInput): TongdaxinNamedToolCall {
  return tongdaxinNamedActionRoutes[actionName](input);
}

function screenToolCall(actionName: keyof typeof screenRanges, input: NamedActionInput) {
  return toolCall("tdx_screener", {
    message: input.criteria,
    rang: screenRanges[actionName],
    pageNo: input.page,
    pageSize: input.pageSize,
  });
}

function toolCall(toolName: TongdaxinReadOnlyToolName, arguments_: Record<string, unknown>): TongdaxinNamedToolCall {
  return { toolName, arguments: compactObject(arguments_) };
}

function booleanFlag(value: unknown) {
  return typeof value === "boolean" ? (value ? "1" : "0") : undefined;
}

function wendaToolCall(
  toolName: "wenda_news_query" | "wenda_notice_query" | "wenda_report_query",
  input: NamedActionInput,
) {
  return toolCall(toolName, {
    query: input.query,
    name: input.name,
    symbol: input.symbol,
    bdate: input.startDate,
    edate: input.endDate,
    keywords: input.keywords,
    desc: input.context,
  });
}

function financialStatementArguments(input: NamedActionInput) {
  const reportTag = input.reportView === "SINGLE_QUARTER" ? "00102" : "00101";
  switch (input.statement) {
    case "INCOME_STATEMENT":
      return {
        entry: "TdxShareCW.ph_agf10_cw_lyb",
        code: input.code,
        fixedTag: reportTag,
      };
    case "BALANCE_SHEET":
      return { entry: "TdxShareCW.ph_agf10_cw_zcfzb", code: input.code };
    case "CASH_FLOW_STATEMENT":
      return {
        entry: "TdxShareCW.ph_agf10_cw_xjllb",
        code: input.code,
        fixedTag: reportTag,
      };
    default:
      throw unsupportedSection("financial statement", input.statement);
  }
}

function institutionalHoldingArguments(input: NamedActionInput) {
  const common = { code: input.code, pageNo: input.page, pageSize: input.pageSize };
  switch (input.section) {
    case "AVAILABLE_DATES":
      return {
        entry: "TdxSharePCCW.tdxf10_gg_comreq",
        ...common,
        fixedTag: "jgcg",
      };
    case "SUMMARY":
      return {
        entry: "TdxSharePCCW.tdxf10_gg_gdyj",
        ...common,
        fixedTag: "jgcg",
      };
    case "OVERVIEW":
      return {
        entry: "TdxSharePCCW.tdxf10_gg_gdyj",
        ...common,
        fixedTag: "jgcgz",
        reportDate: input.reportDate,
      };
    case "DETAIL":
      return {
        entry: "TdxSharePCCW.tdxf10_gg_gdyj_jgcgmx",
        ...common,
        reportDate: input.reportDate,
        sortType: input.sort,
        typeValue: input.institutionType,
      };
    case "NORTHBOUND_FUNDS":
      return {
        entry: "TdxSharePCCW.tdxf10_gg_zlcc",
        ...common,
        fixedTag: "bszj",
        date: input.date,
      };
    case "PRICE_COMPARISON":
      return {
        entry: "TdxShareCW.ph_agf10_gbgd_jgcc",
        ...common,
        queryKey: "00101",
        compareFlag: input.comparison,
      };
    default:
      throw unsupportedSection("institutional holdings", input.section);
  }
}

function capitalAndTradingArguments(input: NamedActionInput) {
  const code = input.code;
  switch (input.section) {
    case "CAPITAL_FLOW":
      return dataSection("TdxSharePCCW.tdxf10_gg_jyds", code, "zjlx");
    case "NORTHBOUND_FUNDS":
      return {
        ...dataSection("TdxSharePCCW.tdxf10_gg_zlcc", code, "bszj"),
        date: input.date,
      };
    case "BLOCK_TRADE":
      return {
        ...dataSection("TdxSharePCCW.tdxf10_gg_jyds", code, "dzjy"),
        extra: input.date,
      };
    case "BLOCK_TRADE_INTENTION":
      return dataSection("TdxSharePCCW.tdxf10_gg_jyds", code, "yxsbxx");
    case "MARGIN_TRADING":
      return dataSection("TdxSharePCCW.tdxf10_gg_jyds", code, "rzrq");
    case "REFINANCING":
      return dataSection("TdxSharePCCW.tdxf10_gg_jyds", code, "zrq");
    case "LIMIT_UP_ANALYSIS":
      return dataSection("TdxSharePCCW.tdxf10_gg_jyds", code, "ztfx");
    case "LIMIT_DOWN_ANALYSIS":
      return dataSection("TdxSharePCCW.tdxf10_gg_jyds", code, "dtfx");
    case "SHAREHOLDER_CHANGE":
      return {
        ...dataSection("TdxSharePCCW.tdxf10_gg_gdyj", code, "cgbd"),
        beginDate: input.startDate,
        endDate: input.endDate,
        pageNo: input.page,
        pageSize: input.pageSize,
      };
    case "TOP_SHAREHOLDER_DETAIL":
      return {
        mode: "code-sort-report-type-click-page",
        entry: "TdxSharePCCW.tdxf10_gg_gdyj_jgcgmx",
        code,
        reportDate: input.reportDate,
        sortType: input.sort,
        typeValue: input.shareholderType,
        clickIndex: input.selectedIndex,
        pageNo: input.page,
        pageSize: input.pageSize,
        responseTransform: { kind: "preset", preset: "top_shareholder_detail" },
      };
    default:
      throw unsupportedSection("capital and trading", input.section);
  }
}

function valuationAndRankingArguments(input: NamedActionInput) {
  switch (input.section) {
    case "VALUATION_HISTORY":
      return {
        entry: "TdxShareCW.ph_agf10_gzfx",
        code: input.code,
        extraOne: input.timeRange,
        extraTwo: input.valuationMetric,
      };
    case "INDUSTRY_FINANCIAL_RANK":
      return {
        entry: "TdxShareCW.ph_agf10_hypm",
        code: input.code,
        queryKey: "00102",
        extra: input.reportDate,
      };
    case "INDUSTRY_VALUATION_RANK":
      return {
        entry: "TdxShareCW.ph_agf10_hypm",
        code: input.code,
        queryKey: "00105",
        extra: input.reportDate,
      };
    case "FINANCIAL_SECTOR_INDICATORS":
      return {
        entry: "TdxShareCW.ph_agf10_cw_zxzbxq",
        code: input.code,
        extra: input.reportDate,
      };
    case "BOARD_RELATIVE_VALUATION":
      return {
        entry: "TdxSharePCCW.skef10_hy_hydw_gzsppm",
        queryType: "01",
        targetCode: input.boardCode,
        stockCode: input.code,
      };
    case "BOARD_HISTORY_VALUATION":
      return {
        entry: "TdxSharePCCW.skef10_hy_hydw_gzsppm",
        queryType: "02",
        targetCode: input.boardCode,
        stockCode: "",
      };
    default:
      throw unsupportedSection("valuation and ranking", input.section);
  }
}

function boardAndIndustryArguments(input: NamedActionInput) {
  switch (input.section) {
    case "BOARD_BASIC_INFORMATION":
      return boardSection(input.code, "001", "");
    case "BOARD_DETAIL":
      return boardSection(input.code, "002", "");
    case "BOARD_STAGE_RETURN":
      return boardSection(input.code, "003", input.period ?? "1m");
    case "BOARD_MARKET_STATISTICS":
      return boardSection(input.code, "004", "");
    case "INDUSTRY_CHAIN":
      return {
        entry: "TdxSharePCCW.cfg_tk_gethy",
        industryCode: input.code,
      };
    case "INDUSTRY_IMPORTANT_EVENTS":
      return {
        entry: "TdxSharePCCW.skef10_hy_zxdt_hyzysj",
        industryCode: input.code,
        title: input.title,
      };
    default:
      throw unsupportedSection("board and industry", input.section);
  }
}

function dataSection(entry: string, code: unknown, fixedTag: string) {
  return { entry, code, fixedTag };
}

function boardSection(code: unknown, branch: string, timeType: unknown) {
  return {
    entry: "TdxSharePCCW.skef10_bk_cpbd_jczl",
    code,
    branch,
    timeType,
  };
}

function unsupportedSection(label: string, value: unknown) {
  return providerInputError(`unsupported Tongdaxin ${label} section: ${String(value)}`);
}
