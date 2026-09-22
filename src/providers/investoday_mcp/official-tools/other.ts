import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const otherOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "search",
    toolName: "search",
    description: "Search securities, funds, indices, industries and concepts by name or code.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for search.",
      {
        key: s.string("Search keyword, such as a company name or security code."),
        type: s.nonEmptyString(
          "Comma-separated search types: 11 A-shares, 12 indices, 13 ETF benchmarks, 21 funds, 22 ETFs, 23 LOFs, 27 fund managers, 28 fund companies, 29 fund themes, 31 Hong Kong stocks, 71/72 Shenwan level 1/2 industries, 81/82 Juyuan/Cailian concepts.",
        ),
        pageNum: s.integer("Page number, starting at 1.", { minimum: 1 }),
        pageSize: s.integer("Records per page, from 1 to 500.", { minimum: 1, maximum: 500 }),
      },
      { required: ["type"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_market_change_ratio_status",
    toolName: "get_market_change_ratio_status",
    description: "Get current market breadth, including rising, falling and limit-up or limit-down stock counts.",
    operationType: "read",
    inputSchema: s.object("Arguments for get_market_change_ratio_status.", {}, { required: [] }),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_fund_quote_realtime",
    toolName: "get_fund_quote_realtime",
    description: "Get fund quote realtime data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_fund_quote_realtime operation.",
      {
        fundCode: s.withExamples(s.nonEmptyString("Fund code Accepted by Investoday for get_fund_quote_realtime."), [
          "159001",
        ]),
      },
      { required: ["fundCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_industry_realtime_quote",
    toolName: "get_industry_realtime_quote",
    description: "Get industry realtime quote data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_industry_realtime_quote operation.",
      {
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for get_industry_realtime_quote."),
          ["330000"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_ind_real_quote_v2",
    toolName: "list_ind_real_quote_v2",
    description: "List indicator real quote v2 data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_ind_real_quote_v2 operation.",
      {
        sortColumn: s.withExamples(
          s.nonEmptyString("Column used to sort the result Accepted by Investoday for list_ind_real_quote_v2."),
          ["changeRatio"],
        ),
        industryType: s.withExamples(
          s.nonEmptyString("Industry classification type Accepted by Investoday for list_ind_real_quote_v2."),
          ["SW"],
        ),
        industryLevel: s.withExamples(
          s.integer("Industry classification level Accepted by Investoday for list_ind_real_quote_v2."),
          [1],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_ind_real_quote_v2.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        industryCodes: s.array(
          "Industry codes Accepted by Investoday for list_ind_real_quote_v2.",
          s.string("One industryCode value."),
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_ind_real_quote_v2.", { minimum: 1 }),
          [1],
        ),
        order: s.withExamples(s.nonEmptyString("Sort order Accepted by Investoday for list_ind_real_quote_v2."), [
          "desc",
        ]),
      },
      { required: ["sortColumn"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_industry_stock_realtime_quote",
    toolName: "get_industry_stock_realtime_quote",
    description: "Get industry stock realtime quote data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_industry_stock_realtime_quote operation.",
      {
        sortColumn: s.withExamples(
          s.nonEmptyString(
            "Column used to sort the result Accepted by Investoday for get_industry_stock_realtime_quote.",
          ),
          ["changeRatio"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_industry_stock_realtime_quote."),
          [10],
        ),
        page: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_industry_stock_realtime_quote."),
          [1],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for get_industry_stock_realtime_quote."),
          ["740000"],
        ),
        order: s.withExamples(
          s.stringEnum("Sort order Accepted by Investoday for get_industry_stock_realtime_quote.", ["asc", "desc"]),
          ["desc"],
        ),
      },
      { required: ["industryCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_stk_unwind_sig_stat",
    toolName: "get_stk_unwind_sig_stat",
    description: "Get stock unwind sig stat data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday get_stk_unwind_sig_stat operation.",
        {
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for get_stk_unwind_sig_stat.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for get_stk_unwind_sig_stat.", { minimum: 1 }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_stk_unwind_signal_de",
    toolName: "list_stk_unwind_signal_de",
    description: "List stock unwind signal de data from Investoday.",
    operationType: "read",
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        "Arguments for the Investoday list_stk_unwind_signal_de operation.",
        {
          beginDate: s.withExamples(
            s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_stk_unwind_signal_de.", {
              minLength: 1,
            }),
            ["2020-01-01"],
          ),
          endDate: s.withExamples(
            s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_stk_unwind_signal_de.", {
              minLength: 1,
            }),
            ["2025-01-01"],
          ),
          stockCodes: s.withExamples(
            s.array("Stock codes Supply exactly one of stockCodes or stockCode.", s.string("One stockCode value."), {
              minItems: 1,
            }),
            [["000001", "600519"]],
          ),
          pageSize: s.withExamples(
            s.integer("Number of records per page Accepted by Investoday for list_stk_unwind_signal_de.", {
              minimum: 1,
              maximum: 500,
            }),
            [10],
          ),
          pageNum: s.withExamples(
            s.integer("Page number, starting at 1 Accepted by Investoday for list_stk_unwind_signal_de.", {
              minimum: 1,
            }),
            [1],
          ),
          stockCode: s.withExamples(s.nonEmptyString("Stock code Supply exactly one of stockCode or stockCodes."), [
            "002594",
          ]),
        },
        { required: [] },
      ),
      ["stockCode", "stockCodes"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
