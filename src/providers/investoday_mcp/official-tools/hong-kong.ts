import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const hongKongOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "list_hk_stock_dividends",
    toolName: "list_hk_stock_dividends",
    description: "List Hong Kong stock dividends data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_dividends operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_dividends.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_dividends.", { minLength: 1 }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_dividends.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_dividends.", { minimum: 1 }),
          [1],
        ),
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_dividends."), [
          "00001",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_adjusted_quotes",
    toolName: "list_hk_stock_adjusted_quotes",
    description: "List Hong Kong stock adjusted quotes data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_adjusted_quotes operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_adjusted_quotes.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_adjusted_quotes.", {
            minLength: 1,
          }),
          ["2025-01-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_adjusted_quotes.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_adjusted_quotes.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_adjusted_quotes."),
          ["00001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_balance_sheet",
    toolName: "list_hk_stock_balance_sheet",
    description: "List Hong Kong stock balance sheet data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_balance_sheet operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_balance_sheet.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_balance_sheet.", {
            minLength: 1,
          }),
          ["2025-03-30"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_balance_sheet.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_balance_sheet.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_balance_sheet."),
          ["002594"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_hk_stock_basic_info",
    toolName: "get_hk_stock_basic_info",
    description: "Get Hong Kong stock basic info data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_hk_stock_basic_info operation.",
      {
        stockCodes: s.withExamples(
          s.array("Stock codes Accepted by Investoday for get_hk_stock_basic_info.", s.string("One stockCode value.")),
          [["00001", "00004"]],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_hk_stock_basic_info.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_hk_stock_basic_info.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_capital_changes",
    toolName: "list_hk_stock_capital_changes",
    description: "List Hong Kong stock capital changes data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_capital_changes operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_capital_changes.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_capital_changes.", {
          minLength: 1,
        }),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_capital_changes.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_capital_changes.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_capital_changes."),
          ["00001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_cash_flows",
    toolName: "list_hk_stock_cash_flows",
    description: "List Hong Kong stock cash flows data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_cash_flows operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_cash_flows.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_cash_flows.", {
            minLength: 1,
          }),
          ["2025-03-30"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_cash_flows.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_cash_flows.", { minimum: 1 }),
          [1],
        ),
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_cash_flows."), [
          "002594",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_income_statements",
    toolName: "list_hk_stock_income_statements",
    description: "List Hong Kong stock income statements data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_income_statements operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_income_statements.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_income_statements.", {
            minLength: 1,
          }),
          ["2025-03-30"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_income_statements.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_income_statements.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_income_statements."),
          ["002594"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_hk_stock_name_change",
    toolName: "get_hk_stock_name_change",
    description: "Get Hong Kong stock name change data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_hk_stock_name_change operation.",
      {
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for get_hk_stock_name_change."), [
          "00001",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_oscillator_indicators",
    toolName: "list_hk_stock_oscillator_indicators",
    description: "List Hong Kong stock oscillator indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_oscillator_indicators operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_oscillator_indicators.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.date(
          "End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_oscillator_indicators.",
          { minLength: 1 },
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_oscillator_indicators.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_oscillator_indicators.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_oscillator_indicators."),
          ["002594"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_price_volume_indicators",
    toolName: "list_hk_stock_price_volume_indicators",
    description: "List Hong Kong stock price volume indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_price_volume_indicators operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_price_volume_indicators.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.date(
          "End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_price_volume_indicators.",
          { minLength: 1 },
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_price_volume_indicators.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_price_volume_indicators.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_price_volume_indicators."),
          ["00001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_hk_stock_range_change",
    toolName: "get_hk_stock_range_change",
    description: "Get Hong Kong stock range change data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_hk_stock_range_change operation.",
      {
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for get_hk_stock_range_change."),
          ["00001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_hk_stock_strength_trend_indicators",
    toolName: "list_hk_stock_strength_trend_indicators",
    description: "List Hong Kong stock strength trend indicators data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_hk_stock_strength_trend_indicators operation.",
      {
        beginDate: s.withExamples(
          s.date(
            "Start date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_strength_trend_indicators.",
            { minLength: 1 },
          ),
          ["2020-01-01"],
        ),
        endDate: s.date(
          "End date in YYYY-MM-DD format Accepted by Investoday for list_hk_stock_strength_trend_indicators.",
          { minLength: 1 },
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_hk_stock_strength_trend_indicators.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_hk_stock_strength_trend_indicators.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_hk_stock_strength_trend_indicators."),
          ["00001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_hk_stock_transfers",
    toolName: "get_hk_stock_transfers",
    description: "Get Hong Kong stock transfers data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_hk_stock_transfers operation.",
      {
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for get_hk_stock_transfers."), [
          "00001",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_hk_stock_turnrate",
    toolName: "get_hk_stock_turnrate",
    description: "Get Hong Kong stock turnrate data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_hk_stock_turnrate operation.",
      {
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for get_hk_stock_turnrate."), [
          "00001",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_hk_stock_valuations",
    toolName: "get_hk_stock_valuations",
    description: "Get Hong Kong stock valuations data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_hk_stock_valuations operation.",
      {
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for get_hk_stock_valuations."), [
          "00001",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
